"use client";

import { useState } from "react";
import Papa from "papaparse";
import { commitImport, getExistingKeys } from "@/actions/imports";
import { detectColumns, buildRows, summarize, type ColumnMapping, type ParsedRow } from "@/lib/csv";
import { looksLikeBrokerStatement } from "@/lib/csv/broker";
import { checkCanonicalHeader } from "@/lib/csv/prompt";
import { countDataRows, controlSums, reconcile } from "@/lib/csv/integrity";

/** SHA-256 of the file's text, so the same file is recognisable later. */
async function sha256(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Upload → map columns → preview → import (MVP_SPEC §7).
 *
 * Nothing is written until the preview has been seen, and the mapping is
 * guessed from the headers so the common case needs no work.
 */
export default function CsvImportForm({ accounts }: { accounts: { id: string; name: string }[] }) {
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [raw, setRaw] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<ColumnMapping>({ date: "" });
  const [existing, setExisting] = useState<Set<string>>(new Set());
  const [fileHash, setFileHash] = useState("");
  const [rowsInFile, setRowsInFile] = useState(0);
  const [adjustBalance, setAdjustBalance] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{
    created: number;
    net: number;
    categorised?: number;
  } | null>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !accountId) return;

    const text = await file.text();
    const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
    const cols = parsed.meta.fields ?? [];

    // Measured from the raw bytes, before anything is interpreted. A statement
    // that passed through an AI can lose a row silently, and you cannot see the
    // transaction that isn't there — so the file is counted independently of
    // the parser and the two are compared.
    setFileHash(await sha256(text));
    setRowsInFile(countDataRows(text));

    setFileName(file.name);
    setHeaders(cols);
    setRaw(parsed.data);
    setMapping(detectColumns(cols));
    setExisting(new Set(await getExistingKeys(accountId)));
    setResult(null);
  }

  const rows: ParsedRow[] = mapping.date ? buildRows(raw, mapping, existing) : [];
  const stats = summarize(rows);
  const importable = rows.filter((r) => r.problem === null && !r.duplicate);

  // The canonical format carries a category column; other banks rarely do.
  const categoryColumn = headers.find((h) => h.trim().toLowerCase() === "category");

  // Catches the markdown fence an AI leaves around its answer, which otherwise
  // shows up as an unreadable first row and no obvious cause.
  const headerProblem = headers.length > 0 ? checkCanonicalHeader(headers.join(",")) : null;
  const fenceLeftIn = headers.some((h) => h.trim().startsWith("```"));

  /**
   * A broker export in the bank importer.
   *
   * This happened, with 219 rows: every buy became an expense, every sell and
   * dividend became income, the import reported success, and the portfolio
   * tables stayed empty because instruments were never stored. The file was
   * fine — it was in the wrong form on the right page.
   */
  const looksLikeBroker = looksLikeBrokerStatement(headers);

  // What the file said vs what the parser understood.
  const sums = controlSums(rows.map((r) => r.amount ?? NaN));
  const discrepancies =
    rows.length > 0
      ? reconcile({
          rowsInFile,
          rowsParsed: rows.length,
          duplicates: stats.duplicates,
          invalid: stats.invalid,
        })
      : [];

  async function doImport() {
    setBusy(true);
    try {
      const res = await commitImport(
        accountId,
        fileName,
        importable.map((r) => ({
          date: r.date!.toISOString(),
          amount: r.amount!,
          description: r.description,
          merchant: r.merchant,
          // Only used if it matches a category that already exists.
          category: r.raw[categoryColumn ?? ""] ?? undefined,
        })),
        JSON.stringify(mapping),
        adjustBalance,
        {
          fileHash,
          rowsInFile,
          debitTotal: sums.debits,
          creditTotal: sums.credits,
        }
      );
      setResult({ created: res.created, net: res.net, categorised: res.categorised });
      setRaw([]);
      setHeaders([]);
      setFileName("");
    } finally {
      setBusy(false);
    }
  }

  const columnSelect = (
    label: string,
    key: keyof ColumnMapping,
    optional = false
  ) => (
    <label className="text-xs block">
      <span className="text-[var(--muted)]">{label}</span>
      <select
        className="input mt-1"
        value={(mapping[key] as string) ?? ""}
        onChange={(e) => setMapping({ ...mapping, [key]: e.target.value || undefined })}
      >
        <option value="">{optional ? "— none —" : "— pick a column —"}</option>
        {headers.map((h) => (
          <option key={h} value={h}>
            {h}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <div className="space-y-4">
      <select className="input" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
        {accounts.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>

      <input type="file" accept=".csv,text/csv" onChange={handleFile} className="input text-xs" />

      {result && (
        <div className="text-xs text-[var(--green)]">
          Imported {result.created} transactions (net {result.net.toFixed(2)})
          {result.categorised !== undefined && result.categorised > 0 && (
            <> · {result.categorised} categorised automatically</>
          )}
          . You can undo this below.
        </div>
      )}

      {/* The single most common failure when pasting an AI's answer. Naming it
          beats letting the first row show up as unreadable. */}
      {looksLikeBroker && (
        <div
          className="rounded-lg border p-3 text-xs space-y-1"
          style={{ borderColor: "var(--amber)" }}
        >
          <div style={{ color: "var(--amber)" }}>This looks like a broker export.</div>
          <p className="text-[var(--muted)] leading-snug">
            It names instruments and quantities, which this importer cannot store. Imported here,
            every purchase becomes an expense and every sale and dividend becomes income — the rows
            land, the cash flow goes wrong, and nothing appears in your portfolio.
          </p>
          <p className="text-[var(--muted)] leading-snug">
            Use <strong>Import the broker statement instead</strong>, higher up this page.
          </p>
        </div>
      )}

      {fenceLeftIn && (
        <div className="text-xs text-[var(--red)]">
          This file still has the ``` fence the AI wrapped its answer in. Open it in a text editor, delete the
          first and last lines, and upload again.
        </div>
      )}

      {!fenceLeftIn && headerProblem && !headerProblem.ok && categoryColumn === undefined && (
        <div className="text-xs text-[var(--muted)]">
          Not the app&apos;s own format — map the columns yourself below, or use the instruction above to
          convert the file first.
        </div>
      )}

      {headers.length > 0 && (
        <>
          <div className="grid grid-cols-2 gap-3">
            {columnSelect("Date column", "date")}
            {mapping.debit || mapping.credit ? (
              <>
                {columnSelect("Money out (debit)", "debit", true)}
                {columnSelect("Money in (credit)", "credit", true)}
              </>
            ) : (
              columnSelect("Amount column", "amount")
            )}
            {columnSelect("Description", "description", true)}
            {columnSelect("Merchant", "merchant", true)}
          </div>

          <button
            type="button"
            className="text-xs text-[var(--accent)] hover:underline"
            onClick={() =>
              setMapping(
                mapping.debit || mapping.credit
                  ? { ...mapping, debit: undefined, credit: undefined, amount: "" }
                  : { ...mapping, amount: undefined, debit: "", credit: "" }
              )
            }
          >
            {mapping.debit || mapping.credit
              ? "This file has one signed amount column instead"
              : "This file has separate debit and credit columns"}
          </button>

          {mapping.date && rows.length > 0 && (
            <>
              {/* Proof the file arrived intact. A dropped row is invisible by
                  nature — you cannot notice the transaction that isn't there —
                  so the count and the two sides are shown before writing. */}
              {discrepancies.length > 0 && (
                <div className="space-y-1">
                  {discrepancies.map((d, i) => (
                    <div
                      key={i}
                      className="text-xs"
                      style={{ color: d.level === "warn" ? "var(--red)" : "var(--muted)" }}
                    >
                      {d.level === "warn" ? "⚠ " : ""}
                      {d.message}
                    </div>
                  ))}
                </div>
              )}

              <div className="text-xs flex flex-wrap gap-x-4 gap-y-1">
                <span className="text-[var(--muted)]">
                  {rowsInFile} rows in file · out {sums.debits.toFixed(2)} · in{" "}
                  {sums.credits.toFixed(2)}
                </span>
              </div>

              <div className="text-xs flex flex-wrap gap-x-4 gap-y-1">
                <span className="text-[var(--green)]">{stats.importable} to import</span>
                {stats.duplicates > 0 && (
                  <span className="text-[var(--amber)]">{stats.duplicates} duplicates (skipped)</span>
                )}
                {stats.invalid > 0 && (
                  <span className="text-[var(--red)]">{stats.invalid} unreadable (skipped)</span>
                )}
                <span className="text-[var(--muted)]">net {stats.net.toFixed(2)}</span>
              </div>

              <div className="overflow-x-auto max-h-72 overflow-y-auto border border-[var(--border)] rounded-lg">
                <table className="data-table whitespace-nowrap text-xs">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Description</th>
                      <th className="text-right">Amount</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 200).map((r, i) => (
                      <tr key={i} style={r.problem || r.duplicate ? { opacity: 0.5 } : undefined}>
                        <td>{r.date ? r.date.toISOString().slice(0, 10) : "—"}</td>
                        <td className="max-w-[18rem] truncate">{r.description || r.merchant}</td>
                        <td
                          className={`text-right ${
                            (r.amount ?? 0) >= 0 ? "text-[var(--green)]" : "text-[var(--red)]"
                          }`}
                        >
                          {r.amount === null ? "—" : r.amount.toFixed(2)}
                        </td>
                        <td>
                          {r.problem ? (
                            <span className="text-[var(--red)]">{r.problem}</span>
                          ) : r.duplicate ? (
                            <span className="text-[var(--amber)]">Duplicate</span>
                          ) : (
                            <span className="text-[var(--green)]">OK</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {rows.length > 200 && (
                <div className="text-xs text-[var(--muted)]">
                  Showing the first 200 of {rows.length} rows; all of them will be imported.
                </div>
              )}

              <label className="flex items-start gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={adjustBalance}
                  onChange={(e) => setAdjustBalance(e.target.checked)}
                  className="mt-0.5"
                />
                <span className="text-[var(--muted)]">
                  Also add the net ({stats.net.toFixed(2)}) to the account balance. Leave this off when
                  importing past statements — the balance already includes those movements, and adding them
                  again would count the same money twice.
                </span>
              </label>

              <button
                type="button"
                onClick={doImport}
                disabled={busy || stats.importable === 0}
                className="btn w-full"
                style={busy || stats.importable === 0 ? { opacity: 0.5 } : undefined}
              >
                {busy ? "Importing…" : `Import ${stats.importable} transactions`}
              </button>
            </>
          )}

          {!mapping.date && (
            <div className="text-xs text-[var(--amber)]">
              Pick which column holds the date to see a preview.
            </div>
          )}
        </>
      )}
    </div>
  );
}

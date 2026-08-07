"use client";

import { useState } from "react";
import Papa from "papaparse";
import { commitImport, getExistingKeys } from "@/actions/imports";
import { detectColumns, buildRows, summarize, type ColumnMapping, type ParsedRow } from "@/lib/csv";

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
  const [adjustBalance, setAdjustBalance] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ created: number; net: number } | null>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !accountId) return;

    const text = await file.text();
    const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
    const cols = parsed.meta.fields ?? [];

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
        })),
        JSON.stringify(mapping),
        adjustBalance
      );
      setResult({ created: res.created, net: res.net });
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
          Imported {result.created} transactions (net {result.net.toFixed(2)}). You can undo this below.
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

"use client";

import { useMemo, useState } from "react";
import Papa from "papaparse";
import {
  commitInvestmentActivityImport,
  getExistingInvestmentFingerprints,
} from "@/actions/investmentActivity";
import {
  buildInvestmentConversionPrompt,
  INVESTMENT_ACTIVITY_COLUMNS,
  INVESTMENT_ACTIVITY_EXAMPLE,
  investmentActivityFingerprint,
  parseInvestmentActivity,
  type InvestmentActivityPreview,
} from "@/lib/investment-activity";

async function sha256(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export default function InvestmentActivityImporter({
  accounts,
  baseCurrency,
}: {
  accounts: { id: string; name: string; currency: string }[];
  baseCurrency: string;
}) {
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [promptOpen, setPromptOpen] = useState(true);
  const [copied, setCopied] = useState(false);
  const [mode, setMode] = useState<"file" | "text">("file");
  const [pasted, setPasted] = useState("");
  const [fileName, setFileName] = useState("");
  const [fileHash, setFileHash] = useState("");
  const [rowsInFile, setRowsInFile] = useState(0);
  const [preview, setPreview] = useState<InvestmentActivityPreview[]>([]);
  const [existing, setExisting] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const accountCurrency = accounts.find((account) => account.id === accountId)?.currency ?? baseCurrency;
  const prompt = useMemo(() => buildInvestmentConversionPrompt(accountCurrency), [accountCurrency]);

  const validRows = preview.flatMap((item) => (item.row ? [item.row] : []));
  const duplicates = validRows.filter((row) => existing.has(investmentActivityFingerprint(row))).length;
  const importable = validRows.filter((row) => !existing.has(investmentActivityFingerprint(row)));
  const invalid = preview.length - validRows.length;

  async function copyPrompt() {
    await navigator.clipboard.writeText(prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  /**
   * One reader for both ways in.
   *
   * A file and a pasted block are the same text arriving through different
   * doors, and giving each its own parser is how the two start disagreeing
   * about which columns are required. `label` is what the import history shows
   * and what Undo names, so a hand-typed batch is as reversible as a file.
   */
  async function ingest(text: string, label: string) {
    if (!accountId) return;
    if (text.trim() === "") {
      setPreview([]);
      setMessage({ kind: "error", text: "Nothing to read — the box is empty." });
      return;
    }

    const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
    const headers = (parsed.meta.fields ?? []).map((header) => header.trim().toLowerCase());
    const missing = INVESTMENT_ACTIVITY_COLUMNS.filter((column) => !headers.includes(column));
    if (missing.length > 0) {
      setPreview([]);
      setMessage({
        kind: "error",
        text: `Missing column${missing.length === 1 ? "" : "s"}: ${missing.join(", ")}. The first line has to be the header — "Start from an example" fills it in.`,
      });
      return;
    }

    const [hash, fingerprints] = await Promise.all([
      // Hashed from the text, so pasting the same rows twice is recognised as
      // the same batch exactly the way re-uploading a file is.
      sha256(text),
      getExistingInvestmentFingerprints(accountId),
    ]);
    setFileName(label);
    setFileHash(hash);
    setRowsInFile(parsed.data.length);
    setPreview(parsed.data.map(parseInvestmentActivity));
    setExisting(new Set(fingerprints));
    setMessage(null);
  }

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    await ingest(await file.text(), file.name);
  }

  async function doImport() {
    setBusy(true);
    setMessage(null);
    try {
      const result = await commitInvestmentActivityImport({
        accountId,
        fileName,
        fileHash,
        rowsInFile,
        rows: importable,
      });
      setMessage({
        kind: "ok",
        text: `Imported ${result.created} events${result.duplicates ? `; skipped ${result.duplicates} duplicates` : ""}.`,
      });
      setPreview([]);
      setFileName("");
      // The box is emptied too, or the rows just imported sit there inviting a
      // second run. The fingerprint check would catch it as duplicates, but
      // being told "skipped 3 duplicates" about your own last action is a
      // confusing way to learn nothing happened.
      setPasted("");
    } catch (error) {
      setMessage({ kind: "error", text: error instanceof Error ? error.message : "Import failed" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="card p-4" style={{ background: "var(--surface-2)" }}>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="text-sm font-medium">Convert any broker statement with AI</div>
            <p className="text-xs text-[var(--muted)] mt-1 max-w-2xl">
              Copy this prompt, attach the broker&apos;s CSV, PDF, screenshot, or copied table to the AI,
              then save its answer as a CSV. Remove account numbers first if they are not needed.
            </p>
          </div>
          <button type="button" className="btn" onClick={() => setPromptOpen((open) => !open)}>
            {promptOpen ? "Hide prompt" : "Show prompt"}
          </button>
        </div>
        {promptOpen ? (
          <div className="mt-4 space-y-3">
            <button type="button" className="btn" onClick={copyPrompt}>
              {copied ? "Copied" : "Copy AI prompt"}
            </button>
            <pre className="text-[10px] font-mono bg-[var(--surface)] border border-[var(--border)] rounded p-3 overflow-auto max-h-72 whitespace-pre-wrap">
              {prompt}
            </pre>
            <div>
              <div className="text-xs font-medium mb-1">Expected CSV</div>
              <pre className="text-[10px] font-mono bg-[var(--surface)] border border-[var(--border)] rounded p-3 overflow-x-auto">
                {INVESTMENT_ACTIVITY_EXAMPLE}
              </pre>
            </div>
            <p className="text-xs text-[var(--amber)]">
              The app does not send the statement anywhere. If you attach it to an AI, that provider receives
              the data, so redact names and account identifiers first.
            </p>
          </div>
        ) : null}
      </div>

      <div className="card p-4 space-y-3">
        <div>
          <div className="text-sm font-medium">Upload and preview</div>
          <p className="text-xs text-[var(--muted)] mt-1">
            History is attached to one account. It does not change today&apos;s balance or current holdings.
          </p>
        </div>
        {accounts.length > 0 ? (
          <>
            <label className="text-xs block">
              <span className="text-[var(--muted)]">Investment account</span>
              <select
                className="input mt-1"
                value={accountId}
                onChange={(event) => {
                  setAccountId(event.target.value);
                  setPreview([]);
                  setMessage(null);
                }}
              >
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name} · {account.currency}
                  </option>
                ))}
              </select>
            </label>
            {/* Two doors, one reader. A statement usually arrives as a file;
                a single trade you remember, or a table copied out of a
                broker's web page, arrives as text — and having no way to
                paste it meant saving it to a file first for no reason. */}
            <div className="flex gap-2">
              {(["file", "text"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    setMode(m);
                    setPreview([]);
                    setMessage(null);
                  }}
                  className="text-xs px-2 py-1 rounded border"
                  style={{
                    borderColor: mode === m ? "var(--accent)" : "var(--border)",
                    color: mode === m ? "var(--accent)" : undefined,
                  }}
                >
                  {m === "file" ? "Upload a file" : "Paste or type"}
                </button>
              ))}
            </div>

            {mode === "file" ? (
              <input
                type="file"
                accept=".csv,text/csv"
                className="input text-xs"
                onChange={handleFile}
              />
            ) : (
              <div className="space-y-2">
                <textarea
                  className="input font-mono text-xs w-full"
                  rows={8}
                  spellCheck={false}
                  placeholder={`${INVESTMENT_ACTIVITY_COLUMNS.join(",")}
2026-01-04,BUY,VWCE,5,125.00,-626.00,1.00,EUR,Buy VWCE,ord-101`}
                  value={pasted}
                  onChange={(e) => setPasted(e.target.value)}
                />
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    className="btn text-xs"
                    onClick={() =>
                      ingest(pasted, `Typed ${new Date().toISOString().slice(0, 16).replace("T", " ")}`)
                    }
                  >
                    Read these rows
                  </button>
                  <button
                    type="button"
                    className="text-xs text-[var(--accent)]"
                    onClick={() => setPasted(INVESTMENT_ACTIVITY_EXAMPLE)}
                  >
                    Start from an example
                  </button>
                  {pasted !== "" && (
                    <button
                      type="button"
                      className="text-xs text-[var(--muted)]"
                      onClick={() => {
                        setPasted("");
                        setPreview([]);
                        setMessage(null);
                      }}
                    >
                      Clear
                    </button>
                  )}
                </div>
                <p className="text-[10px] text-[var(--muted)] leading-relaxed">
                  The first line must be the header. Everything the file path checks is checked
                  here too — the same reader, so a row that would be rejected from a file is
                  rejected here, with the same reason.
                </p>
              </div>
            )}
          </>
        ) : (
          <p className="text-xs text-[var(--amber)]">Create an active account before importing history.</p>
        )}

        {message ? (
          <p className={`text-xs ${message.kind === "ok" ? "text-[var(--green)]" : "text-[var(--red)]"}`}>
            {message.text}
          </p>
        ) : null}

        {preview.length > 0 ? (
          <>
            <div className="text-xs flex flex-wrap gap-4">
              <span className="text-[var(--green)]">{importable.length} to import</span>
              {duplicates > 0 ? <span className="text-[var(--amber)]">{duplicates} duplicates</span> : null}
              {invalid > 0 ? <span className="text-[var(--red)]">{invalid} unreadable</span> : null}
            </div>
            <div className="overflow-auto max-h-80 border border-[var(--border)] rounded-lg">
              <table className="data-table whitespace-nowrap text-xs">
                <thead><tr><th>Date</th><th>Type</th><th>Asset</th><th>Description</th><th className="text-right">Amount</th><th>Status</th></tr></thead>
                <tbody>
                  {preview.slice(0, 200).map((item, index) => {
                    const duplicate = item.row ? existing.has(investmentActivityFingerprint(item.row)) : false;
                    return (
                      <tr key={index} style={item.problem || duplicate ? { opacity: 0.55 } : undefined}>
                        <td>{item.row?.date ?? "—"}</td><td>{item.row?.type ?? "—"}</td><td>{item.row?.symbol || "—"}</td>
                        <td className="max-w-64 truncate">{item.row?.description || "—"}</td>
                        <td className={`text-right ${(item.row?.amount ?? 0) > 0 ? "text-[var(--green)]" : (item.row?.amount ?? 0) < 0 ? "text-[var(--red)]" : "text-[var(--accent)]"}`}>
                          {item.row ? `${item.row.amount.toFixed(2)} ${item.row.currency}` : "—"}
                        </td>
                        <td>{item.problem ? <span className="text-[var(--red)]">{item.problem}</span> : duplicate ? <span className="text-[var(--amber)]">Duplicate</span> : <span className="text-[var(--green)]">Ready</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <button type="button" className="btn w-full" disabled={busy || importable.length === 0} onClick={doImport} style={busy || importable.length === 0 ? { opacity: 0.5 } : undefined}>
              {busy ? "Importing…" : `Import ${importable.length} events`}
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}

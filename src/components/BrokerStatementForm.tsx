"use client";

import { useState } from "react";
import { previewBrokerStatement } from "@/actions/brokerImport";

/**
 * Uploading a broker statement.
 *
 * The file is read in the browser and posted as text. It never leaves the
 * machine except to this app's own server, which matters more here than for
 * most uploads: a transaction export is a complete record of what someone owns
 * and when they bought it.
 *
 * The Check step exists because of Trade Republic. Its export has never been
 * read by this importer, and the honest way to find out whether it can be is to
 * try — against the real file, writing nothing. A failure then names the
 * columns it didn't recognise, which is a to-do list rather than a dead end.
 */
type Preview = Awaited<ReturnType<typeof previewBrokerStatement>>;

export default function BrokerStatementForm({
  accounts,
  action,
}: {
  accounts: { id: string; name: string; institution: string }[];
  /** Wrapped by the page: a form action may not return a value. */
  action: (formData: FormData) => Promise<void>;
}) {
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /**
   * File or pasted text.
   *
   * Both end up in the same `text`, so nothing downstream knows the difference.
   * Pasting matters more than it looks: an export that arrives in an email, or
   * one opened in a spreadsheet to be glanced at first, is easier to copy than
   * to save. Text copied out of a spreadsheet is tab-separated, which the
   * delimiter detection already handles.
   */
  const [mode, setMode] = useState<"file" | "paste">("file");

  const switchTo = (next: "file" | "paste") => {
    setMode(next);
    setText("");
    setFileName(null);
    setPreview(null);
    setError(null);
  };

  /**
   * Reads the file and reports, writing nothing.
   *
   * Run automatically rather than on a button, because the button was optional
   * and the first thing that happened in real use was someone pressing Import
   * on a bank statement and getting a stack trace. A check you have to
   * remember is a check that doesn't happen.
   */
  const check = async (content: string) => {
    if (content.trim() === "") {
      setPreview(null);
      return;
    }
    setChecking(true);
    setError(null);
    try {
      setPreview(await previewBrokerStatement(content, accountId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong reading that file.");
    } finally {
      setChecking(false);
    }
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setPreview(null);
    setError(null);
    if (!file) {
      setText("");
      setFileName(null);
      return;
    }
    const content = await file.text();
    setText(content);
    setFileName(file.name);
    await check(content);
  };

  // Minus the header, and never below zero: an empty box has no rows, not −1.
  const rows = Math.max(0, text.split(/\r?\n/).filter((l) => l.trim() !== "").length - 1);

  return (
    <form action={action} className="space-y-3 max-w-2xl">
      <input type="hidden" name="statement" value={text} />

      <label className="block text-xs">
        <span className="text-[var(--muted)]">Which account is this?</span>
        <select
          name="accountId"
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
          className="input mt-1"
          required
        >
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.institution} — {a.name}
            </option>
          ))}
        </select>
      </label>

      <div className="flex gap-3 text-xs">
        {(["file", "paste"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => switchTo(m)}
            className="pb-1"
            style={{
              color: mode === m ? "var(--accent)" : "var(--muted)",
              borderBottom: mode === m ? "1px solid var(--accent)" : "1px solid transparent",
            }}
          >
            {m === "file" ? "Upload a file" : "Paste the text"}
          </button>
        ))}
      </div>

      {mode === "file" ? (
        <label className="block text-xs">
          <span className="text-[var(--muted)]">The transaction export, as CSV</span>
          <input type="file" accept=".csv,text/csv" onChange={onFile} className="input mt-1" />
        </label>
      ) : (
        <label className="block text-xs">
          <span className="text-[var(--muted)]">
            Paste the rows, including the header line with the column names
          </span>
          <textarea
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setPreview(null);
              setError(null);
            }}
            // Checked when the box loses focus, not on every keystroke: a
            // check per character would be a database query per character.
            onBlur={(e) => check(e.target.value)}
            rows={8}
            spellCheck={false}
            placeholder={"Date;Type;ISIN;Quantity;Amount\n2026-01-15;Buy;IE00B4L5Y983;2,5;-251,00"}
            className="input mt-1 font-mono text-[11px]"
          />
        </label>
      )}

      {(fileName || (mode === "paste" && rows > 0)) && (
        <div className="text-xs text-[var(--muted)]">
          {fileName ? `${fileName} — ` : ""}
          {rows} row{rows === 1 ? "" : "s"}.
          {/* The header line is not a row, and someone pasting a single record
              without it will otherwise be told there are 0 rows. */}
          {rows === 0 && " Did the header line come along with it?"}
        </div>
      )}

      <div className="flex items-center gap-3">
        {/* Disabled until the file has been read and understood. The check used
            to be optional, and the very first real use was Import pressed on a
            bank statement, which threw a 500 at a page that had every piece of
            information needed to say "wrong form" politely. */}
        <button type="submit" className="btn" disabled={preview?.ok !== true}>
          Import statement
        </button>
        {checking && <span className="text-xs text-[var(--muted)]">Reading…</span>}
        {text !== "" && !checking && preview === null && (
          <button
            type="button"
            onClick={() => check(text)}
            className="text-xs"
            style={{ color: "var(--accent)" }}
          >
            Check the file
          </button>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-[var(--border)] p-3 text-xs" style={{ color: "var(--red)" }}>
          {error}
        </div>
      )}

      {preview && !preview.ok && <UnreadableReport inspection={preview.inspection} />}
      {preview && preview.ok && <ReadableReport preview={preview} />}

      <p className="text-[10px] text-[var(--muted)]">
        Checking writes nothing. Importing the same file twice is safe: every row carries a key, and
        one already stored is skipped rather than added again.
      </p>
    </form>
  );
}

type Inspection = Extract<Preview, { ok: false }>["inspection"];

/**
 * The file couldn't be read.
 *
 * Deliberately a report rather than an error: for a broker the app has not met,
 * this is the list of things to teach it, and the headers are the vocabulary.
 */
function UnreadableReport({ inspection }: { inspection: Inspection }) {
  // The likeliest mistake on a page with two importers, and the one worth
  // naming: nothing is wrong with the file, it is simply in the wrong form.
  if (inspection.looksLikeBankStatement) {
    return (
      <div className="rounded-lg border border-[var(--border)] p-3 space-y-2 text-xs">
        <div style={{ color: "var(--amber)" }}>This is a bank statement, not a broker one.</div>
        <p className="text-[var(--muted)] leading-snug">
          It has {inspection.headers.join(", ")} — money in and out, with no instrument, quantity or
          ISIN, so there are no holdings to rebuild from it. Use the bank import at the top of this
          page instead; it is the right tool for this file.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-[var(--border)] p-3 space-y-2 text-xs">
      <div style={{ color: "var(--amber)" }}>
        This export can&apos;t be read yet — no column for {inspection.missingRequired.join(", ")}.
      </div>

      <div>
        <div className="text-[var(--muted)] mb-1">
          Columns in the file (separated by {describeDelimiter(inspection.delimiter)}):
        </div>
        <div className="flex flex-wrap gap-1">
          {inspection.headers.map((h) => (
            <code key={h} className="px-1.5 py-0.5 rounded" style={{ background: "var(--surface-2)" }}>
              {h}
            </code>
          ))}
        </div>
      </div>

      <p className="text-[var(--muted)] leading-snug">
        Nothing is wrong with your file. The importer just doesn&apos;t know these names yet — send
        this list and they can be added.
      </p>
    </div>
  );
}

type Readable = Extract<Preview, { ok: true }>;

function ReadableReport({ preview }: { preview: Readable }) {
  const { inspection } = preview;

  return (
    <div className="rounded-lg border border-[var(--border)] p-3 space-y-3 text-xs">
      <div style={{ color: "var(--green)" }}>
        Read {preview.total} row{preview.total === 1 ? "" : "s"} — {preview.toImport} new,{" "}
        {preview.duplicates} already stored.
      </div>

      {/* Unrecognised type words, which is what a new broker actually costs.
          The rows are still readable; these particular ones would be skipped. */}
      {inspection.unknownKinds.length > 0 && (
        <div>
          <div style={{ color: "var(--amber)" }}>
            {inspection.unknownKinds.length} type
            {inspection.unknownKinds.length === 1 ? "" : "s"} not recognised — those rows would be
            skipped:
          </div>
          <div className="flex flex-wrap gap-1 mt-1">
            {inspection.unknownKinds.map((k) => (
              <code
                key={k.word}
                className="px-1.5 py-0.5 rounded"
                style={{ background: "var(--surface-2)" }}
              >
                {k.word} × {k.rows}
              </code>
            ))}
          </div>
        </div>
      )}

      {preview.rejected.length > 0 && (
        <div>
          <div style={{ color: "var(--amber)" }}>{preview.rejected.length} rows rejected:</div>
          <ul className="mt-1 space-y-0.5 text-[var(--muted)]">
            {preview.rejected.slice(0, 4).map((r) => (
              <li key={r.line}>
                Line {r.line}: {r.reason}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* The real test. If these quantities match the broker's own app, the
          file was read correctly; if they don't, nothing downstream can help. */}
      {preview.holdings.length > 0 && (
        <div>
          <div className="text-[var(--muted)] mb-1">
            What this says you hold — compare it against your broker&apos;s app:
          </div>
          <table className="w-full">
            <tbody>
              {preview.holdings.map((h) => (
                <tr key={h.key}>
                  <td className="py-0.5">{h.symbol ?? h.key}</td>
                  <td className="py-0.5 text-[var(--muted)]">{h.isin ?? "—"}</td>
                  <td className="py-0.5 text-right">{h.quantity}</td>
                  <td className="py-0.5 text-right text-[var(--muted)]">
                    {h.costBasis.toFixed(2)} at cost
                  </td>
                  <td className="py-0.5 text-right">
                    {h.incomplete && <span style={{ color: "var(--amber)" }}>partial</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {preview.opening.needsOpeningBalance && (
        <div className="text-[var(--muted)] leading-snug">
          This export doesn&apos;t reach the start of the account — it spends {" "}
          {preview.opening.impliedOpening.toFixed(2)} that was already there. Gain won&apos;t be
          reported, because it can&apos;t be told apart from the missing history.
        </div>
      )}
    </div>
  );
}

function describeDelimiter(d: string): string {
  if (d === ";") return "semicolons";
  if (d === "\t") return "tabs";
  return "commas";
}

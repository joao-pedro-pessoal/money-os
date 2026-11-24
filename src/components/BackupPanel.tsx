"use client";
import { useInvestments } from "@/components/EditionContext";

import { useText } from "@/components/useText";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLanguage } from "./LanguageContext";
import { transferText } from "@/lib/backup/text";
import { transferRequest } from "./transferClient";
import type { ValidationResult } from "@/lib/backup";
import { randomUuid } from "@/lib/money/quickEntryId";
import { sha256Text } from "@/lib/hash/sha256";
import { exportAllData, exportTransactionsCsv, exportHoldingsCsv } from "@/actions/export";

type Check = ValidationResult;

/**
 * Backup, export and restore.
 *
 * Restore is destructive, so the file is inspected first and the user has to
 * type RESTORE to confirm — an accidental click cannot wipe a year of data.
 */
export default function BackupPanel({ maxBytes, maxRows }: { maxBytes: number; maxRows: number }) {
  const { language } = useLanguage();
  const text = transferText(language);
  const router = useRouter();
  const pending = useRef(false);
  const restoreRequest = useRef({ id: "", checksum: "" });
  const [problem, setProblem] = useState("");
  const [notice, setNotice] = useState("");
  const investmentsEnabled = useInvestments();
  const uiText = useText();
  const [busy, setBusy] = useState<string | null>(null);
  const [fileText, setFileText] = useState<string>("");
  const [check, setCheck] = useState<Check | null>(null);
  const [confirmText, setConfirmText] = useState("");

  async function download(kind: "json" | "tx" | "holdings") {
    if (pending.current) return;
    pending.current = true; setProblem(""); setNotice("");
    setBusy(kind);
    try {
      const [content, filename, type] =
        kind === "json"
          ? [await exportAllData(), `money-os-backup-${today()}.json`, "application/json"]
          : kind === "tx"
            ? [await exportTransactionsCsv(), `transactions-${today()}.csv`, "text/csv"]
            : [await exportHoldingsCsv(), `holdings-${today()}.csv`, "text/csv"];

      const url = URL.createObjectURL(new Blob([content], { type }));
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch { setProblem(text.failed);
    } finally {
      pending.current = false; setBusy(null);
    }
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || pending.current) return;
    pending.current = true; setBusy("inspect"); setProblem(""); setNotice("");
    setCheck(null); setFileText(""); setConfirmText("");
    try {
      if (file.size > maxBytes) throw new Error(text.tooLarge);
      const content = await file.text();
      const result = await transferRequest("/api/backup/inspect", content, language) as Check;
      setCheck(result);
      if (result.ok) setFileText(content);
      restoreRequest.current = { id: randomUuid(), checksum: await sha256Text(content) };
    } catch (error) { setProblem(error instanceof Error ? error.message : text.failed); }
    finally { pending.current = false; setBusy(null); }
  }

  async function restore(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending.current || confirmText !== "RESTORE" || !check?.ok) return;
    pending.current = true; setBusy("restore"); setProblem(""); setNotice("");
    try {
      await transferRequest("/api/backup/restore", fileText, language, { "X-Money-Confirmation": "RESTORE", "X-Money-Request": restoreRequest.current.id, "X-Money-SHA256": restoreRequest.current.checksum });
      setNotice(text.restored); setConfirmText(""); setCheck(null); setFileText(""); router.refresh();
    } catch (error) { setProblem(error instanceof Error ? error.message : text.failed); }
    finally { pending.current = false; setBusy(null); }
  }

  const totalRows = check ? Object.values(check.counts).reduce<number>((s, n) => s + n, 0) : 0;

  return (
    <div className="space-y-6" aria-busy={busy !== null}>
      {problem && <p role="alert" className="text-sm text-[var(--red)]">{problem}</p>}
      {notice && <p role="status" className="text-sm text-[var(--green)]">{notice}</p>}
      <div>
        <div className="text-sm font-medium mb-1">{uiText("Backup & export")}</div>
        <p className="text-xs text-[var(--muted)] mb-3">{uiText("The JSON backup contains every table and is what you'd restore from. The CSVs are for reading elsewhere — they don't restore.")}</p>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => download("json")} className="btn" disabled={busy !== null}>
            {busy === "json" ? uiText("Preparing…") : uiText("Download full backup (JSON)")}
          </button>
          <button onClick={() => download("tx")} className="btn" disabled={busy !== null}>{uiText("Transactions (CSV)")}</button>
          {investmentsEnabled && <button onClick={() => download("holdings")} className="btn" disabled={busy !== null}>{uiText("Holdings (CSV)")}</button>}
        </div>
      </div>

      <div className="border-t border-[var(--border)] pt-4">
        <div className="text-sm font-medium mb-1">{uiText("Restore from a backup")}</div>
        <p className="text-xs text-[var(--muted)] mb-3">{uiText("This ")}<span className="text-[var(--red)]">{uiText("replaces everything")}</span>{uiText(" currently in the app with the contents of the file. Take a fresh backup first if you're unsure.")}</p>

        <input type="file" accept="application/json,.json" onChange={onFile} disabled={busy !== null} className="input text-xs" />

        <p className="text-xs text-[var(--muted)] mt-1">{text.limit(maxBytes, maxRows)}</p>
        {busy === "inspect" && <p role="status" className="text-xs">{text.processing}</p>}

        {check && (
          <div className="mt-3 text-xs space-y-2">
            {check.errors.length > 0 && (
              <div className="text-[var(--red)]">
                {check.errors.map((e, i) => (
                  <div key={i}>{text.validation(e)}</div>
                ))}
              </div>
            )}
            {check.ok && (
              <>
                <div className="text-[var(--green)]">{uiText("Valid backup — ")}{totalRows}{uiText(" rows across ")}{Object.keys(check.counts).length}{uiText(" tables.")}</div>
                <div className="text-[var(--muted)] flex flex-wrap gap-x-3">
                  {Object.entries(check.counts)
                    .filter(([, n]) => n > 0)
                    .map(([t, n]) => (
                      <span key={t}>
                        {t}: {n}
                      </span>
                    ))}
                </div>
                {check.warnings.length > 0 && (
                  <details className="text-[var(--amber)]">
                    <summary className="cursor-pointer">{check.warnings.length}{uiText(" warnings")}</summary>
                    {check.warnings.map((w, i) => (
                      <div key={i}>{text.validation(w)}</div>
                    ))}
                  </details>
                )}

                <form onSubmit={restore} className="flex gap-2 items-center pt-2 flex-wrap">
                  <input
                    name="confirmation"
                    disabled={busy !== null}
                    aria-label={uiText("Type RESTORE to confirm")}
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value)}
                    placeholder={uiText("Type RESTORE to confirm")}
                    className="input"
                  />
                  <button
                    type="submit"
                    className="btn"
                    disabled={busy !== null || confirmText !== "RESTORE"}
                    style={confirmText !== "RESTORE" ? { opacity: 0.5 } : undefined}
                  >{busy === "restore" ? text.processing : uiText("Replace all data")}</button>
                </form>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

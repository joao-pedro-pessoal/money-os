"use client";

import { useState } from "react";
import { exportAllData, exportTransactionsCsv, exportHoldingsCsv, inspectBackup } from "@/actions/export";

type Check = Awaited<ReturnType<typeof inspectBackup>>;

/**
 * Backup, export and restore.
 *
 * Restore is destructive, so the file is inspected first and the user has to
 * type RESTORE to confirm — an accidental click cannot wipe a year of data.
 */
export default function BackupPanel({
  restoreAction,
}: {
  restoreAction: (formData: FormData) => Promise<void>;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [fileText, setFileText] = useState<string>("");
  const [check, setCheck] = useState<Check | null>(null);
  const [confirmText, setConfirmText] = useState("");

  async function download(kind: "json" | "tx" | "holdings") {
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
    } finally {
      setBusy(null);
    }
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setFileText(text);
    setCheck(await inspectBackup(text));
    setConfirmText("");
  }

  const totalRows = check ? Object.values(check.counts).reduce<number>((s, n) => s + n, 0) : 0;

  return (
    <div className="space-y-6">
      <div>
        <div className="text-sm font-medium mb-1">Backup &amp; export</div>
        <p className="text-xs text-[var(--muted)] mb-3">
          The JSON backup contains every table and is what you&apos;d restore from. The CSVs are for reading
          elsewhere — they don&apos;t restore.
        </p>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => download("json")} className="btn" disabled={busy !== null}>
            {busy === "json" ? "Preparing…" : "Download full backup (JSON)"}
          </button>
          <button onClick={() => download("tx")} className="btn" disabled={busy !== null}>
            Transactions (CSV)
          </button>
          <button onClick={() => download("holdings")} className="btn" disabled={busy !== null}>
            Holdings (CSV)
          </button>
        </div>
      </div>

      <div className="border-t border-[var(--border)] pt-4">
        <div className="text-sm font-medium mb-1">Restore from a backup</div>
        <p className="text-xs text-[var(--muted)] mb-3">
          This <span className="text-[var(--red)]">replaces everything</span> currently in the app with the
          contents of the file. Take a fresh backup first if you&apos;re unsure.
        </p>

        <input type="file" accept="application/json,.json" onChange={onFile} className="input text-xs" />

        {check && (
          <div className="mt-3 text-xs space-y-2">
            {check.errors.length > 0 && (
              <div className="text-[var(--red)]">
                {check.errors.map((e, i) => (
                  <div key={i}>{e}</div>
                ))}
              </div>
            )}
            {check.ok && (
              <>
                <div className="text-[var(--green)]">
                  Valid backup — {totalRows} rows across {Object.keys(check.counts).length} tables.
                </div>
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
                    <summary className="cursor-pointer">{check.warnings.length} warnings</summary>
                    {check.warnings.map((w, i) => (
                      <div key={i}>{w}</div>
                    ))}
                  </details>
                )}

                <form action={restoreAction} className="flex gap-2 items-center pt-2 flex-wrap">
                  <input type="hidden" name="backup" value={fileText} />
                  <input
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value)}
                    placeholder="Type RESTORE to confirm"
                    className="input"
                  />
                  <button
                    type="submit"
                    className="btn"
                    disabled={confirmText !== "RESTORE"}
                    style={confirmText !== "RESTORE" ? { opacity: 0.5 } : undefined}
                  >
                    Replace all data
                  </button>
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

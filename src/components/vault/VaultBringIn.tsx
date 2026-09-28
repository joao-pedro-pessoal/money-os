"use client";

import { useEffect, useState } from "react";
import { isSiteOwner, siteAsVaultDocument } from "@/actions/vaultExport";
import type { VaultDocument } from "@/lib/vault/document";
import type { LeftOut } from "@/lib/vault/import";

/**
 * Bringing this installation's own records into the vault, for its owner.
 *
 * Offered only to someone signed in to the site as its owner, and only while
 * the vault is still empty. A vault with movements in it
 * would have to be merged with the site's, and a merge nobody asked for is how
 * one set of records quietly becomes two of everything — so the choice is made
 * before there is anything to lose.
 *
 * The site's tables are not touched: what is read is copied, and what could not
 * be translated is listed here rather than left to be noticed later as a
 * missing month.
 */
export default function VaultBringIn({
  document,
  onBring,
}: {
  document: VaultDocument;
  onBring: (next: VaultDocument) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ document: VaultDocument; leftOut: LeftOut[] } | null>(null);
  /** Null until known; only the site's owner is offered the site's records. */
  const [owner, setOwner] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    isSiteOwner()
      .then((yes) => {
        if (!cancelled) setOwner(yes);
      })
      .catch(() => {
        if (!cancelled) setOwner(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const empty = document.accounts.length === 0 && document.movements.length === 0;
  if (!owner || (!empty && !preview)) return null;

  const read = async () => {
    setBusy(true);
    setProblem(null);
    try {
      setPreview(await siteAsVaultDocument());
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "The records could not be read.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card p-4 space-y-3">
      <div>
        <div className="text-sm font-medium">Already using this Money OS?</div>
        <p className="text-xs text-[var(--muted)] mt-1 max-w-2xl">
          If you are its owner and signed in to the site, your accounts, movements, categories and budgets can be
          copied into this vault. Nothing is removed from the site, so the two can be compared afterwards — and if you
          change your mind, you simply stop using the vault.
        </p>
      </div>

      {problem && (
        <p role="alert" className="text-xs text-[var(--red)]">
          {problem}
        </p>
      )}

      {!preview ? (
        <button type="button" className="btn" disabled={busy} onClick={read}>
          {busy ? "Reading…" : "Read my Money OS records"}
        </button>
      ) : (
        <div className="space-y-3">
          <div className="text-sm">
            {preview.document.accounts.length} accounts, {preview.document.movements.length} movements,{" "}
            {preview.document.categories.length} categories and {preview.document.budgets.length} budgets are ready to
            come in.
          </div>
          {preview.leftOut.length > 0 && (
            <div className="rounded-lg border p-3 space-y-1" style={{ borderColor: "var(--amber)" }}>
              <div className="text-xs font-medium text-[var(--amber)]">What stays behind</div>
              <ul className="text-xs text-[var(--muted)] space-y-1">
                {preview.leftOut.map((l) => (
                  <li key={l.what}>
                    <strong className="text-[var(--foreground)]">
                      {l.count} {l.what}
                    </strong>{" "}
                    — {l.why}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="flex gap-2 flex-wrap">
            <button
              type="button"
              className="btn"
              onClick={() => {
                const next = preview.document;
                setPreview(null);
                onBring(next);
              }}
            >
              Bring them in
            </button>
            <button type="button" className="btn" onClick={() => setPreview(null)}>
              Not now
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

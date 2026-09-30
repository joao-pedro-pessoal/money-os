"use client";

/**
 * "This device is mine": whether the twelve words outlive this visit.
 *
 * Off by default, because the same screen opens on a shared computer. On a
 * phone it is the difference between an app and a form: an installed web app
 * forgets everything kept only for the visit each time it is closed. See
 * `storage.ts` for where each secret goes.
 */
export default function KeepOpenChoice({ keep, onChange }: { keep: boolean; onChange: (keep: boolean) => void }) {
  return (
    <label className="flex items-start gap-2 text-xs">
      <input type="checkbox" className="mt-0.5" checked={keep} onChange={(e) => onChange(e.target.checked)} />
      <span>
        This phone or computer is mine — keep the vault open here
        <span className="block text-[11px] text-[var(--muted)]">
          Then it opens without signing in again until you press Lock and sign out. Leave it off on a computer other
          people use.
        </span>
      </span>
    </label>
  );
}

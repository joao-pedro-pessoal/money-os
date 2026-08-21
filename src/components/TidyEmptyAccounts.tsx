"use client";

import { useState } from "react";

export interface RemovableAccount {
  id: string;
  name: string;
  institution: string;
}

/**
 * Clears out accounts that nothing points at.
 *
 * These are almost always left over from connection attempts: every failed API
 * key used to create a fresh account, so retrying Bybit three times left three
 * "Bybit" rows at zero. They're listed by name and ticked individually — a bulk
 * delete that doesn't show you what it's about to delete is not a good trade
 * for a financial app, even when the rows are provably empty.
 */
export default function TidyEmptyAccounts({
  removable,
  action,
}: {
  removable: RemovableAccount[];
  action: (formData: FormData) => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set(removable.map((a) => a.id)));

  if (removable.length === 0) return null;

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  return (
    <div className="card p-4" style={{ borderColor: "var(--amber)" }}>
      <div className="text-sm font-medium mb-1">
        {removable.length} empty account{removable.length === 1 ? "" : "s"}
      </div>
      <p className="text-xs text-[var(--muted)] mb-3 max-w-2xl">
        No balance, no transactions, no positions, no connection — nothing in the app refers to these, so
        removing them changes no total and no chart. They usually appear when a connection fails and gets
        retried.
      </p>

      <form action={action} className="space-y-2">
        <ul className="text-sm space-y-1 mb-3">
          {removable.map((a) => (
            <li key={a.id}>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  name="accountId"
                  value={a.id}
                  checked={selected.has(a.id)}
                  onChange={() => toggle(a.id)}
                />
                <span>{a.name}</span>
                {a.institution !== a.name && (
                  <span className="text-xs text-[var(--muted)]">{a.institution}</span>
                )}
              </label>
            </li>
          ))}
        </ul>

        <button
          type="submit"
          className="btn"
          disabled={selected.size === 0}
          style={selected.size === 0 ? { opacity: 0.5 } : undefined}
          onClick={(e) => {
            if (!confirm(`Permanently remove ${selected.size} empty account(s)?`)) e.preventDefault();
          }}
        >
          Remove {selected.size} selected
        </button>
      </form>
    </div>
  );
}

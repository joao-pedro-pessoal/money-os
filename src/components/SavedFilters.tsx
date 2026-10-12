"use client";

import { useEffect, useState, useTransition } from "react";
import { deleteSavedFilters, listSavedFilters, saveFilters } from "@/actions/savedViews";

/**
 * Named filter combinations for one screen: save the filters on screen under
 * a name, bring any of them back with one tap. The screen turns its filters
 * into JSON and back (`serialise`/`apply`); this only keeps the list.
 */
export default function SavedFilters({
  scope,
  current,
  active,
  onApply,
}: {
  scope: "trade-history" | "transactions";
  /** The filters on screen, as JSON. */
  current: string;
  /** Whether anything is filtered: saving "no filters" is offered nowhere. */
  active: boolean;
  onApply: (config: string) => void;
}) {
  const [saved, setSaved] = useState<{ id: string; name: string; config: string }[]>([]);
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [pending, start] = useTransition();

  const reload = () => listSavedFilters(scope).then(setSaved).catch(() => setMessage("Saved filters could not be read."));
  useEffect(() => {
    void reload();
    // Once per screen: the list changes only through this component.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope]);

  return (
    <div className="space-y-2">
      {saved.length > 0 && (
        <div className="flex flex-wrap gap-2" aria-label="Saved filters">
          {saved.map((s) => (
            <span key={s.id} className={`badge inline-flex items-center gap-1 ${s.config === current ? "border border-[var(--accent)]" : ""}`}>
              <button type="button" className="hover:underline" onClick={() => onApply(s.config)} translate="no">
                {s.name}
              </button>
              <button
                type="button"
                aria-label={`Delete saved filters ${s.name}`}
                className="text-[var(--muted)] hover:text-[var(--red)]"
                onClick={() => start(async () => { await deleteSavedFilters(s.id); await reload(); })}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      {active && (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              setMessage("");
              try {
                await saveFilters(scope, name, current);
                setName("");
                await reload();
                setMessage("Saved.");
              } catch (error) {
                setMessage(error instanceof Error ? error.message : "Could not save.");
              }
            });
          }}
        >
          <input
            className="input input-narrow text-xs flex-1 min-w-32"
            placeholder="Name these filters"
            aria-label="Name for these filters"
            maxLength={60}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button type="submit" className="btn text-xs" disabled={pending || name.trim() === ""}>
            Save filters
          </button>
          <span role="status" className="text-xs text-[var(--muted)]">{message}</span>
        </form>
      )}
    </div>
  );
}

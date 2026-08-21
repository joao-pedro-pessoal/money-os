"use client";

import { useState } from "react";
import Link from "next/link";

export interface SavedViewChip {
  id: string;
  name: string;
  query: string;
}

/**
 * Named shortcuts back to a filter/group/sort combination.
 *
 * The analysis has nine grouping options crossed with seven sort columns; the
 * two or three you actually look at get rebuilt by hand every visit. A chip is
 * just a link to the query string, so a saved view is bookmarkable and behaves
 * exactly like arriving at the screen normally.
 */
export default function SavedViews({
  views,
  currentQuery,
  suggestedName,
  saveAction,
  deleteAction,
  currentConfig,
}: {
  views: SavedViewChip[];
  currentQuery: string;
  suggestedName: string;
  saveAction: (formData: FormData) => void;
  deleteAction: (formData: FormData) => void;
  currentConfig: { groupBy: string; sort: string; dir: string; synced: string };
}) {
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState(suggestedName);

  const alreadySaved = views.find((v) => v.query === currentQuery);

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {views.map((v) => {
        const isCurrent = v.query === currentQuery;
        return (
          <span
            key={v.id}
            className="inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs"
            style={{
              borderColor: isCurrent ? "var(--accent)" : "var(--border)",
              color: isCurrent ? "var(--accent)" : "var(--muted)",
            }}
          >
            <Link href={`?${v.query}`}>{v.name}</Link>
            <form action={deleteAction} className="contents">
              <input type="hidden" name="id" value={v.id} />
              <button
                type="submit"
                className="opacity-50 hover:opacity-100 leading-none"
                aria-label={`Remove ${v.name}`}
                title={`Remove ${v.name}`}
              >
                ×
              </button>
            </form>
          </span>
        );
      })}

      {alreadySaved ? (
        <span className="text-xs text-[var(--muted)]">
          This view is saved as &quot;{alreadySaved.name}&quot;
        </span>
      ) : saving ? (
        <form action={saveAction} className="flex items-center gap-1">
          <input type="hidden" name="groupBy" value={currentConfig.groupBy} />
          <input type="hidden" name="sort" value={currentConfig.sort} />
          <input type="hidden" name="dir" value={currentConfig.dir} />
          <input type="hidden" name="synced" value={currentConfig.synced} />
          <input
            name="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="input input-narrow text-xs py-1 w-56"
            autoFocus
            required
          />
          <button type="submit" className="text-xs text-[var(--accent)] hover:underline">
            Save
          </button>
          <button
            type="button"
            onClick={() => setSaving(false)}
            className="text-xs text-[var(--muted)] hover:underline"
          >
            Cancel
          </button>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setSaving(true)}
          className="text-xs text-[var(--accent)] hover:underline"
        >
          + Save this view
        </button>
      )}
    </div>
  );
}

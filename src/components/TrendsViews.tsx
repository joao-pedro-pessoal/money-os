"use client";

import { useId, useState, type ReactNode } from "react";

export default function TrendsViews({ progress, scenarios }: { progress: ReactNode; scenarios: ReactNode }) {
  const [view, setView] = useState<"progress" | "scenarios">("progress");
  const id = useId();
  return <div className="space-y-4">
    <div className="grid grid-cols-2 gap-2" role="group" aria-label="Trends view">
      {([['progress', 'Your progress'], ['scenarios', 'Future scenarios']] as const).map(([key, label]) =>
        <button key={key} type="button" className="btn text-sm" aria-pressed={view === key} aria-controls={`${id}-${key}`}
          style={{ background: "var(--surface)", border: `1px solid ${view === key ? "var(--accent)" : "var(--border)"}`, color: view === key ? "var(--accent)" : "var(--muted)" }}
          onClick={() => setView(key)}>{label}</button>
      )}
    </div>
    <div id={`${id}-progress`} hidden={view !== "progress"} className="space-y-4">{progress}</div>
    <div id={`${id}-scenarios`} hidden={view !== "scenarios"} className="space-y-4">{scenarios}</div>
  </div>;
}

"use client";

import { useId, useState, type ReactNode } from "react";

export default function AccountViews({ overview, manage }: { overview: ReactNode; manage: ReactNode }) {
  const [view, setView] = useState("overview");
  const id = useId();
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2" role="group" aria-label="Account view">
        {[["overview", "Overview"], ["manage", "Manage account"]].map(([key, label]) => (
          <button key={key} type="button" className="rounded-lg min-h-11 px-3 text-sm font-medium"
            style={{ background: "var(--surface)", border: `1px solid var(${view === key ? "--accent" : "--border"})`, color: `var(${view === key ? "--accent" : "--muted"})` }}
            aria-pressed={view === key} aria-controls={`${id}-${key}`} onClick={() => setView(key)}>{label}</button>
        ))}
      </div>
      <div id={`${id}-overview`} hidden={view !== "overview"}><div className="space-y-4">{overview}</div></div>
      <div id={`${id}-manage`} hidden={view !== "manage"}><div className="space-y-4">{manage}</div></div>
    </div>
  );
}

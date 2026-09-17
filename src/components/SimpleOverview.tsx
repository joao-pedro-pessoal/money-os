"use client";

import { useId, useState, type ReactNode } from "react";

/** Keep the same financial cards in both modes; only their visibility changes. */
export default function SimpleOverview({ children }: { children: ReactNode }) {
  const [expanded, setExpanded] = useState(false);
  const id = useId();
  return (
    <div className="simple-overview" data-show-details={expanded}>
      <div id={id} className="dashboard-overview grid grid-cols-1 min-[390px]:grid-cols-2 lg:grid-cols-5 gap-4">{children}</div>
      <button type="button" className="simple-only simple-details-button" aria-expanded={expanded} aria-controls={id} onClick={() => setExpanded(!expanded)}>
        {expanded ? "Show the essentials" : "Investments and reserved money"}
        <span aria-hidden="true">{expanded ? "−" : "+"}</span>
      </button>
    </div>
  );
}

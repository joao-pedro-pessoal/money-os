"use client";

import { useRouter } from "next/navigation";

export interface FilterOption {
  value: string;
  label: string;
  /** Where choosing this option goes. Built by the page, which owns the URL. */
  href: string;
}

/**
 * A dropdown that changes the view, keeping your place on the page.
 *
 * Replaces a `<form method="GET">`, which had two problems beyond the scroll.
 * A native GET form is a full document navigation — the slowest way to change
 * one parameter — and it carries only the fields written into it as hidden
 * inputs. The grouping form on the analysis page carried `sort` and `dir` and
 * nothing else, so changing "Group by" silently turned the Cash & stablecoins
 * toggle back on (its absence reads as on) and closed whichever group you had
 * open.
 *
 * Taking a whole `href` per option rather than a parameter name is what fixes
 * that: the page builds them with the same query builder its links use, so a
 * parameter added later is carried here without anyone remembering to add a
 * hidden input for it.
 *
 * The submit button goes too. It existed because a form needs one, not because
 * choosing from a list of nine groupings is a decision worth confirming.
 */
export default function FilterSelect({
  options,
  value,
  label,
  className = "input py-1",
}: {
  options: FilterOption[];
  value: string;
  /** Named for screen readers, since the control has no visible label. */
  label: string;
  className?: string;
}) {
  const router = useRouter();

  return (
    <select
      className={className}
      value={value}
      aria-label={label}
      onChange={(e) => {
        const chosen = options.find((o) => o.value === e.target.value);
        if (chosen) router.push(chosen.href, { scroll: false });
      }}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

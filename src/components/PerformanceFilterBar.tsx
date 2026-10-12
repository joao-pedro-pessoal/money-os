"use client";

import { useRouter } from "next/navigation";
import MultiSelect from "./MultiSelect";
import { useSymbolNames } from "./SymbolName";
import { GROUP_BY_OPTIONS, groupValueLabel, type GroupByKey } from "@/lib/portfolio/analysis";
import type { FilterChoices, PerformanceFilters } from "@/lib/portfolio/classifiedPerformance";
import { filterParam } from "@/lib/portfolio/savedViews";

/**
 * The performance breakdown's filters: any dimension it can be grouped by,
 * several values each, all of them applying together.
 *
 * They live in the address like the rest of the view, so a filtered view is a
 * link, a refresh keeps it, and a saved view carries it. Choosing pushes a new
 * address; the page does the filtering.
 */
export default function PerformanceFilterBar({
  base,
  filters,
  options,
}: {
  /** The view's query without filters or opened groups, which this rebuilds. */
  base: string;
  filters: PerformanceFilters;
  options: Record<GroupByKey, FilterChoices>;
}) {
  const router = useRouter();
  const names = useSymbolNames();
  const go = (next: PerformanceFilters) => {
    const params = new URLSearchParams(base);
    for (const { value: key } of GROUP_BY_OPTIONS) {
      for (const value of next[key] ?? []) params.append(filterParam(key), value);
    }
    router.push(`?${params.toString()}`, { scroll: false });
  };
  const chosen = GROUP_BY_OPTIONS.reduce((n, o) => n + (filters[o.value]?.length ?? 0), 0);
  const text = (key: GroupByKey) => (value: string) =>
    key === "symbol" ? (names[value] ? `${names[value]} (${value})` : value) : groupValueLabel(key, value);

  return (
    <details className="mb-3" open={chosen > 0}>
      <summary className="text-xs cursor-pointer text-[var(--accent)]">
        Filters{chosen > 0 ? ` · ${chosen} chosen` : ""}
      </summary>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 mt-2">
        {GROUP_BY_OPTIONS.filter((o) => options[o.value].values.length > 0 || options[o.value].unset).map((o) => (
          <MultiSelect
            key={o.value}
            label={o.label}
            options={options[o.value].values}
            selected={filters[o.value] ?? []}
            onChange={(next) => go({ ...filters, [o.value]: next })}
            render={text(o.value)}
            noneLabel={options[o.value].unset ? "Unset" : undefined}
          />
        ))}
      </div>
      {chosen > 0 && (
        <button type="button" className="text-xs text-[var(--accent)] mt-2 hover:underline" onClick={() => go({})}>
          Clear all filters
        </button>
      )}
      <p className="text-[10px] text-[var(--muted)] mt-2 max-w-prose">
        Several values in one field show either; filled fields all apply. Unset picks what has nothing set there.
      </p>
    </details>
  );
}

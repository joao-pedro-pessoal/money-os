import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import PerformanceFilterBar from "../PerformanceFilterBar";
import { SymbolNamesProvider } from "../SymbolName";
import { GROUP_BY_OPTIONS, type GroupByKey } from "@/lib/portfolio/analysis";
import type { FilterChoices } from "@/lib/portfolio/classifiedPerformance";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const empty = Object.fromEntries(GROUP_BY_OPTIONS.map((o): [GroupByKey, FilterChoices] => [o.value, { values: [], unset: false }])) as Record<GroupByKey, FilterChoices>;
const options = {
  ...empty,
  playlist: { values: ["Core", "Growth"], unset: true },
  riskLevel: { values: ["high"], unset: false },
  symbol: { values: ["IGLAl_EQ"], unset: false },
};
const draw = (filters = {}) =>
  renderToStaticMarkup(
    <SymbolNamesProvider names={{ IGLAl_EQ: "Ouro físico" }}>
      <PerformanceFilterBar base="groupBy=playlist" filters={filters} options={options} />
    </SymbolNamesProvider>
  );

describe("the performance filters", () => {
  it("offers only dimensions with something to choose, and Unset only where something is unset", () => {
    const html = draw();
    expect(html).toContain("Playlist: All");
    expect(html).toContain("Risk: All");
    expect(html).not.toContain("Liquidity");
    expect(html.match(/>Unset</g)).toHaveLength(1);
  });

  it("shows tag values in words and tickers by your name", () => {
    const html = draw();
    expect(html).toContain("High");
    expect(html).toContain("Ouro físico (IGLAl_EQ)");
  });

  it("counts what is chosen, opens itself, and offers to clear it", () => {
    const html = draw({ playlist: ["Core", "Growth"], riskLevel: ["high"] });
    expect(html).toContain("Filters · 3 chosen");
    expect(html).toContain("Playlist: 2 chosen");
    expect(html).toMatch(/<details class="mb-3" open/);
    expect(html).toContain("Clear all filters");
  });
});

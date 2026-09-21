"use client";

import { useMemo, useState } from "react";
import { Money } from "@/components/PrivacyContext";
import ResponsiveTable from "@/components/ResponsiveTable";
import FundFileLookup from "@/components/FundFileLookup";
import CompanyMoveLookup from "@/components/CompanyMoveLookup";
import CompanyDetailLookup from "@/components/CompanyDetailLookup";
import FilterLink from "@/components/FilterLink";
import AssetLogo from "@/components/AssetLogo";
import LogoLookup from "@/components/LogoLookup";
import { sectorLabel, industryLabel, regionOf, UNCLASSIFIED } from "@/lib/portfolio/exposure";
import { WINDOWS, type WindowKey } from "@/lib/funds/priceMoves";
import type { CompanyExposure, LookThrough, SectorMove } from "@/lib/portfolio/lookThrough";
import { shortName } from "@/lib/portfolio/shortName";
import { isIndexSource } from "@/lib/funds/indexProxy";
import { useMobileMode } from "@/components/MobileMode";
import MobileFold from "@/components/MobileFold";

type SortKey = "total" | "name" | "sector" | "industry" | "country" | "yours" | WindowKey;

/** Columns the reader turns on and off. The rest of them always show. */
type ColumnKey = "sector" | "industry" | "country" | "yours" | WindowKey;

const EXTRA_COLUMNS: { key: ColumnKey; label: string }[] = [
  { key: "sector", label: "Sector" },
  { key: "industry", label: "Industry" },
  { key: "country", label: "Country" },
  ...WINDOWS.map((w) => ({ key: w.key as ColumnKey, label: w.label })),
  { key: "yours", label: "Since you bought" },
];

/**
 * What a screen shows before anyone chooses.
 *
 * A phone renders each row as a card of labelled fields, so ten columns is ten
 * lines per company and a table nobody scrolls to the end of. It starts with
 * the two that answer "what is this worth and how has it done"; everything
 * else is a tick away, and a choice made is kept for the visit.
 */
const DEFAULT_COLUMNS: ColumnKey[] = ["sector", "industry", "country", "m1", "y1", "yours"];
const PHONE_COLUMNS: ColumnKey[] = ["y1", "yours"];

/** How many rows the table shows at once. 0 is every one it was given. */
const ROW_COUNTS = [25, 50, 100, 250, 1000, 0];

/**
 * The companies you hold, adding what your funds hold of them to the shares
 * you own directly.
 *
 * Filtering, sorting and choosing columns happen here rather than in the URL
 * because the whole list is already on the page: a fund's published file names
 * every position, so this is hundreds of rows that the reader narrows without
 * another round trip. What is *in* the list is decided on the server — see
 * `lookThrough` — and this never computes a figure, only hides rows.
 */
export default function InsideFunds({
  data,
  currency,
  filesDue,
  files,
  sectors,
  movesDue,
  detailsDue,
  logos,
  logosDue,
  showAllHref,
  showFewerHref,
}: {
  data: LookThrough;
  currency: string;
  filesDue: number;
  files: { lookup: string; fundName: string | null; asOf: string | null; rowCount: number; source: string }[];
  /** Each company's mark, by listing. Decoration: no figure here depends on it. */
  logos: Record<string, string>;
  /** Companies whose mark has never been looked for. */
  logosDue: number;
  /** How the sectors held have moved, per window, largest rise first. */
  sectors: Record<WindowKey, SectorMove[]>;
  /** Companies with a listing whose prices have not been read yet. */
  movesDue: number;
  /** Companies whose sector, industry or country is still unknown. */
  detailsDue: number;
  showAllHref?: string | null;
  /** Set while every company is listed, to go back to the largest ones. */
  showFewerHref?: string | null;
}) {
  const [query, setQuery] = useState("");
  const [sector, setSector] = useState("");
  const [industry, setIndustry] = useState("");
  const [country, setCountry] = useState("");
  const [fund, setFund] = useState("");
  const [minimum, setMinimum] = useState("");
  const [rows, setRows] = useState(50);
  const [sort, setSort] = useState<SortKey>("total");
  // Null until the reader picks: the default depends on the screen, which is
  // only known after the first render.
  const [chosenColumns, setChosenColumns] = useState<ColumnKey[] | null>(null);
  /** Which window the sector figures follow. */
  const [window, setWindow] = useState<WindowKey>("y1");
  const { phone } = useMobileMode();
  const columns = chosenColumns ?? (phone ? PHONE_COLUMNS : DEFAULT_COLUMNS);
  const shows = (key: ColumnKey) => columns.includes(key);

  const sectorOptions = useMemo(
    () => [...new Set(data.companies.map((c) => c.sector).filter((s): s is string => Boolean(s)))].sort(),
    [data.companies]
  );
  const industryOptions = useMemo(
    () =>
      [...new Set(data.companies.map((c) => c.industry).filter((s): s is string => Boolean(s)))].sort((a, b) =>
        industryLabel(a).localeCompare(industryLabel(b))
      ),
    [data.companies]
  );
  const countryOptions = useMemo(
    () => [...new Set(data.companies.map((c) => c.country).filter((s): s is string => Boolean(s)))].sort(),
    [data.companies]
  );
  const fundOptions = useMemo(() => [...new Set(data.companies.flatMap((c) => c.funds))].sort(), [data.companies]);

  const matching = useMemo(() => {
    const text = query.trim().toLowerCase();
    const least = Number(minimum.replace(",", "."));
    const floor = minimum.trim() !== "" && Number.isFinite(least) ? least : 0;
    const filtered = data.companies.filter(
      (c) =>
        (text === "" || c.name.toLowerCase().includes(text) || (c.symbol ?? "").toLowerCase().includes(text)) &&
        (sector === "" || c.sector === sector) &&
        (industry === "" || c.industry === industry) &&
        (country === "" || c.country === country) &&
        (fund === "" || c.funds.includes(fund)) &&
        c.percent >= floor
    );
    // A company with no reading for a window sits at the end of the order
    // rather than counting as one that has not moved.
    const byWindow = (key: WindowKey) => (a: CompanyExposure, b: CompanyExposure) =>
      (b.changes[key] ?? -Infinity) - (a.changes[key] ?? -Infinity);
    const by: Record<SortKey, (a: CompanyExposure, b: CompanyExposure) => number> = {
      total: (a, b) => b.total - a.total,
      name: (a, b) => a.name.localeCompare(b.name),
      sector: (a, b) => (a.sector ?? "zz").localeCompare(b.sector ?? "zz") || b.total - a.total,
      industry: (a, b) => (a.industry ?? "zz").localeCompare(b.industry ?? "zz") || b.total - a.total,
      country: (a, b) => (a.country ?? "zz").localeCompare(b.country ?? "zz") || b.total - a.total,
      yours: (a, b) => (b.yourGain ?? -Infinity) - (a.yourGain ?? -Infinity),
      m1: byWindow("m1"),
      m3: byWindow("m3"),
      m6: byWindow("m6"),
      y1: byWindow("y1"),
      y3: byWindow("y3"),
      y5: byWindow("y5"),
    };
    return [...filtered].sort(by[sort]);
  }, [data.companies, query, sector, industry, country, fund, minimum, sort]);

  if (data.fundValue === 0 && data.companies.length === 0) return null;

  const shown = rows > 0 ? matching.slice(0, rows) : matching;
  const matchingValue = matching.reduce((s, c) => s + c.total, 0);
  const unseen = Math.max(0, data.fundValue - data.fundSeen - data.fundsWithoutHoldings);
  const seenPercent = data.fundValue > 0 ? (data.fundSeen / data.fundValue) * 100 : 0;
  const narrowed = matching.length !== data.companies.length;
  const toggleColumn = (key: ColumnKey) =>
    setChosenColumns(columns.includes(key) ? columns.filter((k) => k !== key) : [...columns, key]);
  const chosenWindows = WINDOWS.filter((w) => columns.includes(w.key));

  return (
    <div className="card p-4 space-y-3">
      <div>
        <div className="text-sm font-medium">Inside your ETFs</div>
        <p className="text-xs text-[var(--muted)] mt-1 max-w-3xl">
          The companies you hold, adding what your funds hold of them to the shares you own directly. Every position of{" "}
          <Money value={data.fundsFromFile} currency={currency} /> in funds comes from the file their manager publishes;{" "}
          {data.fundsFromIndex > 0 && (
            <>
              <Money value={data.fundsFromIndex} currency={currency} /> is in a fund that follows its index by swap and
              owns none of those companies — they are the index&apos;s, from the file of a fund that does hold them, so
              they are your exposure rather than your shares;{" "}
            </>
          )}
          <Money value={data.fundsFromTopTen} currency={currency} /> is known only by its ten largest holdings, and{" "}
          <Money value={data.fundsWithoutHoldings} currency={currency} /> by neither. That covers{" "}
          <Money value={data.fundSeen} currency={currency} /> ({seenPercent.toFixed(0)}%) of the{" "}
          <Money value={data.fundValue} currency={currency} /> you hold in funds
          {unseen > 0 && (
            <>
              ; the other <Money value={unseen} currency={currency} /> is companies this cannot see, so a company&apos;s
              real total can be higher than shown
            </>
          )}
          . A fund&apos;s own cash and futures are left out here — they are in <em>By kind</em> above.
        </p>
      </div>

      {/* Four outside reads, each a few seconds: worth a tap to reach on a
          phone rather than four buttons above everything you came to see. */}
      <MobileFold title="Read the funds and the companies again" persistKey="inside-funds-sources">
        <div className="flex flex-wrap items-center gap-3">
          <FundFileLookup due={filesDue} />
          <CompanyDetailLookup due={detailsDue} />
          <CompanyMoveLookup due={movesDue} />
          <LogoLookup due={logosDue} />
        </div>
      </MobileFold>

      <SectorMoves sectors={sectors[window] ?? []} currency={currency} window={window} onWindow={setWindow} />

      {data.companies.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">
          No fund holdings read yet. Press the buttons above, and <em>Refresh sectors &amp; countries</em>.
        </p>
      ) : (
        <>
          <MobileFold
            title={narrowed ? "Filters and columns (in use)" : "Filters and columns"}
            persistKey="inside-funds-filters"
            className="space-y-3"
          >
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-end">
            <label className="text-xs">
              <span className="block text-[var(--muted)] mb-1">Company</span>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Name or symbol"
                className="input py-1 text-xs w-full"
              />
            </label>
            <label className="text-xs">
              <span className="block text-[var(--muted)] mb-1">Sector</span>
              <select value={sector} onChange={(e) => setSector(e.target.value)} className="input py-1 text-xs w-full">
                <option value="">All sectors</option>
                {sectorOptions.map((s) => (
                  <option key={s} value={s}>
                    {sectorLabel(s)}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs">
              <span className="block text-[var(--muted)] mb-1">Industry</span>
              <select value={industry} onChange={(e) => setIndustry(e.target.value)} className="input py-1 text-xs w-full">
                <option value="">All industries</option>
                {industryOptions.map((i) => (
                  <option key={i} value={i}>
                    {industryLabel(i)}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs">
              <span className="block text-[var(--muted)] mb-1">Country</span>
              <select value={country} onChange={(e) => setCountry(e.target.value)} className="input py-1 text-xs w-full">
                <option value="">All countries</option>
                {countryOptions.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs">
              <span className="block text-[var(--muted)] mb-1">Through</span>
              <select value={fund} onChange={(e) => setFund(e.target.value)} className="input py-1 text-xs w-full">
                <option value="">Any fund or directly</option>
                {fundOptions.map((f) => (
                  <option key={f} value={f}>
                    {shortName(f)}
                  </option>
                ))}
              </select>
            </label>
            {/* Typed rather than picked from a list: on a portfolio of 2 832
                companies the useful threshold is not one anybody guessed in
                advance. Empty means all of them. */}
            <label className="text-xs">
              <span className="block text-[var(--muted)] mb-1">At least (% of shares and funds)</span>
              <input
                value={minimum}
                onChange={(e) => setMinimum(e.target.value)}
                inputMode="decimal"
                placeholder="any"
                className="input py-1 text-xs w-full"
              />
            </label>
            <label className="text-xs">
              <span className="block text-[var(--muted)] mb-1">Show</span>
              <select
                value={String(rows)}
                onChange={(e) => setRows(Number(e.target.value))}
                className="input py-1 text-xs w-full"
              >
                {ROW_COUNTS.map((n) => (
                  <option key={n} value={n}>
                    {n === 0 ? `All ${matching.length}` : `${n} rows`}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs">
              <span className="block text-[var(--muted)] mb-1">Sort by</span>
              <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className="input py-1 text-xs w-full">
                <option value="total">Most held</option>
                <option value="yours">Your gain, biggest first</option>
                {WINDOWS.map((w) => (
                  <option key={w.key} value={w.key}>
                    Grew most over {w.label}
                  </option>
                ))}
                <option value="sector">Sector</option>
                <option value="industry">Industry</option>
                <option value="country">Country</option>
                <option value="name">Name</option>
              </select>
            </label>
            {(query || sector || industry || country || fund || minimum !== "") && (
              <button
                type="button"
                className="text-xs text-[var(--accent)] hover:underline mb-1"
                onClick={() => {
                  setQuery("");
                  setSector("");
                  setIndustry("");
                  setCountry("");
                  setFund("");
                  setMinimum("");
                }}
              >
                Clear filters
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[var(--muted)]">
            <span>Columns:</span>
            {EXTRA_COLUMNS.map((c) => (
              <label key={c.key} className="flex items-center gap-1">
                <input type="checkbox" checked={shows(c.key)} onChange={() => toggleColumn(c.key)} />
                {c.label}
              </label>
            ))}
          </div>
          </MobileFold>

          <p className="text-[11px] text-[var(--muted)]">
            {narrowed ? (
              <>
                {matching.length} of {data.companies.length} companies match,{" "}
                <Money value={matchingValue} currency={currency} /> of <Money value={data.total} currency={currency} /> in
                shares and funds.
              </>
            ) : (
              <>{data.companies.length} companies.</>
            )}
            {shown.length < matching.length && <> Showing the first {shown.length}.</>}
            {data.hiddenCompanies > 0 && (
              <>
                {" "}
                Another {data.hiddenCompanies} smaller ones, <Money value={data.hiddenValue} currency={currency} /> in
                total, were not sent to this page
                {showAllHref ? (
                  <>
                    {" "}
                    —{" "}
                    <FilterLink href={showAllHref} className="text-[var(--accent)] hover:underline">
                      send every company
                    </FilterLink>
                  </>
                ) : null}
                .
              </>
            )}
            {showFewerHref && (
              <>
                {" "}
                Every company a fund publishes was sent to this page —{" "}
                <FilterLink href={showFewerHref} className="text-[var(--accent)] hover:underline">
                  send the largest 250 instead
                </FilterLink>
                .
              </>
            )}
          </p>

          <div className="table-scroll" role="region" aria-label="Companies inside your ETFs" tabIndex={0}>
            <ResponsiveTable className="data-table">
              <thead>
                <tr>
                  <th>Company</th>
                  {shows("sector") && <th>Sector</th>}
                  {shows("industry") && <th>Industry</th>}
                  {shows("country") && <th>Country</th>}
                  <th className="text-right">Directly</th>
                  <th className="text-right">Through funds</th>
                  <th className="text-right">Total</th>
                  <th className="text-right">Share</th>
                  {chosenWindows.map((w) => (
                    <th key={w.key} className="text-right">
                      {w.label}
                    </th>
                  ))}
                  {shows("yours") && <th className="text-right">Since you bought</th>}
                </tr>
              </thead>
              <tbody>
                {shown.map((c) => (
                  <tr key={c.name}>
                    <td>
                      <div className="flex items-start gap-2">
                        <AssetLogo image={c.symbol ? logos[c.symbol] : null} name={c.name} />
                        <div className="min-w-0">
                          <div>
                            {c.name}
                            {/* The listing it trades under: the name is what a fund
                                writes, the symbol is what you type into a broker. */}
                            {c.symbol && <span className="text-[11px] text-[var(--muted)] ml-2">{c.symbol}</span>}
                          </div>
                          {c.funds.length > 0 && (
                            <div className="text-[11px] text-[var(--muted)]">via {c.funds.map(shortName).join(", ")}</div>
                          )}
                        </div>
                      </div>
                    </td>
                    {shows("sector") && (
                      <td className={c.sector ? undefined : "text-[var(--muted)]"}>
                        {c.sector ? sectorLabel(c.sector) : UNCLASSIFIED}
                      </td>
                    )}
                    {shows("industry") && (
                      <td className={c.industry ? undefined : "text-[var(--muted)]"}>
                        {c.industry ? industryLabel(c.industry) : UNCLASSIFIED}
                      </td>
                    )}
                    {shows("country") && (
                      <td className={c.country ? undefined : "text-[var(--muted)]"}>
                        {c.country ? `${c.country} · ${regionOf(c.country)}` : UNCLASSIFIED}
                      </td>
                    )}
                    <td className="text-right">
                      {c.direct > 0 ? (
                        <Money value={c.direct} currency={currency} />
                      ) : (
                        <span className="text-[var(--muted)]">—</span>
                      )}
                    </td>
                    <td className="text-right">
                      {c.viaFunds > 0 ? (
                        <Money value={c.viaFunds} currency={currency} />
                      ) : (
                        <span className="text-[var(--muted)]">—</span>
                      )}
                    </td>
                    <td className="text-right font-medium">
                      <Money value={c.total} currency={currency} />
                    </td>
                    <td className="text-right text-[var(--muted)]">{c.percent.toFixed(2)}%</td>
                    {chosenWindows.map((w) => (
                      <Percent key={w.key} value={c.changes[w.key] ?? null} />
                    ))}
                    {shows("yours") && <Percent value={c.yourGain} />}
                  </tr>
                ))}
              </tbody>
            </ResponsiveTable>
          </div>
        </>
      )}

      <p className="text-[11px] text-[var(--muted)]">
        Share is of the stocks and funds you hold.{" "}
        <strong className="text-[var(--foreground)]">The month and year columns are the company&apos;s own move</strong>,
        not your return: you bought a fund, not the shares inside it, and what its slice of a company cost you is not
        knowable. <strong className="text-[var(--foreground)]">Since you bought</strong> is yours, and is filled in only
        for what you bought yourself. A window a listing is younger than is left empty rather than measured from its
        first day. Sources: the fund managers&apos; own published files
        {files.length > 0 && (
          <>
            {" "}
            (
            {files
              .map(
                (f) =>
                  `${shortName(f.fundName ?? f.lookup)}: ${f.rowCount} positions${
                    isIndexSource(f.source) ? " of the index it follows by swap" : ""
                  }${f.asOf ? `, ${f.asOf}` : ""}`
              )
              .join("; ")}
            )
          </>
        )}
        , Yahoo Finance for sectors, countries and prices, and Parqet for the logos — each one asked for once, by
        listing, and kept here, so opening this page tells nobody what you hold. A company with no logo published shows
        its first letter.
      </p>
    </div>
  );
}

/** A percentage cell: green up, red down, and a dash where nothing was read. */
function Percent({ value }: { value: number | null }) {
  if (value === null) return <td className="text-right text-[var(--muted)]">—</td>;
  return (
    <td className={`text-right ${value >= 0 ? "text-[var(--green)]" : "text-[var(--red)]"}`}>
      {value >= 0 ? "+" : "−"}
      {Math.abs(value).toFixed(1)}%
    </td>
  );
}

/**
 * How the sectors you hold have moved.
 *
 * The market's move weighted by what you hold, which is the closest honest
 * answer to "which of my things have been rising": your own return per sector
 * would need what each slice cost you, and a fund never tells you that. Each
 * sector says how much of it was measured, so one read from two companies out
 * of fifty cannot pass for the whole.
 */
function SectorMoves({
  sectors,
  currency,
  window,
  onWindow,
}: {
  sectors: SectorMove[];
  currency: string;
  window: WindowKey;
  onWindow: (key: WindowKey) => void;
}) {
  const measured = sectors.filter((s) => s.change !== null);
  if (sectors.length === 0) return null;
  const best = measured[0];
  const worst = measured[measured.length - 1];

  return (
    <div className="rounded-lg border border-[var(--border)] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <div className="text-xs font-medium">
          How the sectors you hold have moved
          {best && worst && best !== worst && (
            <span className="font-normal text-[var(--muted)]">
              {" "}
              — {sectorLabel(best.sector ?? "")} most, {sectorLabel(worst.sector ?? "")} least
            </span>
          )}
        </div>
        <label className="text-[11px] text-[var(--muted)] flex items-center gap-1">
          over
          <select
            value={window}
            onChange={(e) => onWindow(e.target.value as WindowKey)}
            className="input py-0.5 text-[11px]"
          >
            {WINDOWS.map((w) => (
              <option key={w.key} value={w.key}>
                {w.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="space-y-1">
        {sectors.map((s) => {
          const coverage = s.value > 0 ? (s.measured / s.value) * 100 : 0;
          return (
            <div key={s.sector ?? "unclassified"} className="flex items-baseline justify-between gap-3 text-xs">
              <span className={s.sector ? undefined : "text-[var(--muted)]"}>
                {s.sector ? sectorLabel(s.sector) : UNCLASSIFIED}
              </span>
              <span className="text-[var(--muted)] shrink-0">
                <Money value={s.value} currency={currency} />
                {s.change === null ? (
                  <span> · not measured</span>
                ) : (
                  <>
                    {" · "}
                    <span style={{ color: s.change >= 0 ? "var(--green)" : "var(--red)" }}>
                      {s.change >= 0 ? "+" : "−"}
                      {Math.abs(s.change).toFixed(1)}%
                    </span>
                    {coverage < 99 && <span> ({coverage.toFixed(0)}% of it measured)</span>}
                  </>
                )}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

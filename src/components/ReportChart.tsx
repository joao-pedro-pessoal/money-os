"use client";

import { useCallback, useState } from "react";
import { usePrivacy } from "./PrivacyContext";
import { columnChart, compactAmount, lineChart, shortDate, type DatedValue } from "@/lib/reports/charts";

type Colour = "accent" | "muted" | "green" | "red";

export type ReportChartProps =
  | {
      kind: "line";
      title: string;
      series: { name: string; color: Colour; points: DatedValue[] }[];
      range: { from: string; to: string };
      unit: string;
    }
  | {
      kind: "columns";
      title: string;
      groups: { label: string; values: (number | null)[] }[];
      legend: { name: string; color: Colour }[];
      unit: string;
    };

const HEIGHT = 180;
const AREA = { left: 44, right: 8, top: 6, bottom: 20 };

/**
 * A report chart, drawn from the same geometry the PDF uses (`lib/reports/charts.ts`),
 * so what is on screen is what the file holds.
 *
 * Measured at the width it is shown at rather than scaled from a fixed one, so
 * the labels stay readable on a phone. In privacy mode the axis loses its
 * figures and keeps its shape.
 */
export default function ReportChart(props: ReportChartProps) {
  const { hidden } = usePrivacy();
  const [width, setWidth] = useState(600);

  // Measured as soon as the box exists, then again whenever it changes size.
  const measure = useCallback((element: HTMLDivElement) => {
    const fit = () => setWidth(Math.max(240, Math.round(element.clientWidth)));
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const area = { ...AREA, width, height: HEIGHT };
  const legend =
    props.kind === "line" ? props.series.map((s) => ({ name: s.name, color: s.color })) : props.legend;

  return (
    <figure className="space-y-2" aria-label={props.title}>
      <figcaption className="flex justify-between gap-3 text-sm">
        <span className="font-medium">{props.title}</span>
        <span className="text-xs text-[var(--muted)]">{props.unit}</span>
      </figcaption>
      <div ref={measure} className="w-full">
        <svg width={width} height={HEIGHT} role="img" aria-label={props.title} className="block max-w-full">
          {props.kind === "line" ? <Lines {...props} area={area} hidden={hidden} /> : <Columns {...props} area={area} hidden={hidden} />}
        </svg>
      </div>
      {legend.length > 1 && (
        <div className="flex gap-4 flex-wrap text-xs text-[var(--muted)]">
          {legend.map((l) => (
            <span key={l.name} className="inline-flex items-center gap-1.5">
              <span className="inline-block w-3 h-1 rounded" style={{ background: `var(--${l.color})` }} />
              {l.name}
            </span>
          ))}
        </div>
      )}
    </figure>
  );
}

type Area = typeof AREA & { width: number; height: number };

function Axis({ ticks, area, hidden }: { ticks: { value: number; y: number }[]; area: Area; hidden: boolean }) {
  return (
    <>
      {ticks.map((t) => (
        <g key={t.value}>
          <line x1={area.left} x2={area.width - area.right} y1={t.y} y2={t.y} stroke="var(--border)" strokeWidth={1} />
          {!hidden && (
            <text x={area.left - 6} y={t.y + 3.5} textAnchor="end" fontSize={10} fill="var(--muted)">
              {compactAmount(t.value)}
            </text>
          )}
        </g>
      ))}
    </>
  );
}

function Lines({
  series,
  range,
  area,
  hidden,
}: Extract<ReportChartProps, { kind: "line" }> & { area: Area; hidden: boolean }) {
  const chart = lineChart(series, area, range);
  return (
    <>
      <Axis ticks={chart.yTicks} area={area} hidden={hidden} />
      {chart.zeroY !== null && (
        <line x1={area.left} x2={area.width - area.right} y1={chart.zeroY} y2={chart.zeroY} stroke="var(--muted)" strokeWidth={1} />
      )}
      {chart.xLabels.map((l, i) => (
        <text
          key={l.date}
          x={l.x}
          y={area.height - 5}
          fontSize={10}
          fill="var(--muted)"
          textAnchor={i === 0 ? "start" : i === chart.xLabels.length - 1 ? "end" : "middle"}
        >
          {shortDate(l.date)}
        </text>
      ))}
      {chart.lines.map((line, i) =>
        line.points.length === 1 ? (
          <circle key={line.name} cx={line.points[0].x} cy={line.points[0].y} r={2.5} fill={`var(--${series[i].color})`} />
        ) : (
          <path key={line.name} d={line.path} fill="none" stroke={`var(--${series[i].color})`} strokeWidth={2} strokeLinejoin="round" />
        )
      )}
    </>
  );
}

function Columns({
  groups,
  legend,
  area,
  hidden,
}: Extract<ReportChartProps, { kind: "columns" }> & { area: Area; hidden: boolean }) {
  const chart = columnChart(groups, area);
  // Every label fits on a wide screen; on a phone, every other one.
  const every = chart.groups.length > 0 && chart.groups[0].width < 26 ? 2 : 1;
  return (
    <>
      <Axis ticks={chart.yTicks} area={area} hidden={hidden} />
      {chart.groups.map((g, i) => (
        <g key={`${g.label}-${i}`}>
          {g.columns.map((c, k) =>
            c.height > 0 ? (
              <rect key={k} x={c.x} y={c.y} width={c.width} height={c.height} fill={`var(--${legend[k]?.color ?? "accent"})`} rx={1.5} />
            ) : null
          )}
          {i % every === 0 && (
            <text x={g.x + g.width / 2} y={area.height - 5} fontSize={10} fill="var(--muted)" textAnchor="middle">
              {g.label}
            </text>
          )}
        </g>
      ))}
    </>
  );
}

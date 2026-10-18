"use client";

import { useText } from "@/components/useText";
import { useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { project } from "@/lib/stats";
import { fmt } from "@/lib/format";
import { Money, usePrivacy } from "./PrivacyContext";
import Section from "./Section";

/** A disposable scenario: assumptions never update transactions or settings. */
export default function ProjectionScenario({ current, monthlySaving, basis, currency }: {
  current: number; monthlySaving: number | null; basis: string; currency: string;
}) {
  const uiText = useText();
  const [saving, setSaving] = useState(monthlySaving === null ? "" : String(monthlySaving));
  const [rate, setRate] = useState(5);
  const [years, setYears] = useState(5);
  const { hidden } = usePrivacy();
  const amount = saving.trim() === "" ? null : Number(saving);
  const valid = amount !== null && Number.isFinite(amount);
  const horizons = Array.from({ length: years + 1 }, (_, index) => index);
  const projected = valid ? project(current, amount, rate, horizons) : [];
  const baseline = valid ? project(current, amount, 0, horizons) : [];
  const data = projected.map((point, index) => ({ year: point.years, scenario: point.value, baseline: baseline[index].value }));
  const last = data.every((point) => Number.isFinite(point.scenario) && Number.isFinite(point.baseline)) ? data.at(-1) : undefined;

  return <Section title="What could your money look like?" persistKey="future-scenario" defaultOpen essential>
    <p className="text-sm text-[var(--muted)] mb-4">{uiText("Choose a monthly amount and an assumed return to explore a possible future.")}</p>
    <div className="rounded-lg bg-[var(--surface-2)] p-3 mb-4">
      <div className="text-xs text-[var(--muted)]">{uiText("Starting from your current net worth")}</div>
      <div className="text-xl font-semibold mt-1"><Money value={current} currency={currency} /></div>
    </div>
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      <label className="col-span-2 sm:col-span-1 min-w-0 text-xs">{uiText("Monthly saving (")}{currency})
        {hidden ? <div className="input mt-1">{uiText("Hidden in privacy mode")}</div> :
          <input aria-label={uiText("Scenario monthly saving")} type="number" inputMode="decimal" step="0.01" className="input w-full mt-1"
            value={saving} onChange={(event) => setSaving(event.target.value)} placeholder={uiText("Enter an amount")} />}
      </label>
      <label className="min-w-0 text-xs">{uiText("Assumed annual return")}<select aria-label={uiText("Scenario annual return")} className="input w-full mt-1" value={rate} onChange={(event) => setRate(Number(event.target.value))}>
          <option value={0}>{uiText("0% — no growth")}</option><option value={5}>{uiText("5% per year")}</option><option value={8}>{uiText("8% per year")}</option>
        </select>
      </label>
      <label className="min-w-0 text-xs">{uiText("Time ahead")}<select aria-label={uiText("Scenario horizon")} className="input w-full mt-1" value={years} onChange={(event) => setYears(Number(event.target.value))}>
          <option value={1}>{uiText("1 year")}</option><option value={5}>{uiText("5 years")}</option><option value={10}>{uiText("10 years")}</option>
        </select>
      </label>
    </div>
    <p className="text-xs text-[var(--muted)] mt-2">
      {monthlySaving === null ? uiText("No recorded income or expenses to suggest a monthly amount. Enter your own assumption.") : uiText("The starting monthly amount uses {0}. You can change it here.", { "0": basis })}
      {" "}{uiText("Changes only affect this scenario.")}</p>
    {last ? <>
      <div className="rounded-lg border border-[var(--border)] p-4 mt-4" aria-live="polite">
        <div className="text-xs text-[var(--muted)]">{uiText("Illustrative value in ")}{years} {years === 1 ? uiText("year") : uiText("years")}</div>
        <div className="text-2xl font-semibold text-[var(--accent)] my-1"><Money value={last.scenario} currency={currency} /></div>
        <p className="text-xs text-[var(--muted)]">{uiText("With the same monthly amount and no growth: ")}<Money value={last.baseline} currency={currency} />.</p>
      </div>
      {!hidden && <div className="h-56 w-full mt-4" role="img" aria-label={uiText("Scenario compared with the same monthly saving and no growth")}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 10, left: 0, bottom: 4 }}>
            <CartesianGrid stroke="var(--border)" vertical={false} />
            <XAxis dataKey="year" tick={{ fontSize: 11 }} tickFormatter={(value) => value === 0 ? "Now" : `${value}y`} />
            <YAxis width={55} tick={{ fontSize: 11 }} tickFormatter={(value) => new Intl.NumberFormat("pt-PT", { notation: "compact" }).format(value)} />
            <Tooltip formatter={(value) => fmt(Number(value), currency)} labelFormatter={(value) => Number(value) === 0 ? "Now" : `After ${value} ${Number(value) === 1 ? "year" : "years"}`}
              contentStyle={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--foreground)", fontSize: 12 }} />
            <Line type="linear" dataKey="scenario" name={uiText("Scenario ({0}%)", {0: rate})} stroke="var(--accent)" strokeWidth={2} dot={false} isAnimationActive={false} />
            <Line type="linear" dataKey="baseline" name={uiText("No growth (0%)")} stroke="var(--muted)" strokeDasharray="5 5" dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>}
      {!hidden && <p className="text-xs text-[var(--muted)]">{uiText("Solid line: your scenario. Dashed line: the same saving with 0% growth.")}</p>}
    </> : <p className="text-sm text-[var(--muted)] mt-4" role="status">{uiText("Enter a monthly amount to see a scenario. Use 0 to explore growth without adding money.")}</p>}
    <details className="mt-4 text-xs text-[var(--muted)]">
      <summary className="cursor-pointer py-2">{uiText("How this scenario works")}</summary>
      <p className="pt-2 leading-relaxed">{uiText("The selected annual rate is divided by 12 and applied each month to the entire starting net worth, then the monthly amount is added. A negative monthly amount represents withdrawals. Taxes, fees and inflation are not included. Actual returns vary; these are examples, not a forecast or guaranteed outcomes.")}</p>
    </details>
  </Section>;
}

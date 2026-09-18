"use client";

import { useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { independencePlan, monthsGained, type PlanInput } from "@/lib/stats/independence";
import { fmt } from "@/lib/format";
import { Money, usePrivacy } from "./PrivacyContext";
import Section from "./Section";

const number = (text: string): number | null => {
  const n = Number(text.replace(",", "."));
  return text.trim() === "" || !Number.isFinite(n) ? null : n;
};

function duration(months: number): string {
  const years = Math.floor(months / 12);
  const rest = months % 12;
  const y = years > 0 ? `${years} ${years === 1 ? "year" : "years"}` : "";
  const m = rest > 0 ? `${rest} ${rest === 1 ? "month" : "months"}` : "";
  return [y, m].filter(Boolean).join(" and ") || "less than a month";
}

function change(months: number | null): string {
  if (months === null) return "—";
  if (months === 0) return "no change";
  return `${duration(Math.abs(months))} ${months < 0 ? "sooner" : "later"}`;
}

/**
 * A financial-independence plan: how much is enough to live on, and when you
 * get there at your current pace. Filled from your own figures, every
 * assumption editable, nothing saved — like the scenario beside it.
 */
export default function IndependencePlan({
  current,
  monthlySaving,
  monthlySpending,
  basis,
  currency,
}: {
  current: number;
  /** Average monthly surplus, or null with no recorded months. */
  monthlySaving: number | null;
  /** Average monthly spending, or null with no recorded months. */
  monthlySpending: number | null;
  basis: string;
  currency: string;
}) {
  const { hidden } = usePrivacy();
  const [start, setStart] = useState(String(Math.round(current)));
  const [saving, setSaving] = useState(monthlySaving === null ? "" : String(Math.round(monthlySaving)));
  const [spending, setSpending] = useState(monthlySpending === null ? "" : String(Math.round(monthlySpending)));
  const [realReturn, setRealReturn] = useState(4);
  const [withdrawal, setWithdrawal] = useState(4);
  const [age, setAge] = useState("");

  const values = { start: number(start), saving: number(saving), spending: number(spending) };
  const complete = values.start !== null && values.saving !== null && values.spending !== null && values.spending > 0;
  const input: PlanInput | null = complete
    ? {
        current: values.start!,
        monthlySaving: values.saving!,
        monthlySpending: values.spending!,
        realReturnPercent: realReturn,
        withdrawalPercent: withdrawal,
      }
    : null;
  const plan = input ? independencePlan(input) : null;
  const ageNow = number(age);
  const when =
    plan?.months != null && plan.months > 0
      ? new Date(new Date().getFullYear(), new Date().getMonth() + plan.months, 1).toLocaleDateString("en-GB", {
          month: "long",
          year: "numeric",
        })
      : null;
  const step = 100;

  return (
    <Section title="When is it enough?" persistKey="independence-plan" defaultOpen essential>
      <p className="text-sm text-[var(--muted)] mb-4">
        The money that could pay for your life, and when you reach it at your current pace. Filled in
        from your own figures; change any of them. Nothing here is saved.
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Field label={`Starting amount (${currency})`} hidden={hidden} value={start} onChange={setStart} aria="Plan starting amount" />
        <Field label={`Saved each month (${currency})`} hidden={hidden} value={saving} onChange={setSaving} aria="Plan monthly saving" />
        <Field label={`Spending to cover, a month (${currency})`} hidden={hidden} value={spending} onChange={setSpending} aria="Plan monthly spending" />
        <label className="min-w-0 text-xs">
          Return after inflation
          <select aria-label="Plan real return" className="input w-full mt-1" value={realReturn} onChange={(e) => setRealReturn(Number(e.target.value))}>
            <option value={0}>0% a year</option>
            <option value={2}>2% a year</option>
            <option value={4}>4% a year</option>
            <option value={6}>6% a year</option>
          </select>
        </label>
        <label className="min-w-0 text-xs">
          Spent each year
          <select aria-label="Plan withdrawal rate" className="input w-full mt-1" value={withdrawal} onChange={(e) => setWithdrawal(Number(e.target.value))}>
            <option value={3}>3% of the money</option>
            <option value={3.5}>3.5% of the money</option>
            <option value={4}>4% of the money</option>
          </select>
        </label>
        <label className="min-w-0 text-xs">
          Your age (optional)
          <input aria-label="Plan age" type="number" inputMode="numeric" className="input w-full mt-1" value={age} onChange={(e) => setAge(e.target.value)} />
        </label>
      </div>
      <p className="text-xs text-[var(--muted)] mt-2">
        Starting amount is your net worth; saving and spending are averages over {basis}. All in
        today&apos;s money: the return is after inflation.
      </p>

      {!plan || plan.target === null ? (
        <p className="text-sm text-[var(--muted)] mt-4" role="status">
          Enter a starting amount, a monthly saving and the monthly spending to cover.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4" aria-live="polite">
            <div className="rounded-lg border border-[var(--border)] p-4">
              <div className="text-xs text-[var(--muted)]">Enough to live on</div>
              <div className="text-2xl font-semibold my-1">
                <Money value={plan.target} currency={currency} />
              </div>
              <p className="text-xs text-[var(--muted)]">
                A year of spending ÷ {withdrawal}% — about {Math.round(100 / withdrawal)} times it.
              </p>
              <div className="h-1.5 w-full rounded-full bg-[var(--surface-2)] overflow-hidden mt-3">
                <div className="h-full bg-[var(--accent)]" style={{ width: `${Math.min(100, Math.max(0, (plan.progress ?? 0) * 100))}%` }} />
              </div>
              <p className="text-xs text-[var(--muted)] mt-1">{Math.max(0, (plan.progress ?? 0) * 100).toFixed(1)}% of the way there</p>
            </div>
            <div className="rounded-lg border border-[var(--border)] p-4">
              <div className="text-xs text-[var(--muted)]">At this pace</div>
              {plan.months === 0 ? (
                <div className="text-2xl font-semibold text-[var(--green)] my-1">Already there</div>
              ) : plan.months === null ? (
                <>
                  <div className="text-2xl font-semibold text-[var(--amber)] my-1">Not within 100 years</div>
                  <p className="text-xs text-[var(--muted)]">Save more, spend less, or change the assumptions.</p>
                </>
              ) : (
                <>
                  <div className="text-2xl font-semibold text-[var(--accent)] my-1">{duration(plan.months)}</div>
                  <p className="text-xs text-[var(--muted)]">
                    Around {when}
                    {ageNow !== null && ageNow > 0 ? `, at about ${Math.floor(ageNow + plan.months / 12)}` : ""}.
                  </p>
                </>
              )}
              {input && plan.months !== 0 && (
                <ul className="text-xs text-[var(--muted)] mt-3 space-y-1">
                  <li>
                    Saving <Money value={step} currency={currency} /> more a month:{" "}
                    {change(monthsGained(input, { ...input, monthlySaving: input.monthlySaving + step }))}
                  </li>
                  <li>
                    Spending <Money value={step} currency={currency} /> less a month:{" "}
                    {change(monthsGained(input, { ...input, monthlySpending: Math.max(0, input.monthlySpending - step) }))}
                  </li>
                </ul>
              )}
            </div>
          </div>

          {!hidden && plan.path.length > 1 && (
            <div className="h-56 w-full mt-4" role="img" aria-label="Projected money against the amount that is enough">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={plan.path} margin={{ top: 8, right: 10, left: 0, bottom: 4 }}>
                  <CartesianGrid stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="year" tick={{ fontSize: 11 }} tickFormatter={(v) => (v === 0 ? "Now" : `${v}y`)} />
                  <YAxis width={55} tick={{ fontSize: 11 }} tickFormatter={(v) => new Intl.NumberFormat("pt-PT", { notation: "compact" }).format(v)} />
                  <Tooltip
                    formatter={(v) => fmt(Number(v), currency)}
                    labelFormatter={(v) => (Number(v) === 0 ? "Now" : `After ${v} ${Number(v) === 1 ? "year" : "years"}`)}
                    contentStyle={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--foreground)", fontSize: 12 }}
                  />
                  <ReferenceLine y={plan.target} stroke="var(--green)" strokeDasharray="5 5" />
                  <Line type="linear" dataKey="value" name="Your money" stroke="var(--accent)" strokeWidth={2} dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
          {!hidden && <p className="text-xs text-[var(--muted)]">Line: your money. Dashed line: enough to live on.</p>}
        </>
      )}

      <details className="mt-4 text-xs text-[var(--muted)]">
        <summary className="cursor-pointer py-2">How this plan works</summary>
        <p className="pt-2 leading-relaxed">
          Enough is a year of the spending you enter divided by the share you would spend each year
          (4% is the common rule of thumb, from studies of past markets; 3–3.5% is more cautious for
          retirements longer than thirty years). Each month the money grows by the return after
          inflation, divided by twelve, and the saving is added. Taxes, fees and pensions are not
          included, and real returns vary from year to year: this is arithmetic on assumptions, not a
          forecast or advice.
        </p>
      </details>
    </Section>
  );
}

function Field({
  label,
  value,
  onChange,
  hidden,
  aria,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hidden: boolean;
  aria: string;
}) {
  return (
    <label className="min-w-0 text-xs">
      {label}
      {hidden ? (
        <div className="input mt-1">Hidden in privacy mode</div>
      ) : (
        <input aria-label={aria} type="number" inputMode="decimal" step="1" className="input w-full mt-1" value={value} onChange={(e) => onChange(e.target.value)} />
      )}
    </label>
  );
}

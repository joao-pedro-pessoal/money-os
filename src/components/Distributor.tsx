"use client";

import { useState, useTransition } from "react";
import { planDistribution } from "@/actions/distribute";
import { STRATEGIES, type Strategy, type Share } from "@/lib/accounting/distribute";
import { fmt } from "@/lib/format";

type Plan = Awaited<ReturnType<typeof planDistribution>>;

/**
 * "I have €800 to put away. Where does it go?"
 *
 * The default answer is a percentage split derived from your ranking, so every
 * goal advances and the important ones advance faster. That's usually what
 * people mean by priorities — not "the holiday fund gets nothing for a year",
 * which is what a strict waterfall does. The waterfall is still there for when
 * finishing one goal is the point.
 *
 * The computed shares are editable. A default you can't override is a rule, and
 * this is your money.
 */
export default function Distributor({
  available,
  currency,
  defaultShares,
  applyAction,
}: {
  available: number;
  currency: string;
  defaultShares: Share[];
  applyAction: (formData: FormData) => void;
}) {
  const [amount, setAmount] = useState("");
  const [strategy, setStrategy] = useState<Strategy>("priority");
  const [shares, setShares] = useState<Share[]>(defaultShares);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [pending, startTransition] = useTransition();

  const value = Number(amount);
  const valid = Number.isFinite(value) && value > 0;
  const shareTotal = Math.round(shares.reduce((s, x) => s + x.percent, 0) * 100) / 100;

  function preview() {
    if (!valid) return;
    startTransition(async () => {
      setPlan(await planDistribution(value, strategy, strategy === "manual" ? shares : undefined));
    });
  }

  function editShare(id: string, percent: number) {
    setShares(shares.map((s) => (s.id === id ? { ...s, percent } : s)));
    setStrategy("manual");
    setPlan(null);
  }

  const active = STRATEGIES.find((s) => s.value === strategy)!;

  return (
    <div className="space-y-3">
      <div className="flex gap-1 flex-wrap">
        {STRATEGIES.map((s) => (
          <button
            key={s.value}
            type="button"
            onClick={() => {
              setStrategy(s.value);
              if (s.value === "priority") setShares(defaultShares);
              setPlan(null);
            }}
            className="badge border text-xs"
            style={{
              borderColor: strategy === s.value ? "var(--accent)" : "var(--border)",
              color: strategy === s.value ? "var(--accent)" : "var(--muted)",
            }}
          >
            {s.label}
          </button>
        ))}
      </div>
      <p className="text-xs text-[var(--muted)]">{active.help} Nothing moves until you apply it.</p>

      <div className="flex gap-2">
        <input
          type="number"
          step="0.01"
          min="0"
          value={amount}
          onChange={(e) => {
            setAmount(e.target.value);
            setPlan(null);
          }}
          placeholder={`Amount to distribute (${fmt(available, currency)} free)`}
          className="input"
        />
        <button
          type="button"
          onClick={preview}
          disabled={!valid || pending}
          className="btn whitespace-nowrap"
          style={!valid || pending ? { opacity: 0.5 } : undefined}
        >
          {pending ? "Working…" : "Plan it"}
        </button>
      </div>

      {valid && value > available && (
        <div className="text-xs text-[var(--amber)]">
          That&apos;s more than the {fmt(available, currency)} of free cash you have. The plan will
          show what can actually be funded.
        </div>
      )}

      {/* Editable shares. Touching one switches to "my own split", because the
          alternative is silently ignoring what you typed. */}
      {strategy !== "waterfall" && shares.length > 0 && (
        <div className="border border-[var(--border)] rounded-lg p-3 space-y-1">
          <div className="flex justify-between text-[10px] text-[var(--muted)] mb-1">
            <span>Where each share goes</span>
            <span style={{ color: Math.abs(shareTotal - 100) > 0.01 ? "var(--amber)" : undefined }}>
              {shareTotal}%{Math.abs(shareTotal - 100) > 0.01 && " — will be scaled to 100"}
            </span>
          </div>
          {shares.map((s) => (
            <div key={s.id} className="flex items-center gap-2 text-xs">
              <span className="flex-1 truncate text-[var(--foreground)]" title={s.name}>
                {s.name}
              </span>
              {/* What this share is worth at the amount typed — a percentage of
                  an unknown number is hard to judge, a euro figure isn't. */}
              {valid && (
                <span className="text-[10px] text-[var(--muted)] whitespace-nowrap">
                  {fmt((value * s.percent) / 100, currency)}
                </span>
              )}
              <input
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={s.percent}
                onChange={(e) => editShare(s.id, Number(e.target.value))}
                className="input input-narrow text-xs py-0.5 w-20"
              />
              <span className="text-[var(--muted)] w-3">%</span>
            </div>
          ))}
          {strategy === "manual" && (
            <button
              type="button"
              onClick={() => {
                setShares(defaultShares);
                setStrategy("priority");
                setPlan(null);
              }}
              className="text-[10px] text-[var(--accent)] hover:underline pt-1"
            >
              Back to the priority split
            </button>
          )}
        </div>
      )}

      {plan && (
        <div className="space-y-3">
          {plan.sourcedMoves.length === 0 ? (
            <div className="text-xs text-[var(--muted)] py-3">
              Nothing to do — every goal with a target is already full.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="data-table whitespace-nowrap text-xs">
                <thead>
                  <tr>
                    <th>Move</th>
                    <th>From</th>
                    <th>To</th>
                    <th>Why</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.sourcedMoves.map((m, i) => (
                    <tr key={i}>
                      <td className="font-medium">{fmt(m.amount, plan.baseCurrency)}</td>
                      <td className="text-[var(--muted)]">{m.accountName}</td>
                      <td>
                        {m.bucketName}
                        {m.completes && <span className="text-[var(--green)] ml-1">✓</span>}
                      </td>
                      <td className="text-[var(--muted)] max-w-[18rem] truncate" title={m.reason}>
                        {m.reason}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
            <span className="text-[var(--green)]">
              {fmt(plan.distributed, plan.baseCurrency)} allocated
            </span>
            {plan.leftOver > 0 && (
              <span className="text-[var(--muted)]">
                {fmt(plan.leftOver, plan.baseCurrency)} left over — every goal is full
              </span>
            )}
            {plan.unfunded > 0 && (
              <span className="text-[var(--amber)]">
                {fmt(plan.unfunded, plan.baseCurrency)} couldn&apos;t be funded from free cash
              </span>
            )}
          </div>

          {plan.stillShort.length > 0 && (
            <div className="text-xs text-[var(--muted)]">
              Still short:{" "}
              {plan.stillShort
                .slice(0, 4)
                .map((s) => `${s.name} (${fmt(s.missing, plan.baseCurrency)})`)
                .join(", ")}
              {plan.stillShort.length > 4 && ` +${plan.stillShort.length - 4}`}
            </div>
          )}

          {plan.sourcedMoves.length > 0 && (
            <form action={applyAction}>
              <input type="hidden" name="amount" value={value} />
              <input type="hidden" name="strategy" value={strategy} />
              <input type="hidden" name="shares" value={JSON.stringify(plan.shares)} />
              <button
                type="submit"
                className="btn"
                onClick={(e) => {
                  if (
                    !confirm(
                      `Allocate ${fmt(plan.distributed, plan.baseCurrency)} across ${plan.moves.length} goal(s)?`
                    )
                  )
                    e.preventDefault();
                }}
              >
                Apply these moves
              </button>
              <p className="text-xs text-[var(--muted)] mt-2">
                This marks the money as reserved inside the accounts it already sits in. No real
                transfer happens — do that at your bank if the goal lives elsewhere.
              </p>
            </form>
          )}
        </div>
      )}
    </div>
  );
}

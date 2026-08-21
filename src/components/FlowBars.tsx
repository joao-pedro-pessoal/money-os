import { Money } from "@/components/PrivacyContext";
import Link from "next/link";
import type { MonthFlows } from "@/lib/accounting/fixedVariable";

function Bar({
  label,
  split,
  max,
  currency,
  colour,
}: {
  label: string;
  split: MonthFlows["income"];
  max: number;
  currency: string;
  colour: string;
}) {
  const pct = (n: number) => (max > 0 ? (n / max) * 100 : 0);

  return (
    <div>
      <div className="flex justify-between items-baseline text-xs mb-1">
        <span className="text-[var(--muted)]">{label}</span>
        <Money value={split.total} currency={currency} />
      </div>
      <div className="h-3 rounded-full bg-[var(--surface-2)] overflow-hidden flex">
        {/* Fixed first and solid; the variable part is hatched lighter, so the
            floor reads as the floor rather than as part of one blob. */}
        <div style={{ width: `${pct(split.fixed)}%`, background: colour }} />
        <div style={{ width: `${pct(split.variable)}%`, background: colour, opacity: 0.45 }} />
        <div
          style={{ width: `${pct(split.unclassified)}%`, background: "var(--muted)", opacity: 0.3 }}
        />
      </div>
      <div className="flex gap-3 text-[10px] text-[var(--muted)] mt-1 flex-wrap">
        <span>fixed {split.fixed.toFixed(0)}</span>
        <span>variable {split.variable.toFixed(0)}</span>
        {split.unclassified > 0 && <span>unclassified {split.unclassified.toFixed(0)}</span>}
      </div>
    </div>
  );
}

/**
 * Income and spending, each split into the part that's decided and the part
 * that isn't.
 *
 * The figure worth looking at is `committedNet`: fixed income minus fixed
 * costs. When it's negative the month needs variable work just to stand still,
 * and that's a fact that disappears inside a single net number.
 */
export default function FlowBars({
  shape,
  currency,
}: {
  shape: { flows: MonthFlows; unclassified: { id: string; name: string; amount: number }[] };
  currency: string;
}) {
  const { flows } = shape;
  const max = Math.max(flows.income.total, flows.expenses.total, 1);

  return (
    <div className="space-y-4">
      <Bar label="In" split={flows.income} max={max} currency={currency} colour="var(--green)" />
      <Bar label="Out" split={flows.expenses} max={max} currency={currency} colour="var(--red)" />

      <div className="grid grid-cols-2 gap-3 pt-1">
        <div>
          <div className="text-[10px] text-[var(--muted)]">Committed floor</div>
          <div
            className="text-sm font-medium"
            style={{ color: flows.committedNet < 0 ? "var(--red)" : undefined }}
          >
            <Money value={flows.committedNet} currency={currency} />
          </div>
          <div className="text-[10px] text-[var(--muted)]">fixed in − fixed out</div>
        </div>
        <div>
          <div className="text-[10px] text-[var(--muted)]">Net this month</div>
          <div
            className="text-sm font-medium"
            style={{ color: flows.discretionary < 0 ? "var(--red)" : undefined }}
          >
            <Money value={flows.discretionary} currency={currency} />
          </div>
        </div>
      </div>

      {flows.committedNet < 0 && (
        <div className="text-[10px] text-[var(--amber)]">
          Your fixed costs are higher than your fixed income, so the month needs variable earnings
          just to break even.
        </div>
      )}

      {/* A mixed category lands entirely on one side. Naming the biggest
          unclassified ones is more useful than a generic nudge. */}
      {shape.unclassified.length > 0 && (
        <div className="text-[10px] text-[var(--muted)]">
          Not marked fixed or variable yet:{" "}
          {shape.unclassified.slice(0, 3).map((c) => c.name).join(", ")}
          {shape.unclassified.length > 3 && ` +${shape.unclassified.length - 3}`}.{" "}
          <Link href="/settings/categories" className="text-[var(--accent)]">
            Classify
          </Link>
        </div>
      )}
    </div>
  );
}

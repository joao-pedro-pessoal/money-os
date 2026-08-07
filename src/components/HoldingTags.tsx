import { tagLabel, riskColor } from "@/lib/portfolio/tags";

export interface HoldingTagValues {
  riskLevel?: string | null;
  expectedReturn?: string | null;
  timeHorizon?: string | null;
  liquidity?: string | null;
}

/** Renders whichever of the four asset-allocation tags are set as small badges. */
export default function HoldingTags({ riskLevel, expectedReturn, timeHorizon, liquidity }: HoldingTagValues) {
  const items = [
    riskLevel ? { label: tagLabel(riskLevel), color: riskColor(riskLevel) } : null,
    timeHorizon ? { label: tagLabel(timeHorizon), color: "var(--muted)" } : null,
    expectedReturn ? { label: tagLabel(expectedReturn), color: "var(--muted)" } : null,
    liquidity ? { label: tagLabel(liquidity), color: "var(--muted)" } : null,
  ].filter((x): x is { label: string | null; color: string } => x !== null);

  if (items.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {items.map((it, i) => (
        <span
          key={i}
          className="badge"
          style={{ border: `1px solid ${it.color}`, color: it.color }}
        >
          {it.label}
        </span>
      ))}
    </div>
  );
}

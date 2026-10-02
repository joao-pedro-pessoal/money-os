"use client";

import { usePrivacy } from "./PrivacyContext";

/**
 * A percentage about your own money — a return, a share of what you hold —
 * hidden by privacy mode like the amounts it describes. A return of +12% on a
 * known deposit says as much as the euros would.
 *
 * `value` is already a percentage: 12.5 is "12.5%".
 */
export default function Percent({
  value,
  digits = 1,
  signed = false,
  suffix = "%",
}: {
  value: number;
  digits?: number;
  /** Show "+" before a positive figure, for a change rather than a share. */
  signed?: boolean;
  /** "%" unless the figure is in something else, such as percentage points. */
  suffix?: string;
}) {
  const { hidden } = usePrivacy();
  if (hidden) return <span>••••</span>;
  return (
    <span>
      {signed && value > 0 ? "+" : ""}
      {value.toFixed(digits)}
      {suffix}
    </span>
  );
}

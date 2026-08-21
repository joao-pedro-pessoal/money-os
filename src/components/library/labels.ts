import { RESOURCE_TYPES, LEVELS, STATUSES, PROGRESS_UNITS } from "@/lib/library/types";

const LABELS: Record<string, string> = Object.fromEntries([
  ...RESOURCE_TYPES.map((t) => [t.value, t.singular] as const),
  ...LEVELS.map((l) => [l.value, l.label] as const),
  ...STATUSES.map((s) => [s.value, s.label] as const),
  ...PROGRESS_UNITS.map((u) => [u.value, u.label] as const),
]);

/** A readable label for any of the library's enum values. */
export function tagLabelFor(value: string | null | undefined): string {
  if (!value) return "—";
  return LABELS[value] ?? value;
}

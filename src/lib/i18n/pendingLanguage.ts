import type { Language } from "./languages";

export type PendingLanguage = { from: Language; value: Language };

/** An optimistic choice lasts only until the server acknowledges or replaces it. */
export function pendingLanguage(server: Language, pending: PendingLanguage | null): PendingLanguage | null {
  return pending && server === pending.from && server !== pending.value ? pending : null;
}

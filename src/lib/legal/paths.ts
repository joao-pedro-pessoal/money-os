/**
 * Where the privacy notice, the terms and the account-deletion page live.
 * Apart from their text so the proxy, which runs on every request, does not
 * carry every word of them to answer "is this path public".
 */
export type LegalKind = "privacy" | "terms" | "deletion";

export const LEGAL_KINDS: readonly LegalKind[] = ["privacy", "terms", "deletion"];

export const LEGAL_PATHS: Record<LegalKind, string> = {
  privacy: "/privacy",
  terms: "/terms",
  deletion: "/delete-account",
};

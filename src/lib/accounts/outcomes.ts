/**
 * What the sign-in page is told by actions/auth.ts. Kept out of that
 * "use server" module, whose exports can only be async functions.
 */

export type SignInOutcome =
  | { kind: "ok" }
  /**
   * Signed in, and the account had no recovery code until now — the owner's
   * first sign-in, or an account from the vault — so here is one, shown once.
   */
  | { kind: "new-code"; recoveryCode: string }
  /** An account from before sign-in keys: the password itself is needed, once. */
  | { kind: "legacy" }
  | { kind: "wrong" }
  | { kind: "locked"; until: string }
  | { kind: "refused"; reason: string };

export type SignUpOutcome = { kind: "ok"; recoveryCode: string } | { kind: "refused"; reason: string };

export type RecoveryOutcome =
  | { kind: "ok"; recoveryCode: string }
  | { kind: "wrong" }
  | { kind: "locked"; until: string }
  | { kind: "refused"; reason: string };

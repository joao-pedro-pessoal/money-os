/**
 * One sign-in page for everyone on this Money OS, and where each email goes.
 *
 * The owner signs in with `APP_EMAIL` and `APP_PASSWORD`, and gets the site.
 * Anyone else signs in with the email and password of their vault account, and
 * gets their vault — still to be opened with their twelve words on the next
 * screen. The answer to a wrong password is the same on both paths, so the
 * page does not say which emails belong to whom.
 *
 * Without `APP_EMAIL` an email with a vault account still goes to its vault,
 * and any other email is taken as the owner's: that keeps an installation
 * that has not set it yet openable exactly as before, with the password alone.
 */

export type SignInRoute = "owner" | "vault";

/** The form of an email every comparison uses. */
export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

/** The owner's email from the environment, or null when it is not set. */
export function ownerEmailFrom(value: string | undefined): string | null {
  const email = normalizeEmail(value ?? "");
  return email === "" ? null : email;
}

export function signInRoute({
  email,
  ownerEmail,
  hasVaultAccount,
}: {
  email: string;
  ownerEmail: string | null;
  hasVaultAccount: boolean;
}): SignInRoute {
  if (ownerEmail !== null) return normalizeEmail(email) === ownerEmail ? "owner" : "vault";
  return hasVaultAccount ? "vault" : "owner";
}

/** What the sign-in page is told. The session is a vault's; the owner's is a cookie. */
export type SignInOutcome =
  | { kind: "owner" }
  | { kind: "vault"; session: { token: string; userId: string; deviceId: string; email: string } }
  | { kind: "wrong" }
  | { kind: "locked"; until: string }
  | { kind: "refused"; reason: string };

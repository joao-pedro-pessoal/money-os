// Internal server helper, deliberately not a callable "use server" module.
import { OWNER_USER_ID } from "@/db/schema";
import { INVESTMENTS_ENABLED } from "@/lib/release/edition";
import { currentUserId } from "./session";

/** Only call with an identity already checked by the server's session reader. */
export function investmentsFor(userId: string | null): boolean {
  return INVESTMENTS_ENABLED || userId === OWNER_USER_ID;
}

export async function currentInvestments(): Promise<boolean> {
  if (INVESTMENTS_ENABLED) return true;
  // Ordinary accounts are refused before data access; the owner is also checked for revocation.
  return investmentsFor(await currentUserId(OWNER_USER_ID));
}

export async function requireInvestments(): Promise<void> {
  if (!(await currentInvestments())) throw new Error("Investments are not available in this version.");
}

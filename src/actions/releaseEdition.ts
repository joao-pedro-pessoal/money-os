// Internal server helper, deliberately not a callable "use server" module.
import { OWNER_USER_ID } from "@/db/schema";
import { actingAs } from "@/db/acting";
import { INVESTMENTS_ENABLED } from "@/lib/release/edition";
import { currentUserId } from "./session";
import { requireServerSession } from "./requestSession";

/**
 * The owner's own full edition on the launch site, switched on only when the
 * host sets OWNER_FULL_EDITION=1 (since 22/11 the owner uses the normal edition
 * like everyone else; investments stay in the data and in the home copy).
 */
function ownerFullEdition(): boolean {
  return process.env.OWNER_FULL_EDITION === "1";
}

/** Only call with an identity already checked by the server's session reader. */
export function investmentsFor(userId: string | null): boolean {
  return INVESTMENTS_ENABLED || (ownerFullEdition() && userId === OWNER_USER_ID);
}

export async function currentInvestments(): Promise<boolean> {
  if (INVESTMENTS_ENABLED) return true;
  // Work done for a named person (the scheduled sync) has no cookie to read.
  const named = actingAs();
  if (named !== undefined) return investmentsFor(named);
  // Ordinary accounts are refused before data access; the owner is also checked for revocation.
  return investmentsFor(await currentUserId(OWNER_USER_ID));
}

export async function requireInvestments(): Promise<void> {
  if (!(await currentInvestments())) throw new Error("Investments are not available in this version.");
  await requireServerSession();
}

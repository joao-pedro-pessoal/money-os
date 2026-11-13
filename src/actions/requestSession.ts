// Internal authorization helper; never a callable "use server" endpoint.
import { actingAs } from "@/db/acting";
import { hasSession } from "./session";

export class SessionRequiredError extends Error {}

/** Anonymous RPCs cannot choose the server-only asUser context. */
export async function requireServerSession(): Promise<void> {
  const named = actingAs();
  if (named !== undefined) {
    if (named) return;
    throw new SessionRequiredError("Sign in again.");
  }
  if (!(await hasSession())) throw new SessionRequiredError("Sign in again.");
}

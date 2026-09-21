import { latestSyncVault, putSyncVault } from "@/actions/vaultServer";
import { empty, json, NO_TOKEN, readJson, refused, tokenOf, unreadable } from "./respond";

export const dynamic = "force-dynamic";

/**
 * The newest vault for the signed-in account.
 *
 * 204 when the account has none yet, so a new device can tell "nothing stored"
 * from an error and send the first version.
 */
export async function GET(request: Request) {
  const result = await latestSyncVault(tokenOf(request));
  if (!result.ok) return refused(result);
  if (result.vault === null) return empty(204);
  return json(result.vault, 200);
}

/**
 * Stores a new version, only on top of the version the device expects.
 *
 * 409 means another device stored a newer version first: read it, merge, send
 * again. It is the answer the device's sync round is built around, not a failure.
 */
export async function PUT(request: Request) {
  // Before the body, not after: `putSyncVault` authenticates the token itself
  // — it has to, because a server action can be called without passing through
  // this route at all — but it can only do that once the body it is given has
  // been read, and reading an unbounded body on behalf of a caller who has
  // shown nothing is the whole attack. A request with no token costs a header
  // lookup now.
  const token = tokenOf(request);
  if (!token) return refused(NO_TOKEN);
  const read = await readJson(request);
  if (!read.ok) return unreadable(read);
  const result = await putSyncVault(token, read.body);
  if (!result.ok) return refused(result);
  return json({ vaultVersion: result.vaultVersion }, 201);
}

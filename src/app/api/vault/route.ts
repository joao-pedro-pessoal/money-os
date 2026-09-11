import { latestSyncVault, putSyncVault } from "@/actions/vaultServer";
import { empty, json, notJson, readJson, refused, tokenOf } from "./respond";

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
  const body = await readJson(request);
  if (body === undefined) return notJson();
  const result = await putSyncVault(tokenOf(request), body);
  if (!result.ok) return refused(result);
  return json({ vaultVersion: result.vaultVersion }, 201);
}

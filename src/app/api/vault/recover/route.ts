import { recoverSyncAccount } from "@/actions/vaultServer";
import { json, MAX_CREDENTIAL_BODY_BYTES, readJson, refused, unreadable } from "../respond";

export const dynamic = "force-dynamic";

/** Replaces a forgotten password, with the twelve words as proof, and signs this device in. */
export async function POST(request: Request) {
  const read = await readJson(request, MAX_CREDENTIAL_BODY_BYTES);
  if (!read.ok) return unreadable(read);
  const result = await recoverSyncAccount(read.body);
  if (!result.ok) return refused(result);
  return json({ token: result.token, userId: result.userId, deviceId: result.deviceId }, 200);
}

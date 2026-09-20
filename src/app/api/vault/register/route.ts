import { registerSyncAccount } from "@/actions/vaultServer";
import { json, MAX_CREDENTIAL_BODY_BYTES, readJson, refused, unreadable } from "../respond";

export const dynamic = "force-dynamic";

/** Creates a sync account with a password and signs this device in. */
export async function POST(request: Request) {
  const read = await readJson(request, MAX_CREDENTIAL_BODY_BYTES);
  if (!read.ok) return unreadable(read);
  const result = await registerSyncAccount(read.body);
  if (!result.ok) return refused(result);
  return json({ token: result.token, userId: result.userId, deviceId: result.deviceId }, 201);
}

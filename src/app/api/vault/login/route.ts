import { loginSyncAccount } from "@/actions/vaultServer";
import { json, MAX_CREDENTIAL_BODY_BYTES, readJson, refused, unreadable } from "../respond";

export const dynamic = "force-dynamic";

/** Signs a device into an existing sync account. */
export async function POST(request: Request) {
  const read = await readJson(request, MAX_CREDENTIAL_BODY_BYTES);
  if (!read.ok) return unreadable(read);
  const result = await loginSyncAccount(read.body);
  if (!result.ok) return refused(result);
  return json({ token: result.token, userId: result.userId, deviceId: result.deviceId }, 200);
}

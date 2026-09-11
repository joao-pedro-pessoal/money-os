import { registerSyncAccount } from "@/actions/vaultServer";
import { json, notJson, readJson, refused } from "../respond";

export const dynamic = "force-dynamic";

/** Creates a sync account with a password and signs this device in. */
export async function POST(request: Request) {
  const body = await readJson(request);
  if (body === undefined) return notJson();
  const result = await registerSyncAccount(body);
  if (!result.ok) return refused(result);
  return json({ token: result.token, userId: result.userId, deviceId: result.deviceId }, 201);
}

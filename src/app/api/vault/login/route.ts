import { loginSyncAccount } from "@/actions/vaultServer";
import { json, notJson, readJson, refused } from "../respond";

export const dynamic = "force-dynamic";

/** Signs a device into an existing sync account. */
export async function POST(request: Request) {
  const body = await readJson(request);
  if (body === undefined) return notJson();
  const result = await loginSyncAccount(body);
  if (!result.ok) return refused(result);
  return json({ token: result.token, userId: result.userId, deviceId: result.deviceId }, 200);
}

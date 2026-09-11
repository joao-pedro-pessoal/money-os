import { listSyncDevices } from "@/actions/vaultServer";
import { json, refused, tokenOf } from "../respond";

export const dynamic = "force-dynamic";

/** Every device ever signed into the account, including revoked ones, newest first. */
export async function GET(request: Request) {
  const result = await listSyncDevices(tokenOf(request));
  if (!result.ok) return refused(result);
  return json({ devices: result.devices }, 200);
}

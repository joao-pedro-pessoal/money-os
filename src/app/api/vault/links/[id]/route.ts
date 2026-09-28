import { deviceLinkStatus } from "@/actions/vaultServer";
import { json, refused, tokenOf } from "../../respond";

export const dynamic = "force-dynamic";

/** Where this account's code stands, for the device showing it. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await deviceLinkStatus(tokenOf(request), id);
  if (!result.ok) return refused(result);
  return json({ state: result.state, deviceName: result.deviceName }, 200);
}

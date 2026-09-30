import { refuseSignInRequest, signInRequestFor } from "@/actions/vaultServer";
import { json, refused, tokenOf } from "../../respond";

export const dynamic = "force-dynamic";

/** Which device is asking, for the phone deciding. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await signInRequestFor(tokenOf(request), id);
  if (!result.ok) return refused(result);
  return json({ deviceName: result.deviceName }, 200);
}

/** The phone's no. */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await refuseSignInRequest(tokenOf(request), id);
  if (!result.ok) return refused(result);
  return json({ refused: true }, 200);
}

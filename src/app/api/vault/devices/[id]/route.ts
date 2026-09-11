import { revokeSyncDevice } from "@/actions/vaultServer";
import { json, refused, tokenOf } from "../../respond";

export const dynamic = "force-dynamic";

/** Signs a device out of the account for good. */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await revokeSyncDevice(tokenOf(request), id);
  if (!result.ok) return refused(result);
  return json({ revoked: id }, 200);
}

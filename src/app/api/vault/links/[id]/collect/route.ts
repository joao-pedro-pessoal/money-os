import { collectDeviceLink } from "@/actions/vaultServer";
import { json, MAX_CREDENTIAL_BODY_BYTES, readJson, refused, unreadable } from "../../../respond";

export const dynamic = "force-dynamic";

/**
 * The phone that asked, collecting its session once the owner said yes.
 *
 * 202 while the owner has not answered yet: ask again in a moment.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const read = await readJson(request, MAX_CREDENTIAL_BODY_BYTES);
  if (!read.ok) return unreadable(read);
  const result = await collectDeviceLink(id, read.body);
  if (!result.ok) return refused(result);
  if (result.waiting) return json({ waiting: true }, 202);
  return json(
    { token: result.token, userId: result.userId, deviceId: result.deviceId, sealed: result.sealed },
    200
  );
}

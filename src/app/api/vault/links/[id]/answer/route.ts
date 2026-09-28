import { answerDeviceLink } from "@/actions/vaultServer";
import { json, MAX_CREDENTIAL_BODY_BYTES, NO_TOKEN, readJson, refused, tokenOf, unreadable } from "../../../respond";

export const dynamic = "force-dynamic";

/** The owner's yes or no to the phone that asked. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = tokenOf(request);
  if (!token) return refused(NO_TOKEN);
  const read = await readJson(request, MAX_CREDENTIAL_BODY_BYTES);
  if (!read.ok) return unreadable(read);
  const result = await answerDeviceLink(token, id, read.body);
  if (!result.ok) return refused(result);
  return json({ state: result.state }, 200);
}

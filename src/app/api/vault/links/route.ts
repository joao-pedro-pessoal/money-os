import { createDeviceLink } from "@/actions/vaultServer";
import { json, MAX_CREDENTIAL_BODY_BYTES, NO_TOKEN, readJson, refused, tokenOf, unreadable } from "../respond";

export const dynamic = "force-dynamic";

/** A new code for opening this account on a phone. See lib/vault/link.ts. */
export async function POST(request: Request) {
  const token = tokenOf(request);
  if (!token) return refused(NO_TOKEN);
  const read = await readJson(request, MAX_CREDENTIAL_BODY_BYTES);
  if (!read.ok) return unreadable(read);
  const result = await createDeviceLink(token, read.body);
  if (!result.ok) return refused(result);
  return json({ id: result.id, expiresAt: result.expiresAt.toISOString() }, 201);
}

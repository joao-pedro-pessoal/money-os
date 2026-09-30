import { createSignInRequest } from "@/actions/vaultServer";
import { json, MAX_CREDENTIAL_BODY_BYTES, readJson, refused, unreadable } from "../respond";

export const dynamic = "force-dynamic";

/** A device with no session asking to be let in by a phone already in the vault. */
export async function POST(request: Request) {
  const read = await readJson(request, MAX_CREDENTIAL_BODY_BYTES);
  if (!read.ok) return unreadable(read);
  const result = await createSignInRequest(read.body);
  if (!result.ok) return refused(result);
  return json({ id: result.id, expiresAt: result.expiresAt.toISOString() }, 201);
}

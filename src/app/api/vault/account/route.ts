import { deleteSyncAccount } from "@/actions/vaultServer";
import { json, MAX_CREDENTIAL_BODY_BYTES, readJson, refused, tokenOf, unreadable } from "../respond";

export const dynamic = "force-dynamic";

/** Deletes the account this device is signed in to, after the password again. */
export async function DELETE(request: Request) {
  const read = await readJson(request, MAX_CREDENTIAL_BODY_BYTES);
  if (!read.ok) return unreadable(read);
  const result = await deleteSyncAccount(tokenOf(request), read.body);
  if (!result.ok) return refused(result);
  return json({ deleted: true }, 200);
}

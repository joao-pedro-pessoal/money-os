import { upgradeSyncCredentials } from "@/actions/vaultServer";
import { json, MAX_CREDENTIAL_BODY_BYTES, readJson, refused, tokenOf, unreadable } from "../../respond";

export const dynamic = "force-dynamic";

/** Moves the account this device is signed in to onto a password alone: see `upgradeSyncCredentials`. */
export async function POST(request: Request) {
  const read = await readJson(request, MAX_CREDENTIAL_BODY_BYTES);
  if (!read.ok) return unreadable(read);
  const result = await upgradeSyncCredentials(tokenOf(request), read.body);
  if (!result.ok) return refused(result);
  return json({ moved: true }, 200);
}

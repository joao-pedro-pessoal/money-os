import { loginSyncAccount } from "@/actions/vaultServer";
import { json, MAX_CREDENTIAL_BODY_BYTES, readJson, refused, unreadable } from "../respond";

export const dynamic = "force-dynamic";

/**
 * Signs a device into an existing sync account. With a sign-in key, the answer
 * also carries the account's sealed words, for the page to open with the
 * password it derived the key from.
 */
export async function POST(request: Request) {
  const read = await readJson(request, MAX_CREDENTIAL_BODY_BYTES);
  if (!read.ok) return unreadable(read);
  const result = await loginSyncAccount(read.body);
  if (!result.ok) return refused(result);
  const { token, userId, deviceId, sealedWords } = result;
  return json(sealedWords === null ? { token, userId, deviceId } : { token, userId, deviceId, sealedWords }, 200);
}

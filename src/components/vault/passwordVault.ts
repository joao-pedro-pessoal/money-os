import {
  browserRandom,
  createVaultClient,
  fetchTransport,
  openDocument,
  type VaultSession,
} from "@/lib/vault/client";
import {
  passwordKeys,
  recoveryHashOf,
  recoveryKeyOf,
  sealWords,
  type PasswordKeys,
} from "@/lib/vault/credentials";

/**
 * The page's side of a vault that opens with a password alone
 * (lib/vault/credentials.ts): making one, moving an older one onto it, and
 * replacing a forgotten password with the twelve words. Signing in is the
 * sign-in page's server action; everything here happens before or after it.
 */

const client = createVaultClient(fetchTransport());

/** What the server keeps so the password alone opens these words, and the words alone can replace it. */
function keptFor(words: string, keys: PasswordKeys) {
  return {
    signInKey: keys.signInKey,
    sealedWords: sealWords(words, keys.sealKey, browserRandom),
    recoveryHash: recoveryHashOf(recoveryKeyOf(words)),
  };
}

/** A new account whose words are kept sealed from the start. */
export async function createPasswordVault(
  email: string,
  password: string,
  words: string,
  deviceName: string
): Promise<VaultSession> {
  const keys = await passwordKeys(email, password);
  try {
    return await client.registerKeyed(email, keptFor(words, keys), deviceName);
  } finally {
    keys.sealKey.fill(0);
  }
}

/**
 * An account made before the words were kept: opened once the old way — the
 * password to the server, the words checked against the vault here — and then
 * moved, so neither is typed or sent that way again.
 *
 * The words are checked before anything is moved. Sealing wrong words would
 * leave an account whose password opens a key to nothing.
 */
export async function moveOlderVault(
  email: string,
  password: string,
  words: string,
  deviceName: string
): Promise<VaultSession> {
  const session = await client.login(email, password, deviceName);
  try {
    const stored = await client.fetchVault(session.token);
    if (stored) {
      try {
        openDocument({ text: stored.text, seed: words, userId: session.userId });
      } catch {
        throw new Error("Those twelve words do not open this vault.");
      }
    }
    const keys = await passwordKeys(email, password);
    try {
      await client.upgradeCredentials(session.token, { password, ...keptFor(words, keys) });
    } finally {
      keys.sealKey.fill(0);
    }
    return session;
  } catch (e) {
    // Not left signed in on a device that did not get in.
    await client.revokeDevice(session.token, session.deviceId).catch(() => {});
    throw e;
  }
}

/** A forgotten password replaced: the twelve words prove the account, and are sealed again under the new one. */
export async function recoverPasswordVault(
  email: string,
  words: string,
  newPassword: string,
  deviceName: string
): Promise<VaultSession> {
  const keys = await passwordKeys(email, newPassword);
  try {
    return await client.recover({
      email,
      recoveryKey: recoveryKeyOf(words),
      signInKey: keys.signInKey,
      sealedWords: sealWords(words, keys.sealKey, browserRandom),
      deviceName,
    });
  } finally {
    keys.sealKey.fill(0);
  }
}

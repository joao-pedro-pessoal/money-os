import { decryptVault, encryptVault } from '../../../src/lib/vault/cipher';
import { canonical, mergeStates, type MergeConflict } from './merge';
import { validateState, type LocalState } from './model';

/**
 * One round of synchronising this device's vault with the server.
 *
 * Everything that touches the outside is passed in — the transport, the seed's
 * entropy, randomness — and nothing is written here. The caller applies the
 * returned state through `LocalVault.replace` and stores the returned base and
 * version, so the rule in mobile/AGENTS.md that financial changes go through the
 * vault holds for synced changes too.
 *
 * The decision, given the version this device last synced (the base) and the
 * newest version the server holds:
 *
 * | server            | this device   | action                                        |
 * | ----------------- | ------------- | --------------------------------------------- |
 * | older than base   | —             | refuse: the server lost data or is lying      |
 * | same as base      | unchanged     | nothing to do                                 |
 * | same as base      | changed       | send base + 1                                 |
 * | newer than base   | unchanged     | receive it                                    |
 * | newer than base   | changed       | merge, send server + 1                        |
 *
 * A send carries the version it expects to replace, and the server accepts it
 * only if that is still the newest. Another device writing in between makes the
 * send fail rather than overwrite, and the round starts again from the read.
 *
 * Never sending over a server that went backwards is the point of the first row.
 * Writing base + 1 on top of it would look like progress and would quietly erase
 * whatever the missing versions held.
 */

export interface StoredVault {
  vaultVersion: number;
  text: string;
}

export interface SyncTransport {
  /** The newest vault the server holds for this account, or null when it has none. */
  latest(): Promise<StoredVault | null>;
  /**
   * Stores `vault` only if the newest version is still `expectedVersion`.
   * Resolves false when another device got there first.
   */
  put(vault: StoredVault, expectedVersion: number): Promise<boolean>;
}

export interface SyncInput {
  userId: string;
  /** The seed's entropy. The caller clears it after the round. */
  entropy: Uint8Array;
  /** The version this device last synced, 0 if it never has. */
  baseVersion: number;
  /** The state that version held, as it was synced. */
  base: LocalState;
  /** The state on this device now. */
  local: LocalState;
  transport: SyncTransport;
  random: (length: number) => Uint8Array | Promise<Uint8Array>;
  /** How many times to start again when another device keeps writing first. */
  maxAttempts?: number;
}

export type SyncRefusal = 'server-behind' | 'unreadable' | 'invalid-merge' | 'busy';

export type SyncOutcome =
  | { status: 'up-to-date'; version: number }
  | {
      status: 'pushed' | 'pulled' | 'merged';
      version: number;
      /** Apply through LocalVault.replace. */
      local: LocalState;
      /** Store beside `version` as the base for the next round. */
      base: LocalState;
      conflicts: MergeConflict[];
    }
  | { status: 'refused'; reason: SyncRefusal; detail: string; conflicts: MergeConflict[] };

/**
 * The vault as it may leave the device: without any account's key reference.
 *
 * `credentialRef` points into this phone's Keychain. It is meaningless on another
 * device and there is no reason the server should hold even an encrypted copy of
 * it, so it is removed before sealing — the same rule the portable backup follows.
 */
function withoutKeyRefs(state: LocalState): LocalState {
  return { ...state, accounts: state.accounts.map(a => ({ ...a, credentialRef: null })) };
}

/** A received vault with this device's own key references put back, by account. */
function withKeyRefsFrom(state: LocalState, device: LocalState): LocalState {
  const refs = new Map(device.accounts.map(a => [a.id, a.credentialRef]));
  return { ...state, accounts: state.accounts.map(a => ({ ...a, credentialRef: refs.get(a.id) ?? null })) };
}

async function seal(state: LocalState, input: SyncInput, vaultVersion: number): Promise<StoredVault> {
  const plaintext = new TextEncoder().encode(JSON.stringify(withoutKeyRefs(state)));
  try {
    const text = await encryptVault({
      plaintext, entropy: input.entropy, userId: input.userId, vaultVersion, random: input.random,
    });
    return { vaultVersion, text };
  } finally {
    plaintext.fill(0);
  }
}

/**
 * Decrypts what the server returned and checks it is what the server said.
 *
 * The transport reports a version number and the vault carries an authenticated
 * one. They must agree: a server that labels an old vault as new would otherwise
 * be believed, because an old vault decrypts perfectly well.
 */
function open(stored: StoredVault, input: SyncInput): LocalState {
  const { plaintext, vaultVersion } = decryptVault({
    text: stored.text, entropy: input.entropy, userId: input.userId, minVaultVersion: input.baseVersion,
  });
  try {
    if (vaultVersion !== stored.vaultVersion) {
      throw new Error(
        `The server labelled this vault version ${stored.vaultVersion}, but the vault itself is version ${vaultVersion}.`
      );
    }
    return withoutKeyRefs(validateState(JSON.parse(new TextDecoder().decode(plaintext))));
  } finally {
    plaintext.fill(0);
  }
}

function refused(reason: SyncRefusal, detail: string, conflicts: MergeConflict[] = []): SyncOutcome {
  return { status: 'refused', reason, detail, conflicts };
}

export async function syncVault(input: SyncInput): Promise<SyncOutcome> {
  const attempts = input.maxAttempts ?? 3;
  // Key references never sync, so a change to one alone is not a change to send.
  const localChanged = canonical(withoutKeyRefs(input.local)) !== canonical(withoutKeyRefs(input.base));

  for (let attempt = 0; attempt < attempts; attempt++) {
    const latest = await input.transport.latest();
    const serverVersion = latest?.vaultVersion ?? 0;

    if (serverVersion < input.baseVersion) {
      return refused(
        'server-behind',
        `The server holds version ${serverVersion}, but this device already synced version ${input.baseVersion}. ` +
          'Nothing was sent, so nothing on the server was overwritten.'
      );
    }

    if (serverVersion === input.baseVersion) {
      if (!localChanged) return { status: 'up-to-date', version: serverVersion };
      const next = serverVersion + 1;
      if (await input.transport.put(await seal(input.local, input, next), serverVersion)) {
        return { status: 'pushed', version: next, local: input.local, base: withoutKeyRefs(input.local), conflicts: [] };
      }
      continue;
    }

    let remote: LocalState;
    try {
      remote = open(latest!, input);
    } catch (error) {
      return refused('unreadable', error instanceof Error ? error.message : String(error));
    }

    if (!localChanged) {
      return { status: 'pulled', version: serverVersion, local: withKeyRefsFrom(remote, input.local), base: remote, conflicts: [] };
    }

    const result = mergeStates(withoutKeyRefs(input.base), input.local, remote);
    if (!result.ok) {
      return refused('invalid-merge', result.problems.join('; '), result.conflicts);
    }
    const next = serverVersion + 1;
    if (await input.transport.put(await seal(result.state, input, next), serverVersion)) {
      return {
        status: 'merged', version: next, local: result.state, base: withoutKeyRefs(result.state),
        conflicts: result.conflicts,
      };
    }
  }

  return refused(
    'busy',
    `Another device kept writing first; stopped after ${attempts} attempts. Nothing on this device was lost.`
  );
}

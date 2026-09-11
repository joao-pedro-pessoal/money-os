import { decimal, units } from './money';
import { StateSchema, type LocalAccount, type LocalEvent, type LocalState } from './model';

/**
 * Merges two devices' vaults against the last version both of them saw.
 *
 * Three-way rather than by timestamp, because no record here carries one: an
 * account knows when it was created, an event the day it happened, a goal
 * nothing at all. The base — the last synced vault, which each device already
 * holds because it decrypted it — answers "which side changed this" without
 * trusting two clocks to agree.
 *
 * Decided in docs/PLANO_MOBILE.md: merge by default, and report a conflict only
 * when the same record changed differently on both sides. Everything below is
 * that rule, plus the places where applying it naively would move money.
 *
 * **A manual account's balance is not merged, it is recomputed.** Recording,
 * transferring and deleting a movement are the only things that change it, and
 * each adds or removes an event. Two phones recording a movement each both change
 * the balance; taking either side's figure loses the other's movement, and adding
 * both sides' changes to the base counts twice any event that reached both. So
 * the balance is the base's plus the manual events in the merged set that the
 * base lacked, minus those the base had and the merge dropped — computed over the
 * merged set, where each event id exists once. One movement, one effect on the
 * balance, by construction.
 *
 * **Imported and synced events are one event per origin, not per id.** Each
 * device mints its own id when it reads a broker or imports a file, so two phones
 * reading the same account produce the same fill under two ids. Keyed by id, a
 * merge would duplicate the whole synced history — the double count this project
 * has fixed nine times. They are keyed by account and `externalId`, which is the
 * broker's reference or a deterministic hash of the imported row.
 *
 * **A broker reading is a measurement.** The newer `syncedAt` wins, whichever side
 * it came from; two readings of one account are not a disagreement to resolve.
 *
 * **A key reference belongs to one device.** `credentialRef` points into that
 * phone's Keychain. The local one is kept, and an account first seen from the
 * other device arrives with none — the backup already strips it for the same
 * reason.
 *
 * The result is validated against the same schema as every stored vault. A merge
 * that would produce an invalid state returns the problems and no state at all.
 */

export type MergeCollection = 'accounts' | 'events' | 'snapshots' | 'goals' | 'commitments';

export type ConflictKind =
  /** The same record changed differently on both devices. */
  | 'edited-both'
  /** Removed on one device and changed on the other; the changed version is kept. */
  | 'deleted-and-edited'
  /** Both devices created a record with one id and different contents. */
  | 'same-id-different-record'
  /** A balance moved by an amount no event explains; the event-derived figure is kept. */
  | 'unexplained-balance';

export interface MergeConflict {
  collection: MergeCollection;
  id: string;
  kind: ConflictKind;
  /** Which version the merged state holds until someone chooses. */
  kept: 'local' | 'remote' | 'recomputed';
}

export type MergeResult =
  | { ok: true; state: LocalState; conflicts: MergeConflict[] }
  | { ok: false; problems: string[]; conflicts: MergeConflict[] };

/**
 * JSON with sorted keys, so two devices that built the same record in a different
 * key order compare equal. `undefined` is treated as absent, as JSON does.
 */
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .filter(k => record[k] !== undefined)
      .sort()
      .map(k => `${JSON.stringify(k)}:${canonical(record[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}
const same = (a: unknown, b: unknown) => canonical(a) === canonical(b);

interface Choice<T> { value: T | undefined; conflict?: ConflictKind; kept?: 'local' | 'remote' }

/** The three-way rule for one record. */
function pick<T>(b: T | undefined, l: T | undefined, r: T | undefined, equal: (x: T, y: T) => boolean): Choice<T> {
  if (b === undefined) {
    if (l === undefined) return { value: r };
    if (r === undefined) return { value: l };
    return equal(l, r) ? { value: l } : { value: l, conflict: 'same-id-different-record', kept: 'local' };
  }
  const localChanged = l === undefined || !equal(l, b);
  const remoteChanged = r === undefined || !equal(r, b);
  if (!localChanged) return { value: r };
  if (!remoteChanged) return { value: l };
  if (l === undefined && r === undefined) return { value: undefined };
  if (l !== undefined && r !== undefined) {
    return equal(l, r) ? { value: l } : { value: l, conflict: 'edited-both', kept: 'local' };
  }
  // One side removed it and the other changed it. Keep the change: a removal can
  // be repeated, a lost edit cannot be recovered.
  return l === undefined
    ? { value: r, conflict: 'deleted-and-edited', kept: 'remote' }
    : { value: l, conflict: 'deleted-and-edited', kept: 'local' };
}

function byKey<T>(rows: T[], key: (row: T) => string): Map<string, T> {
  return new Map(rows.map(row => [key(row), row]));
}

function mergeKeyed<T extends { id: string }>(
  collection: MergeCollection,
  rows: [T[], T[], T[]],
  key: (row: T) => string,
  equal: (x: T, y: T) => boolean,
  conflicts: MergeConflict[]
): T[] {
  const [base, local, remote] = rows.map(r => byKey(r, key));
  const keys = new Set([...base.keys(), ...local.keys(), ...remote.keys()]);
  const out: T[] = [];
  for (const k of keys) {
    const b = base.get(k), l = local.get(k), r = remote.get(k);
    const choice = pick(b, l, r, equal);
    if (choice.conflict) {
      conflicts.push({ collection, id: (l ?? r ?? b)!.id, kind: choice.conflict, kept: choice.kept ?? 'local' });
    }
    if (choice.value !== undefined) out.push(choice.value);
  }
  return out;
}

/** Manual events are one per id; imported and synced events one per origin. */
function eventKey(e: LocalEvent): string {
  return e.source !== 'manual' && e.externalId !== ''
    ? `${e.source}|${e.accountId}|${e.externalId}`
    : `id|${e.id}`;
}

/** The same event from two devices differs only in the id each one minted. */
function sameEvent(a: LocalEvent, b: LocalEvent): boolean {
  return eventKey(a).startsWith('id|') ? same(a, b) : same({ ...a, id: '' }, { ...b, id: '' });
}

function manualTotal(events: LocalEvent[], accountId: string): bigint {
  let total = 0n;
  for (const e of events) if (e.source === 'manual' && e.accountId === accountId) total += units(e.amount);
  return total;
}

function identity(a: LocalAccount) {
  // A connected account's currency follows its reading, so only a manual
  // account's currency is part of what it is.
  return { name: a.name, platform: a.platform, createdAt: a.createdAt, currency: a.platform ? null : a.currency };
}

function mergeAccounts(
  states: { base: LocalState; local: LocalState; remote: LocalState },
  events: LocalEvent[],
  conflicts: MergeConflict[]
): LocalAccount[] {
  const { base, local, remote } = states;
  const [bById, lById, rById] = [base, local, remote].map(s => byKey(s.accounts, a => a.id));
  const ids = new Set([...bById.keys(), ...lById.keys(), ...rById.keys()]);
  const out: LocalAccount[] = [];

  for (const id of ids) {
    const b = bById.get(id), l = lById.get(id), r = rById.get(id);

    let merged: LocalAccount;
    if (l && r) {
      const who = b
        ? pick(identity(b), identity(l), identity(r), same)
        : same(identity(l), identity(r))
          ? { value: identity(l) }
          : { value: identity(l), conflict: 'same-id-different-record' as const, kept: 'local' as const };
      if (who.conflict) conflicts.push({ collection: 'accounts', id, kind: who.conflict, kept: 'local' });
      const chosen = who.value ?? identity(l);
      const newer = (r.syncedAt ?? '') > (l.syncedAt ?? '') ? r : l;
      merged = {
        ...l,
        name: chosen.name,
        platform: chosen.platform,
        createdAt: chosen.createdAt,
        currency: chosen.platform ? newer.currency : chosen.currency ?? l.currency,
        reading: newer.reading,
        syncedAt: newer.syncedAt,
        credentialRef: l.credentialRef,
      };
    } else {
      // No screen deletes an account, so a side without one that the base had is
      // an anomaly. The surviving record is kept and the gap reported.
      const only = l ?? r;
      if (b && only) conflicts.push({ collection: 'accounts', id, kind: 'deleted-and-edited', kept: l ? 'local' : 'remote' });
      merged = { ...(only ?? b)!, credentialRef: l ? l.credentialRef : null };
    }

    if (merged.platform === null) {
      const anchorState = b ? base : l ? local : remote;
      const anchor = (b ?? l ?? r)!;
      const derived = units(anchor.balance) + manualTotal(events, id) - manualTotal(anchorState.events, id);

      if (b) {
        for (const [side, state] of [[l, local], [r, remote]] as const) {
          if (!side) continue;
          const explained = units(b.balance) + manualTotal(state.events, id) - manualTotal(base.events, id);
          if (units(side.balance) !== explained) {
            conflicts.push({ collection: 'accounts', id, kind: 'unexplained-balance', kept: 'recomputed' });
            break;
          }
        }
      }
      merged = { ...merged, balance: decimal(derived) };
    }
    out.push(merged);
  }
  return out;
}

export function mergeStates(base: LocalState, local: LocalState, remote: LocalState): MergeResult {
  for (const [name, state] of [['base', base], ['local', local], ['remote', remote]] as const) {
    const parsed = StateSchema.safeParse(state);
    if (!parsed.success) {
      return { ok: false, problems: [`The ${name} vault is not valid: ${parsed.error.issues[0]?.message ?? 'unknown'}`], conflicts: [] };
    }
  }

  const conflicts: MergeConflict[] = [];
  const events = mergeKeyed('events', [base.events, local.events, remote.events], eventKey, sameEvent, conflicts);
  const accounts = mergeAccounts({ base, local, remote }, events, conflicts);
  const snapshots = mergeKeyed('snapshots', [base.snapshots, local.snapshots, remote.snapshots], s => s.id, same, conflicts);
  const goals = mergeKeyed('goals', [base.goals, local.goals, remote.goals], g => g.id, same, conflicts);
  const commitments = mergeKeyed(
    'commitments', [base.commitments, local.commitments, remote.commitments], c => c.id, same, conflicts
  );

  const parsed = StateSchema.safeParse({ version: 1, accounts, events, snapshots, goals, commitments });
  if (!parsed.success) {
    return { ok: false, problems: parsed.error.issues.map(i => i.message), conflicts };
  }
  return { ok: true, state: parsed.data, conflicts };
}

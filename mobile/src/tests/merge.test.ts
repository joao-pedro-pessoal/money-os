import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { canonical, mergeStates, type MergeResult } from '../domain/merge';
import { add, decimal, units } from '../domain/money';
import { deleteEvent, recordCash, transfer } from '../domain/operations';
import { emptyState, type LocalAccount, type LocalEvent, type LocalState } from '../domain/model';
import { account } from './fixtures';

const clone = (s: LocalState): LocalState => structuredClone(s);

function cash(accountId: string, amount: string, over: Partial<LocalEvent> = {}): LocalEvent {
  return {
    id: randomUUID(), accountId, date: '2026-02-01T12:00:00.000Z',
    type: units(amount) < 0n ? 'EXPENSE' : 'INCOME', amount, currency: 'EUR',
    description: '', symbol: '', quantity: null, price: null, fees: null,
    source: 'manual', externalId: '', transferId: null, ...over,
  };
}

function merged(result: MergeResult): LocalState {
  if (!result.ok) throw new Error(`merge refused: ${result.problems.join('; ')}`);
  return result.state;
}

const balanceOf = (s: LocalState, id: string) => s.accounts.find(a => a.id === id)!.balance;

function baseWith(...accounts: LocalAccount[]): LocalState {
  return { ...emptyState(), accounts };
}

describe('merging two devices against their last shared vault', () => {
  it('keeps a movement from each phone, and both reach the balance', () => {
    const a = account({ balance: '100' });
    const base = baseWith(a);
    const local = clone(base); recordCash(local, cash(a.id, '-20'));
    const remote = clone(base); recordCash(remote, cash(a.id, '50'));

    const result = mergeStates(base, local, remote);
    const state = merged(result);

    expect(state.events).toHaveLength(2);
    expect(balanceOf(state, a.id)).toBe('130');
    expect(result.conflicts).toEqual([]);
  });

  it('counts a movement that reached both sides once', () => {
    // The same event id on both sides without being in the base: taking each
    // side's change to the balance would add it twice.
    const a = account({ balance: '100' });
    const base = baseWith(a);
    const local = clone(base); recordCash(local, cash(a.id, '25'));
    const remote = clone(local);

    const state = merged(mergeStates(base, local, remote));
    expect(state.events).toHaveLength(1);
    expect(balanceOf(state, a.id)).toBe('125');
  });

  it('removes a movement deleted on one side and reverses it once', () => {
    const a = account({ balance: '100' });
    const base = baseWith(a); recordCash(base, cash(a.id, '40'));
    const local = clone(base); deleteEvent(local, base.events[0].id);
    const remote = clone(base);

    const state = merged(mergeStates(base, local, remote));
    expect(state.events).toHaveLength(0);
    expect(balanceOf(state, base.accounts[0].id)).toBe('100');
  });

  it('keeps a transfer whole beside a movement recorded elsewhere', () => {
    const a = account({ balance: '100' }), b = account({ balance: '0' });
    const base = baseWith(a, b);
    const local = clone(base);
    transfer(local, { from: a.id, to: b.id, sent: '30', received: '30', date: '2026-02-02T12:00:00.000Z',
      id: randomUUID(), outgoingId: randomUUID(), incomingId: randomUUID() });
    const remote = clone(base); recordCash(remote, cash(b.id, '5'));

    const state = merged(mergeStates(base, local, remote));
    expect(balanceOf(state, a.id)).toBe('70');
    expect(balanceOf(state, b.id)).toBe('35');
  });

  it('keeps one copy of a fill two phones read from the same broker', () => {
    const hl = account({ platform: 'hyperliquid', balance: '0', currency: 'USD' });
    const base = baseWith(hl);
    const fill = (id: string) => cash(hl.id, '2.5', {
      id, type: 'DIVIDEND', currency: 'USD', source: 'sync', externalId: 'fill-42',
    });
    const local = clone(base); local.events.push(fill(randomUUID()));
    const remote = clone(base); remote.events.push(fill(randomUUID()));

    const state = merged(mergeStates(base, local, remote));
    expect(state.events).toHaveLength(1);
  });

  it('keeps one copy of a statement both phones imported', () => {
    const a = account({ balance: '0' });
    const base = baseWith(a);
    const key = 'a'.repeat(64);
    const row = (id: string) => cash(a.id, '-9.99', { id, source: 'csv', externalId: key });
    const local = clone(base); local.events.push(row(randomUUID()));
    const remote = clone(base); remote.events.push(row(randomUUID()));

    const state = merged(mergeStates(base, local, remote));
    expect(state.events).toHaveLength(1);
    // Imports never move a manual balance, and the merge does not start to.
    expect(balanceOf(state, a.id)).toBe('0');
  });

  it('takes the newer broker reading whichever phone made it', () => {
    const reading = (equity: number) => ({
      currency: 'USD', equity, withdrawable: null, totalMarginUsed: null, totalNotionalPosition: null,
      asOf: null, positions: [], balances: [], spotValue: 0, balancesAreSeparatePool: false,
    });
    const hl = account({ platform: 'hyperliquid', balance: '0', currency: 'USD' });
    const base = baseWith(hl);
    const local = clone(base);
    local.accounts[0] = { ...local.accounts[0], reading: reading(100), syncedAt: '2026-03-02T10:00:00.000Z' };
    const remote = clone(base);
    remote.accounts[0] = { ...remote.accounts[0], reading: reading(180), syncedAt: '2026-03-02T11:00:00.000Z' };

    const result = mergeStates(base, local, remote);
    expect(merged(result).accounts[0].reading?.equity).toBe(180);
    expect(result.conflicts).toEqual([]);
  });

  it("never adopts the other phone's key reference", () => {
    const hl = account({ platform: 'hyperliquid', balance: '0', currency: 'USD' });
    const base = baseWith(hl);
    const mine = randomUUID();
    const local = clone(base); local.accounts[0].credentialRef = mine;
    const remote = clone(base); remote.accounts[0].credentialRef = randomUUID();
    const newOnRemote = account({ platform: 'mexc', balance: '0', currency: 'USD', credentialRef: randomUUID() });
    remote.accounts.push(newOnRemote);

    const state = merged(mergeStates(base, local, remote));
    expect(state.accounts.find(a => a.id === hl.id)!.credentialRef).toBe(mine);
    expect(state.accounts.find(a => a.id === newOnRemote.id)!.credentialRef).toBeNull();
  });

  it('reports a goal changed differently on both phones and keeps this one', () => {
    const goal = { id: randomUUID(), name: 'Casa', currency: 'EUR', target: '20000', saved: '0' };
    const base = { ...emptyState(), goals: [goal] };
    const local = clone(base); local.goals[0].saved = '10';
    const remote = clone(base); remote.goals[0].saved = '20';

    const result = mergeStates(base, local, remote);
    expect(merged(result).goals[0].saved).toBe('10');
    expect(result.conflicts).toEqual([{ collection: 'goals', id: goal.id, kind: 'edited-both', kept: 'local' }]);
  });

  it('takes a goal changed on one phone only, without calling it a conflict', () => {
    const goal = { id: randomUUID(), name: 'Casa', currency: 'EUR', target: '20000', saved: '0' };
    const base = { ...emptyState(), goals: [goal] };
    const remote = clone(base); remote.goals[0].saved = '20';

    const result = mergeStates(base, clone(base), remote);
    expect(merged(result).goals[0].saved).toBe('20');
    expect(result.conflicts).toEqual([]);
  });

  it('removes a commitment removed on one phone and untouched on the other', () => {
    const item = { id: randomUUID(), name: 'Internet', currency: 'EUR', amount: '30', period: 'monthly' as const };
    const base = { ...emptyState(), commitments: [item] };
    const local = clone(base); local.commitments = [];

    expect(merged(mergeStates(base, local, clone(base))).commitments).toEqual([]);
  });

  it('refuses to fold in a balance change that no movement explains', () => {
    const a = account({ balance: '100' });
    const base = baseWith(a);
    const local = clone(base); local.accounts[0].balance = add(local.accounts[0].balance, '5');

    const result = mergeStates(base, local, clone(base));
    expect(balanceOf(merged(result), a.id)).toBe('100');
    expect(result.conflicts).toEqual([
      { collection: 'accounts', id: a.id, kind: 'unexplained-balance', kept: 'recomputed' },
    ]);
  });

  it('returns problems and no state when an input vault is invalid', () => {
    const broken = { ...emptyState(), events: [cash(randomUUID(), '5')] };
    const result = mergeStates(emptyState(), broken as LocalState, emptyState());
    expect(result.ok).toBe(false);
  });

  it('compares records regardless of key order', () => {
    expect(canonical({ b: 1, a: [{ d: 2, c: 3 }] })).toBe(canonical({ a: [{ c: 3, d: 2 }], b: 1 }));
    expect(canonical({ a: 1, b: undefined })).toBe(canonical({ a: 1 }));
  });
});

/** Deterministic, so a failing case can be replayed from its seed. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('generated edits on two phones', () => {
  /**
   * Hand-written cases put their movements where the author expected them. This
   * walks random recordings, transfers and deletions on both sides of a shared
   * base and checks the one thing that must never break: every manual balance is
   * its opening figure plus the manual events the merged vault holds, and merging
   * the other way round gives the same balances.
   */
  it('keeps every balance equal to its opening figure plus its merged movements', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const rand = mulberry32(seed);
      const int = (n: number) => Math.floor(rand() * n);
      const amount = () => decimal(BigInt(1 + int(10_000)) * 1_000_000n);

      const opening = ['100', '250', '0'];
      const accounts = opening.map(balance => account({ balance }));
      const base = baseWith(...accounts);

      const act = (state: LocalState, steps: number) => {
        for (let i = 0; i < steps; i++) {
          const roll = int(3);
          const deletable = state.events.filter(e => e.source === 'manual');
          if (roll === 0 || (roll === 2 && deletable.length === 0)) {
            const signed = int(2) ? amount() : `-${amount()}`;
            recordCash(state, cash(accounts[int(3)].id, signed));
          } else if (roll === 1) {
            const from = int(3), to = (from + 1 + int(2)) % 3;
            const value = amount();
            transfer(state, { from: accounts[from].id, to: accounts[to].id, sent: value, received: value,
              date: '2026-02-03T12:00:00.000Z', id: randomUUID(), outgoingId: randomUUID(), incomingId: randomUUID() });
          } else {
            deleteEvent(state, deletable[int(deletable.length)].id);
          }
        }
      };

      act(base, int(6));
      const local = clone(base); act(local, int(8));
      const remote = clone(base); act(remote, int(8));

      const forward = mergeStates(base, local, remote);
      const backward = mergeStates(base, remote, local);
      const state = merged(forward);

      expect(forward.conflicts, `seed ${seed}`).toEqual([]);
      accounts.forEach((a, i) => {
        const movements = state.events
          .filter(e => e.source === 'manual' && e.accountId === a.id)
          .reduce((s, e) => s + units(e.amount), 0n);
        expect(balanceOf(state, a.id), `seed ${seed}, account ${i}`).toBe(decimal(units(opening[i]) + movements));
        expect(balanceOf(merged(backward), a.id), `seed ${seed}, account ${i}, reversed`).toBe(balanceOf(state, a.id));
      });
    }
  });
});

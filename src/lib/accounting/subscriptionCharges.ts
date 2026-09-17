/**
 * Proposing a subscription's charge on the day it falls due.
 *
 * The app never records a charge by itself. A subscription is a forecast, the
 * charge is an ordinary expense, and the same charge usually reaches the ledger
 * a second way too — a bank import, a connector, a quick entry. Creating it
 * automatically would count it twice the moment the statement arrived. So the
 * charge is *proposed*, beside any expense that already looks like it, and the
 * person decides: record it, say it is already there, or skip it.
 *
 * Dates are calendar days in the server's local time, the same reading
 * `nextCharge` uses, so "due today" here and on the subscriptions page agree.
 */
import type { Cadence } from "./subscriptions";

/** How far back an unanswered charge is still proposed. */
export const LOOKBACK_DAYS = 31;

/** A day as YYYY-MM-DD in local time. */
export function dayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/**
 * Every charge day from the anchor onwards that lands between `from` and `to`,
 * both inclusive.
 *
 * Month steps clamp to the month's last day but keep the anchor's day, so a
 * charge on the 31st is on 28 February and back on 31 March — the rule
 * `nextCharge` settled on.
 */
export function chargeDays(anchor: Date, cadence: Cadence, from: Date, to: Date): string[] {
  const first = startOfDay(from);
  const last = startOfDay(to);
  const anchorDay = anchor.getDate();
  const days: string[] = [];
  let current = startOfDay(anchor);
  let step = 0;

  for (let guard = 0; current <= last && guard < 5000; guard++) {
    if (current >= first) days.push(dayKey(current));
    step++;
    if (cadence === "weekly") {
      current = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() + 7 * step);
    } else {
      const months = (cadence === "monthly" ? 1 : cadence === "quarterly" ? 3 : 12) * step;
      const y = anchor.getFullYear();
      const m = anchor.getMonth() + months;
      const lastDay = new Date(y, m + 1, 0).getDate();
      current = new Date(y, m, Math.min(anchorDay, lastDay));
    }
  }
  return days;
}

export interface ChargeSubscription {
  id: string;
  name: string;
  amount: number;
  currency: string;
  cadence: Cadence;
  active: boolean;
  /** The anchor date. Without one there is no day to propose on. */
  nextChargeAt: Date | null;
  createdAt: Date;
}

export interface PendingCharge {
  subscriptionId: string;
  dueOn: string;
}

/**
 * The charges waiting for an answer, oldest first.
 *
 * Only active subscriptions with a date; only days that have arrived; nothing
 * older than the lookback or than the subscription itself, so adding one with a
 * date years back does not open a backlog of charges nobody is asking about.
 * `handled` holds "subscriptionId|dueOn" for every charge already answered.
 */
export function pendingCharges(
  subs: readonly ChargeSubscription[],
  handled: ReadonlySet<string>,
  today: Date,
  lookbackDays: number = LOOKBACK_DAYS
): PendingCharge[] {
  const windowStart = new Date(today.getFullYear(), today.getMonth(), today.getDate() - lookbackDays);
  const out: PendingCharge[] = [];
  for (const s of subs) {
    if (!s.active || !s.nextChargeAt || Number.isNaN(s.nextChargeAt.getTime())) continue;
    const created = startOfDay(s.createdAt);
    const from = created > windowStart ? created : windowStart;
    for (const dueOn of chargeDays(s.nextChargeAt, s.cadence, from, today)) {
      if (!handled.has(`${s.id}|${dueOn}`)) out.push({ subscriptionId: s.id, dueOn });
    }
  }
  return out.sort((a, b) => a.dueOn.localeCompare(b.dueOn));
}

export interface LedgerExpense {
  id: string;
  date: Date;
  /** Signed as stored: an expense is negative. */
  amount: number;
  currency: string;
  accountId: string;
  type: string;
  description: string | null;
  merchant: string | null;
}

/** How many days either side of the due day an existing expense may sit. */
export const MATCH_DAYS = 5;

/**
 * The expense already in the ledger that is most likely this charge, or null.
 *
 * Same currency, an amount within 10% (prices move, card fees round), within
 * five days of the due day, on the subscription's account when it names one,
 * and not already claimed by another charge. Among several, one whose text
 * mentions the subscription wins, then the nearest in time. It is a suggestion
 * shown beside the proposal, never a decision taken for the person.
 */
export function likelyMatch(
  charge: { name: string; amount: number; currency: string; accountId: string | null; dueOn: string },
  ledger: readonly LedgerExpense[],
  claimed: ReadonlySet<string>
): LedgerExpense | null {
  const [y, m, d] = charge.dueOn.split("-").map(Number);
  const due = new Date(y, m - 1, d).getTime();
  const tolerance = Math.max(0.01, charge.amount * 0.1);
  const name = charge.name.trim().toLowerCase();

  const candidates = ledger
    .filter((t) => t.type === "expense" && !claimed.has(t.id))
    .filter((t) => t.currency === charge.currency)
    .filter((t) => charge.accountId === null || t.accountId === charge.accountId)
    .filter((t) => Math.abs(Math.abs(t.amount) - charge.amount) <= tolerance)
    .map((t) => {
      const day = startOfDay(t.date).getTime();
      const distance = Math.round(Math.abs(day - due) / 86_400_000);
      const text = `${t.merchant ?? ""} ${t.description ?? ""}`.toLowerCase();
      return { t, distance, named: name.length > 0 && text.includes(name) };
    })
    .filter((c) => c.distance <= MATCH_DAYS)
    .sort((a, b) => Number(b.named) - Number(a.named) || a.distance - b.distance);

  return candidates[0]?.t ?? null;
}

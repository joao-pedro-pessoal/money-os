"use client";

import { useState } from "react";
import Link from "next/link";
import { answerSubscriptionCharge, recordSubscriptionCharge, type DueCharge } from "@/actions/subscriptionCharges";
import { Money } from "./PrivacyContext";

const dayLabel = (day: string) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

/**
 * Subscription charges that have fallen due, each waiting for an answer.
 *
 * Nothing is recorded until a button is pressed: a charge often reaches the
 * ledger another way too, and an expense created behind your back would be
 * counted twice when the statement arrives. When one already looks like it,
 * that is the first thing offered.
 */
export default function DueSubscriptionCharges({
  charges,
  accounts,
  compact = false,
}: {
  charges: DueCharge[];
  accounts: { id: string; name: string; currency: string }[];
  /** On the dashboard: the first few, with a link to the rest. */
  compact?: boolean;
}) {
  if (charges.length === 0) return null;
  const shown = compact ? charges.slice(0, 3) : charges;

  return (
    <section className="card p-4 space-y-3" aria-labelledby="due-charges-title">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <h2 id="due-charges-title" className="text-sm font-medium">
          Subscription charges to confirm · {charges.length}
        </h2>
        {compact && charges.length > shown.length && (
          <Link href="/subscriptions" className="text-xs text-[var(--accent)]">
            See all
          </Link>
        )}
      </div>
      <p className="text-xs text-[var(--muted)]">
        Due and not yet in your records. Nothing is added until you choose.
      </p>
      <div className="space-y-3">
        {shown.map((c) => (
          <ChargeRow key={`${c.subscriptionId}-${c.dueOn}`} charge={c} accounts={accounts} />
        ))}
      </div>
    </section>
  );
}

function ChargeRow({ charge, accounts }: { charge: DueCharge; accounts: { id: string; name: string; currency: string }[] }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [accountId, setAccountId] = useState(charge.accountId ?? "");
  const [amount, setAmount] = useState(charge.amount.toFixed(2));
  const [date, setDate] = useState(charge.dueOn);
  const accountCurrency = accounts.find((a) => a.id === accountId)?.currency ?? null;
  const otherCurrency = accountCurrency !== null && accountCurrency !== charge.currency;

  async function run(action: (form: FormData) => Promise<{ ok: true } | { error: string }>, fields: Record<string, string>) {
    if (pending) return;
    setPending(true);
    setError("");
    const form = new FormData();
    form.set("subscriptionId", charge.subscriptionId);
    form.set("dueOn", charge.dueOn);
    for (const [key, value] of Object.entries(fields)) form.set(key, value);
    try {
      const result = await action(form);
      if ("error" in result) setError(result.error);
    } catch {
      setError("Could not confirm. Check Cash Flow before trying again.");
    } finally {
      setPending(false);
    }
  }

  const record = () => {
    if (!accountId) {
      setEditing(true);
      setError("Choose the account it was charged to.");
      return;
    }
    // The amount starts in the subscription's currency. Recorded as it is on an
    // account in another currency, 10 USD would become 10 EUR.
    if (otherCurrency && !editing) {
      setEditing(true);
      setError(`Enter the amount in ${accountCurrency}, as the account was charged.`);
      return;
    }
    return run(recordSubscriptionCharge, { accountId, amount, date });
  };

  return (
    <div className="rounded-lg border border-[var(--border)] p-3 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-medium break-words">{charge.name}</div>
          <div className="text-xs text-[var(--muted)]">
            due {dayLabel(charge.dueOn)}
            {charge.categoryName && ` · ${charge.categoryName}`}
          </div>
        </div>
        <div className="font-semibold shrink-0">
          <Money value={charge.amount} currency={charge.currency} />
        </div>
      </div>

      {charge.match && (
        <p className="text-xs">
          <span className="text-[var(--amber)]">Looks already recorded:</span> {charge.match.label},{" "}
          {dayLabel(charge.match.date)}, <Money value={charge.match.amount} currency={charge.match.currency} /> ·{" "}
          {charge.match.accountName}
        </p>
      )}

      {editing && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <label className="text-xs">
            Account
            <select className="input mt-1" value={accountId} onChange={(e) => setAccountId(e.target.value)} disabled={pending}>
              <option value="">Choose…</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs">
            Amount{accountCurrency ? ` (${accountCurrency})` : ""}
            <input className="input mt-1" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} disabled={pending} />
          </label>
          <label className="text-xs">
            Date
            <input className="input mt-1" type="date" value={date} onChange={(e) => setDate(e.target.value)} disabled={pending} />
          </label>
          {otherCurrency && (
            <p className="text-[11px] text-[var(--amber)] sm:col-span-3">
              The subscription is in {charge.currency} and this account in {accountCurrency}: enter what the account was charged.
            </p>
          )}
        </div>
      )}

      {error && (
        <p role="alert" className="text-xs text-[var(--red)]">
          {error}
        </p>
      )}

      <div className="flex gap-2 flex-wrap">
        {charge.match ? (
          <>
            <button
              type="button"
              className="btn"
              disabled={pending}
              onClick={() => run(answerSubscriptionCharge, { answer: "matched", transactionId: charge.match!.id })}
            >
              Yes, that&apos;s it
            </button>
            <button type="button" className="btn" disabled={pending} onClick={record}>
              No, record it
            </button>
          </>
        ) : (
          <button type="button" className="btn" disabled={pending} onClick={record}>
            {pending ? "Saving…" : "Record expense"}
          </button>
        )}
        {!editing && (
          <button type="button" className="btn" disabled={pending} onClick={() => setEditing(true)}>
            Change details
          </button>
        )}
        <button
          type="button"
          className="text-xs text-[var(--muted)] hover:underline px-2"
          disabled={pending}
          onClick={() => run(answerSubscriptionCharge, { answer: "skipped" })}
        >
          Skip this charge
        </button>
      </div>
    </div>
  );
}

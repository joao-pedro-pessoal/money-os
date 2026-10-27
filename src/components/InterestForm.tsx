"use client";

import { useText } from "@/components/useText";
import { useActionState, useRef, useState } from "react";
import { newQuickEntryId } from "@/lib/money/quickEntryId";
import { accrue, daysBetween, compare, type DayCount } from "@/lib/accounting/interest";

export interface RateAccount {
  id: string;
  name: string;
  currency: string;
  balance: number;
  apr: number | null;
  dayCount: DayCount;
  withholding: number;
  /** Date of the last payment, or the account's creation date. */
  since: string;
}

/**
 * Records an interest payment, computing it from the rate rather than asking
 * for a number you'd have to read off a statement.
 *
 * The arithmetic is shown, not hidden. The value of this feature is being able
 * to disagree with the bank — which you can't do if the app just produces a
 * figure and asks you to trust it.
 */
function InterestAttempt({
  accounts,
  action,
  today,
  restart,
}: {
  accounts: RateAccount[];
  action: (formData: FormData) => Promise<{ saved?: boolean; error?: string }>;
  restart: () => void;
  today: string;
}) {
  const uiText = useText();
  const request = useRef("");
  const [result, submit, pending] = useActionState<{ saved?: boolean; error?: string }, FormData>(async (_, form) => {
    request.current ||= newQuickEntryId();
    form.set("requestId", request.current);
    try { return await action(form); }
    catch { return { error: "Connection interrupted. Retry with the same details; saved interest will not be duplicated." }; }
  }, {});
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const account = accounts.find((a) => a.id === accountId);

  const [from, setFrom] = useState(account?.since ?? today);
  const [to, setTo] = useState(today);
  const [manual, setManual] = useState("");

  const days = daysBetween(new Date(from), new Date(to));
  const computed =
    account?.apr && account.apr > 0
      ? accrue({
          balance: account.balance,
          aprPercent: account.apr,
          days,
          dayCount: account.dayCount,
          withholdingPercent: account.withholding,
        })
      : null;

  // What actually gets recorded: your figure if you typed one, otherwise ours.
  const amount = manual !== "" ? Number(manual) : (computed?.net ?? 0);
  const disagreement =
    computed && manual !== "" && Number.isFinite(Number(manual))
      ? compare(computed.net, Number(manual))
      : null;

  const futureDated = new Date(to) > new Date(today);

  function pickAccount(id: string) {
    setAccountId(id);
    const next = accounts.find((a) => a.id === id);
    if (next) setFrom(next.since);
    setManual("");
  }

  return (
    <form action={submit} onReset={event => event.preventDefault()} className="space-y-3">
      <fieldset disabled={pending || result.saved} className="space-y-3">
      <select
        name="accountId"
        className="input"
        value={accountId}
        onChange={(e) => pickAccount(e.target.value)}
        required
      >
        {accounts.map((a) => (
          <option translate="no" key={a.id} value={a.id}>
            {a.name}
            {a.apr ? ` — ${a.apr}%` : uiText(" — no rate set")}
          </option>
        ))}
      </select>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <label className="text-xs">
          <span className="text-[var(--muted)]">{uiText("From")}</span>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="input mt-1"
          />
        </label>
        <label className="text-xs">
          <span className="text-[var(--muted)]">{uiText("To")}</span>
          <input
            type="date"
            name="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="input mt-1"
          />
        </label>
      </div>

      {account && !account.apr && (
        <div className="text-xs text-[var(--amber)]">{uiText("This account has no rate yet. Set one below and the amount fills itself in.")}</div>
      )}

      {computed && days > 0 && (
        <div className="text-xs bg-[var(--surface-2)] border border-[var(--border)] rounded-lg p-3 space-y-1">
          {/* The arithmetic in full, so the figure can be argued with. */}
          <div className="text-[var(--muted)]">
            {account!.balance.toFixed(2)} {account!.currency} × {account!.apr}% × {days}/
            {account!.dayCount}{uiText(" days")}</div>
          <div className="font-medium">
            {computed.gross.toFixed(2)} {account!.currency}{uiText(" gross")}</div>
          {computed.tax > 0 && (
            <div className="text-[var(--muted)]">
              − {computed.tax.toFixed(2)}{uiText(" tax withheld (")}{account!.withholding}%) ={" "}
              <span className="text-[var(--foreground)]">{computed.net.toFixed(2)}</span>
            </div>
          )}
          <div className="text-[10px] text-[var(--muted)] pt-1">{uiText("Simple accrual on the current balance. If your balance moved during the period, the real figure differs — record shorter periods to follow it closely.")}</div>
        </div>
      )}

      {days < 0 && (
        <div className="text-xs text-[var(--red)]">{uiText("The end date is before the start date.")}</div>
      )}

      {futureDated && (
        <div className="text-xs text-[var(--amber)]">{uiText("This is dated in the future. The balance goes up today for money you haven't received yet.")}</div>
      )}

      <label className="text-xs block">
        <span className="text-[var(--muted)]">{uiText("Amount ")}{computed ? uiText("— leave blank to use the calculated figure") : ""}
        </span>
        <input
          name="amount"
          type="number"
          step="0.01"
          value={manual}
          onChange={(e) => setManual(e.target.value)}
          placeholder={computed ? computed.net.toFixed(2) : uiText("Amount")}
          className="input mt-1"
          required={!computed}
        />
      </label>

      {/* A loose tolerance on purpose: banks round per day and apply rate
          changes mid-period, so flagging every cent would train you to ignore it. */}
      {disagreement && disagreement.level !== "match" && (
        <div
          className="text-xs"
          style={{ color: disagreement.level === "off" ? "var(--red)" : "var(--amber)" }}
        >
          {disagreement.level === "off" ? "⚠ " : ""}{uiText("You received ")}{disagreement.difference > 0 ? uiText("more") : uiText("less")}{uiText(" than the rate implies:")}{" "}
          {disagreement.actual.toFixed(2)}{uiText(" against ")}{disagreement.expected.toFixed(2)} (
          {disagreement.percentOff?.toFixed(0)}{uiText("% off). Worth checking the rate and the day count.")}</div>
      )}

      <input type="hidden" name="computedAmount" value={computed?.net ?? ""} />

      <button type="submit" className="btn w-full" disabled={days < 0 || !account || amount <= 0}>{pending ? uiText("Saving…") : uiText("Record ")}{!pending && amount > 0 ? `${amount.toFixed(2)} ${account?.currency ?? ""}` : !pending ? uiText("interest") : ""}
      </button>
      </fieldset>
      {result.error && <p role="alert" className="text-xs text-[var(--red)]">{uiText(result.error)}</p>}
      {result.saved && <><p role="status" className="text-xs">{uiText("Interest saved.")}</p><button type="button" className="btn" onClick={restart}>{uiText("Record another interest payment")}</button></>}
    </form>
  );
}

export default function InterestForm(props: { accounts: RateAccount[]; today: string; action: (form: FormData) => Promise<{ saved?: boolean; error?: string }> }) {
  const [attempt, setAttempt] = useState(0);
  return <InterestAttempt key={attempt} {...props} restart={() => setAttempt(n => n + 1)} />;
}

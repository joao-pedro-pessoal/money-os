"use client";

import { useState } from "react";
import { Money } from "@/components/PrivacyContext";
import { fmt } from "@/lib/format";

/**
 * What the statement says you did with the money.
 *
 * Every figure here comes from the file you imported and nothing else: what you
 * paid, what you were paid, what it cost you in fees. No market prices, so no
 * "what it's worth now" — that needs a quote source, and mixing a real number
 * with an estimated one in the same table is how a table stops being trusted.
 *
 * The three questions it answers, in the order people ask them: where did the
 * money go, what did it pay me, and is any of it missing.
 */
type Holding = {
  key: string;
  isin: string | null;
  symbol: string | null;
  quantity: number;
  costBasis: number;
  averageCost: number | null;
  realizedPnl: number;
  incomeReceived: number;
  feesPaid: number;
  incomplete: boolean;
  reasons: string[];
  firstBought: string | null;
  lastTraded: string | null;
};

export default function StatementBreakdown({
  data,
}: {
  data: {
    currency: string;
    flows: { deposits: number; withdrawals: number; net: number };
    holdings: Holding[];
    stillInvested: number;
    realizedPnl: number;
    interest: { payments: { date: string; amount: number; description: string | null }[]; total: number };
    dividends: { payments: { date: string; amount: number; symbol: string | null }[]; total: number };
    fees: number;
    lastEvent: string | null;
    events: number;
    gain: {
      value: number;
      cost: number;
      unrealized: number;
      unrealizedPercent: number | null;
    } | null;
  };
}) {
  const [showInterest, setShowInterest] = useState(false);
  const [showDividends, setShowDividends] = useState(false);
  const c = data.currency;

  const held = data.holdings.filter((h) => h.quantity > 0);
  const closed = data.holdings.filter((h) => h.quantity === 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Figure label="You put in" value={data.flows.deposits} currency={c} />
        <Figure label="You took out" value={data.flows.withdrawals} currency={c} />
        <Figure label="Still invested, at cost" value={data.stillInvested} currency={c} />
        <Figure
          label="Interest + dividends"
          value={data.interest.total + data.dividends.total}
          currency={c}
          tone="good"
        />
      </div>

      {/* Cost from the statement, value from the account: the difference is
          the gain, and it needs no market prices at all. */}
      {data.gain && (
        <div className="card p-4">
          <div className="text-sm font-medium mb-1">What it has done</div>
          <div className="flex items-baseline gap-6 flex-wrap mt-2">
            <div>
              <div className="text-[10px] text-[var(--muted)]">Worth today</div>
              <div className="text-base font-semibold">
                <Money value={data.gain.value} currency={c} />
              </div>
            </div>
            <div className="text-[var(--muted)]">−</div>
            <div>
              <div className="text-[10px] text-[var(--muted)]">Cost</div>
              <div className="text-base font-semibold">
                <Money value={data.gain.cost} currency={c} />
              </div>
            </div>
            <div className="text-[var(--muted)]">=</div>
            <div>
              <div className="text-[10px] text-[var(--muted)]">Unrealised</div>
              <div
                className="text-base font-semibold"
                style={{ color: data.gain.unrealized >= 0 ? "var(--green)" : "var(--red)" }}
              >
                {data.gain.unrealized >= 0 ? "+" : "−"}
                {fmt(Math.abs(data.gain.unrealized), c)}
                {data.gain.unrealizedPercent !== null && (
                  <span className="text-xs font-normal">
                    {" "}
                    ({data.gain.unrealizedPercent >= 0 ? "+" : ""}
                    {data.gain.unrealizedPercent.toFixed(2)}%)
                  </span>
                )}
              </div>
            </div>
          </div>

          <p className="text-[10px] text-[var(--muted)] mt-3 leading-snug">
            Exact, and built without a single market price: the statement knows what you paid, and
            the account knows what it is worth. Which instrument earned it is not knowable from
            those two numbers, so the table above stays at cost rather than splitting this figure
            across rows that would then look like measurements.
          </p>
        </div>
      )}

      {/* Where it went. Cost, not value: the statement knows what you paid. */}
      <div className="card p-4">
        <div className="text-sm font-medium mb-1">Where the money went</div>
        <p className="text-xs text-[var(--muted)] mb-3">
          What each position cost you, from your own buys and sells. Not what it is worth today —
          the statement doesn&apos;t carry prices for days it wasn&apos;t traded.
        </p>

        {held.length === 0 ? (
          <div className="text-xs text-[var(--muted)] py-4">
            Nothing still held according to this statement.
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[var(--muted)] text-[10px]">
                <th className="text-left font-normal pb-1">Instrument</th>
                <th className="text-right font-normal pb-1">Shares</th>
                <th className="text-right font-normal pb-1">Avg price</th>
                <th className="text-right font-normal pb-1">Cost</th>
                <th className="text-right font-normal pb-1">Paid you</th>
              </tr>
            </thead>
            <tbody>
              {held.map((h) => (
                <tr key={h.key} className="border-t border-[var(--border)]">
                  <td className="py-1.5">
                    <div>{h.symbol ?? h.key}</div>
                    {h.isin && <div className="text-[10px] text-[var(--muted)]">{h.isin}</div>}
                    {h.incomplete && (
                      <div className="text-[10px]" style={{ color: "var(--amber)" }}>
                        {h.reasons[0]}
                      </div>
                    )}
                  </td>
                  <td className="py-1.5 text-right tabular-nums">{h.quantity}</td>
                  <td className="py-1.5 text-right tabular-nums text-[var(--muted)]">
                    {h.averageCost === null ? "—" : fmt(h.averageCost, c)}
                  </td>
                  <td className="py-1.5 text-right tabular-nums">
                    <Money value={h.costBasis} currency={c} />
                  </td>
                  <td
                    className="py-1.5 text-right tabular-nums"
                    style={{ color: h.incomeReceived > 0 ? "var(--green)" : undefined }}
                  >
                    {h.incomeReceived > 0 ? fmt(h.incomeReceived, c) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {closed.length > 0 && (
          <div className="mt-3 pt-3 border-t border-[var(--border)]">
            <div className="text-[10px] text-[var(--muted)] mb-1">
              Closed — sold in full, kept here because the profit is yours either way
            </div>
            {closed.map((h) => (
              <div key={h.key} className="flex justify-between text-xs py-0.5">
                <span>{h.symbol ?? h.key}</span>
                <span
                  className="tabular-nums"
                  style={{ color: h.realizedPnl >= 0 ? "var(--green)" : "var(--red)" }}
                >
                  {h.realizedPnl >= 0 ? "+" : "−"}
                  {fmt(Math.abs(h.realizedPnl), c)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <PaymentList
          title="Interest on idle cash"
          total={data.interest.total}
          currency={c}
          open={showInterest}
          onToggle={() => setShowInterest(!showInterest)}
          count={data.interest.payments.length}
          note="Money the account paid you for cash sitting there. It is realised profit — you have it, and it cannot be given back by a falling market."
          rows={data.interest.payments.map((p) => ({
            key: `${p.date}-${p.amount}`,
            left: p.date,
            right: p.amount,
          }))}
        />
        <PaymentList
          title="Dividends"
          total={data.dividends.total}
          currency={c}
          open={showDividends}
          onToggle={() => setShowDividends(!showDividends)}
          count={data.dividends.payments.length}
          note="Distributions from what you hold, as recorded in the statement."
          rows={data.dividends.payments.map((p) => ({
            key: `${p.date}-${p.symbol}-${p.amount}`,
            left: `${p.date}${p.symbol ? ` · ${p.symbol}` : ""}`,
            right: p.amount,
          }))}
        />
      </div>

      <div className="text-[10px] text-[var(--muted)] leading-snug">
        From {data.events} imported rows, up to {data.lastEvent ?? "—"}. Fees paid:{" "}
        {fmt(data.fees, c)}. Profit on sales, {fmt(data.realizedPnl, c)}, is this app&apos;s own
        calculation using average cost — your broker may state a different figure using a different
        method.
      </div>
    </div>
  );
}

function Figure({
  label,
  value,
  currency,
  tone,
}: {
  label: string;
  value: number;
  currency: string;
  tone?: "good";
}) {
  return (
    <div className="card p-3">
      <div className="text-[10px] text-[var(--muted)] mb-1">{label}</div>
      <div
        className="text-base font-semibold"
        style={{ color: tone === "good" && value > 0 ? "var(--green)" : undefined }}
      >
        <Money value={value} currency={currency} />
      </div>
    </div>
  );
}

function PaymentList({
  title,
  total,
  currency,
  count,
  note,
  rows,
  open,
  onToggle,
}: {
  title: string;
  total: number;
  currency: string;
  count: number;
  note: string;
  rows: { key: string; left: string; right: number }[];
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="card p-4">
      <div className="flex items-baseline justify-between gap-2">
        <div className="text-sm font-medium">{title}</div>
        <div className="text-sm font-semibold" style={{ color: total > 0 ? "var(--green)" : undefined }}>
          <Money value={total} currency={currency} />
        </div>
      </div>
      <p className="text-[10px] text-[var(--muted)] leading-snug mt-1">{note}</p>

      {count === 0 ? (
        <div className="text-xs text-[var(--muted)] mt-3">None in this statement.</div>
      ) : (
        <>
          <button
            type="button"
            onClick={onToggle}
            className="text-[10px] mt-2"
            style={{ color: "var(--accent)" }}
          >
            {open ? "Hide" : `Show all ${count}`}
          </button>
          {open && (
            <div className="mt-2 space-y-0.5 max-h-64 overflow-y-auto">
              {rows.map((r) => (
                <div key={r.key} className="flex justify-between text-[11px]">
                  <span className="text-[var(--muted)]">{r.left}</span>
                  <span className="tabular-nums">{fmt(r.right, currency)}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

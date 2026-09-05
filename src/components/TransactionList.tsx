"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  applyTransactionFilters,
  transactionFilterOptions,
  hasActiveTransactionFilters,
  transactionTotals,
  directionOf,
  NO_TRANSACTION_FILTERS,
  type TransactionFilters,
  type TransactionRow,
} from "@/lib/money/transactionFilter";
import { Money } from "@/components/PrivacyContext";
import ConfirmSubmitButton from "@/components/ConfirmSubmitButton";

/**
 * The transaction list, over whatever slice is chosen.
 *
 * The filters narrow **one** array and the totals recompute from it, so there
 * is never a figure describing the year sitting above a table describing one
 * month. Same rule as `TradeHistory` and `SpendingAnalysis`.
 *
 * Colour carries the direction, and only the direction. It is `--green` and
 * `--red` from the theme, so the monochrome mode turns it off along with
 * everything else — which is why the sign stays on the number rather than
 * being replaced by the colour.
 */
export default function TransactionList({
  rows,
  currency,
  approximate,
  unconverted,
  deleteAction,
}: {
  rows: TransactionRow[];
  /** What the converted amounts are in. */
  currency: string;
  approximate: boolean;
  unconverted: { amount: number; currency: string }[];
  deleteAction: (formData: FormData) => Promise<void>;
}) {
  const [filters, setFilters] = useState<TransactionFilters>(NO_TRANSACTION_FILTERS);

  const filtered = useMemo(() => applyTransactionFilters(rows, filters), [rows, filters]);
  const totals = useMemo(() => transactionTotals(filtered), [filtered]);
  const options = useMemo(() => transactionFilterOptions(rows), [rows]);

  const active = hasActiveTransactionFilters(filters);
  const hidden = rows.length - filtered.length;

  const set = <K extends keyof TransactionFilters>(key: K, value: TransactionFilters[K]) =>
    setFilters((f) => ({ ...f, [key]: value }));

  /** "" is the empty option and means no filter, not a value of "". */
  const pick = (value: string) => (value === "" ? null : value);

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <div className="flex items-baseline justify-between gap-3 flex-wrap mb-3">
          <div className="text-sm font-medium">Transactions</div>
          {active && (
            <button
              onClick={() => setFilters(NO_TRANSACTION_FILTERS)}
              className="text-xs text-[var(--accent)]"
            >
              Clear ({hidden} row{hidden === 1 ? "" : "s"} hidden)
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-6 gap-2 mb-3">
          <select
            className="input input-narrow text-xs py-1"
            value={filters.direction ?? ""}
            onChange={(e) => set("direction", pick(e.target.value) as "in" | "out" | null)}
          >
            <option value="">In and out</option>
            <option value="in">Money in</option>
            <option value="out">Money out</option>
          </select>

          <select
            className="input input-narrow text-xs py-1"
            value={filters.accountName ?? ""}
            onChange={(e) => set("accountName", pick(e.target.value))}
          >
            <option value="">Every account</option>
            {options.accounts.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>

          <select
            className="input input-narrow text-xs py-1"
            value={filters.categoryName ?? ""}
            onChange={(e) => set("categoryName", pick(e.target.value))}
          >
            <option value="">Every category</option>
            {options.categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          <input
            type="date"
            className="input input-narrow text-xs py-1"
            value={filters.from ?? ""}
            onChange={(e) => set("from", pick(e.target.value))}
          />
          <input
            type="date"
            className="input input-narrow text-xs py-1"
            value={filters.to ?? ""}
            onChange={(e) => set("to", pick(e.target.value))}
          />

          <input
            className="input input-narrow text-xs py-1"
            placeholder="Search"
            value={filters.search}
            onChange={(e) => set("search", e.target.value)}
          />
        </div>

        {/*
          In and out kept apart, never netted into one figure. A month with
          3 000 in and 2 900 out is not the same as one with 100 in and nothing
          out, and a single number renders them identically.
        */}
        <div className="grid grid-cols-3 gap-3 mb-3">
          <div>
            <div className="text-[10px] text-[var(--muted)]">In</div>
            <div className="text-sm font-semibold text-[var(--green)]">
              <Money value={totals.inflow} currency={currency} />
            </div>
          </div>
          <div>
            <div className="text-[10px] text-[var(--muted)]">Out</div>
            <div className="text-sm font-semibold text-[var(--red)]">
              <Money value={totals.outflow} currency={currency} />
            </div>
          </div>
          <div>
            <div className="text-[10px] text-[var(--muted)]">
              Net{active && " — over what is shown"}
            </div>
            <div
              className={`text-sm font-semibold ${
                totals.net >= 0 ? "text-[var(--green)]" : "text-[var(--red)]"
              }`}
            >
              <Money value={totals.net} currency={currency} />
            </div>
          </div>
        </div>

        {(approximate || unconverted.length > 0) && (
          <div className="text-[10px] text-[var(--muted)] mb-3 max-w-prose leading-relaxed">
            {approximate &&
              `Amounts recorded in another currency are converted at today's rate, so figures before today are approximate. `}
            {unconverted.length > 0 && (
              <span className="text-[var(--amber)]">
                {unconverted.length} row{unconverted.length === 1 ? " is" : "s are"} missing
                entirely — {[...new Set(unconverted.map((u) => u.currency))].join(", ")} has no
                rate, so it is left out and said rather than counted as nothing.
              </span>
            )}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Account</th>
                <th>Category</th>
                <th>Description</th>
                <th className="text-right">Amount</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => {
                const out = directionOf(t) === "out";
                return (
                  <tr key={t.id}>
                    <td>{new Date(t.date).toLocaleDateString("pt-PT")}</td>
                    <td>{t.accountName ?? "—"}</td>
                    <td>
                      {t.categoryName ?? "—"}
                      {/* The type says more than the direction for this one:
                          money leaving to be invested is not spending. */}
                      {t.type === "investment_contribution" && (
                        <div className="text-[10px] text-[var(--muted)]">to investments</div>
                      )}
                      {t.type === "transfer" && (
                        <div className="text-[10px] text-[var(--muted)]">internal transfer</div>
                      )}
                    </td>
                    <td className="max-w-64 truncate">{t.description || t.merchant || "—"}</td>
                    <td
                      className={`text-right font-medium ${
                        out ? "text-[var(--red)]" : "text-[var(--green)]"
                      }`}
                    >
                      <Money value={t.amount} currency={currency} />
                      {/* What it was actually recorded in, when that is not
                          what the column is showing. A converted figure with
                          no note reads as the original. */}
                      {t.currency !== currency && (
                        <div className="text-[10px] text-[var(--muted)] font-normal">
                          recorded in {t.currency}
                        </div>
                      )}
                    </td>
                    <td className="text-right whitespace-nowrap">
                      <Link href={`/transactions/${t.id}/edit`} className="text-xs mr-3">
                        Edit
                      </Link>
                      <form action={deleteAction} className="inline">
                        <input type="hidden" name="id" value={t.id} />
                        <ConfirmSubmitButton
                          label="Delete"
                          confirmMessage="Remove this transaction? The account balance goes back to what it was."
                        />
                      </form>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {filtered.length === 0 && (
          <div className="text-xs text-[var(--muted)] py-8 text-center">
            {rows.length === 0
              ? "Nothing recorded yet."
              : "Nothing matches these filters — the rows are still there."}
          </div>
        )}
      </div>
    </div>
  );
}

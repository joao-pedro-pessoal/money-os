"use client";

import { transactionDescription, transactionTypeLabel } from "@/lib/i18n/systemText";
import { useLanguage } from "@/components/LanguageContext";
import { localeOf } from "@/lib/i18n/languages";
import { useText } from "@/components/useText";
import ResponsiveTable from "@/components/ResponsiveTable";


import { useMemo, useState } from "react";
import Link from "next/link";
import {
  applyTransactionFilters,
  transactionFilterOptions,
  hasActiveTransactionFilters,
  transactionTotals,
  directionOf,
  NO_TRANSACTION_FILTERS,
  parseTransactionFilters,
  type TransactionFilters,
  type TransactionRow,
} from "@/lib/money/transactionFilter";
import { Money } from "@/components/PrivacyContext";
import ConfirmSubmitButton from "@/components/ConfirmSubmitButton";
import MobileFold from "@/components/MobileFold";
import MultiSelect from "@/components/MultiSelect";
import SavedFilters from "@/components/SavedFilters";

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
  initialDirection,
}: {
  rows: TransactionRow[];
  /** What the converted amounts are in. */
  currency: string;
  approximate: boolean;
  unconverted: { amount: number; currency: string }[];
  deleteAction: (formData: FormData) => Promise<void>;
  /** Arriving from a figure that is only one direction, such as the dashboard's income. */
  initialDirection?: "in" | "out" | null;
}) {
  const uiText = useText();
  const { language } = useLanguage();
  const [filters, setFilters] = useState<TransactionFilters>({ ...NO_TRANSACTION_FILTERS, direction: initialDirection ?? null });

  const filtered = useMemo(() => applyTransactionFilters(rows, filters), [rows, filters]);
  const totals = useMemo(() => transactionTotals(filtered), [filtered]);
  const options = useMemo(() => transactionFilterOptions(rows), [rows]);

  const active = hasActiveTransactionFilters(filters);
  const hidden = rows.length - filtered.length;

  const set = <K extends keyof TransactionFilters>(key: K, value: TransactionFilters[K]) =>
    setFilters((f) => ({ ...f, [key]: value }));

  /** "" is the empty option and means no filter, not a value of "". */
  const pick = (value: string) => (value === "" ? null : value);
  /** A size typed in: blank or not a number is no bound. */
  const amountOf = (value: string) => {
    const n = Number(value.replace(",", "."));
    return value.trim() === "" || !Number.isFinite(n) || n < 0 ? null : n;
  };

  return (
    <div className="space-y-4">
      <div className="cash-flow-list card p-4">
        <div className="cash-flow-list-heading flex items-baseline justify-between gap-3 flex-wrap mb-3">
          <div>
            <h2 className="text-sm font-medium"><span className="cash-flow-phone-only">{uiText("Recent activity")}</span><span className="cash-flow-desktop-only">{uiText("Transactions")}</span></h2>
            <p className="cash-flow-phone-only text-xs text-[var(--muted)] mt-1" role="status">{uiText("Showing ")}{filtered.length}{uiText(" of ")}{rows.length}{uiText(" loaded transactions")}</p>
          </div>
          {active && (
            <button
              onClick={() => setFilters(NO_TRANSACTION_FILTERS)}
              className="text-xs text-[var(--accent)]"
            >
              <span className="cash-flow-phone-only">{uiText("Clear filters")}</span><span className="cash-flow-desktop-only">{uiText("Clear (")}{uiText(hidden === 1 ? "{count} row" : "{count} rows", { count: hidden })}{uiText(" hidden)")}</span>
            </button>
          )}
        </div>

        {/*
          In and out kept apart, never netted into one figure. A month with
          3 000 in and 2 900 out is not the same as one with 100 in and nothing
          out, and a single number renders them identically.
        */}
        <div className="transaction-totals grid grid-cols-1 sm:grid-cols-3 gap-3 my-3">
          <div>
            <div className="text-[10px] text-[var(--muted)]"><span className="cash-flow-phone-only">{uiText("Money in")}</span><span className="cash-flow-desktop-only">{uiText("In")}</span></div>
            <div className="text-sm font-semibold text-[var(--green)]">
              <Money value={totals.inflow} currency={currency} />
            </div>
          </div>
          <div>
            <div className="text-[10px] text-[var(--muted)]"><span className="cash-flow-phone-only">{uiText("Money out")}</span><span className="cash-flow-desktop-only">{uiText("Out")}</span></div>
            <div className="text-sm font-semibold text-[var(--red)]">
              <Money value={totals.outflow} currency={currency} />
            </div>
          </div>
          <div>
            <div className="text-[10px] text-[var(--muted)]">
              <span className="cash-flow-phone-only">{uiText("Net change")}</span><span className="cash-flow-desktop-only">{uiText("Net")}{active && uiText(" — over what is shown")}</span>
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
        <p className="cash-flow-phone-only text-xs text-[var(--muted)] mb-3">{uiText("Totals for the transactions shown. Up to 200 recent transactions are loaded.")}</p>

        <div className="cash-flow-phone-only cash-flow-search space-y-3">
          <input type="search" aria-label={uiText("Search transactions")} className="input" placeholder={uiText("Search description or merchant…")} value={filters.search} onChange={(e) => set("search", e.target.value)} />
          <div className="cash-flow-directions" role="group" aria-label={uiText("Money direction")}>
            {([ [null, "All activity"], ["in", "Money in"], ["out", "Money out"] ] as const).map(([direction, label]) => (
              <button type="button" key={label} aria-pressed={filters.direction === direction} onClick={() => set("direction", direction)}>{uiText(label ?? "")}</button>
            ))}
          </div>
        </div>
        <MobileFold title={`${uiText("Account, category, amount & dates")}${(filters.accounts.length || filters.categories.length || filters.types.length || filters.minAmount !== null || filters.maxAmount !== null || filters.from || filters.to) ? uiText(" · Filters applied") : ""}`} persistKey="transaction-filters">
        <div className="cash-flow-filter-fields grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2 mb-3">
          <select aria-label={uiText("Money direction")} className="cash-flow-desktop-only input input-narrow text-xs py-1" value={filters.direction ?? ""} onChange={(e) => set("direction", pick(e.target.value) as "in" | "out" | null)}>
            <option value="">{uiText("In and out")}</option><option value="in">{uiText("Money in")}</option><option value="out">{uiText("Money out")}</option>
          </select>
          {/* Several accounts, categories or types at once; every field applies. */}
          <MultiSelect label={uiText("Account")} options={options.accounts} selected={filters.accounts} onChange={(v) => set("accounts", v)} />
          <MultiSelect label={uiText("Category")} options={options.categories} selected={filters.categories} onChange={(v) => set("categories", v)} noneLabel="No category" />
          <MultiSelect label={uiText("Type")} options={options.types} render={type=>transactionTypeLabel(type,uiText)} selected={filters.types} onChange={(v) => set("types", v)} />
          <label className="text-xs text-[var(--muted)]"><span className="block text-[10px] mb-1">{uiText("Amount from")}</span>
          <input
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            aria-label={uiText("Smallest amount")}
            className="input input-narrow text-xs py-1 w-full"
            value={filters.minAmount ?? ""}
            onChange={(e) => set("minAmount", amountOf(e.target.value))}
          />
          </label>
          <label className="text-xs text-[var(--muted)]"><span className="block text-[10px] mb-1">{uiText("Amount to")}</span>
          <input
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            aria-label={uiText("Largest amount")}
            className="input input-narrow text-xs py-1 w-full"
            value={filters.maxAmount ?? ""}
            onChange={(e) => set("maxAmount", amountOf(e.target.value))}
          />
          </label>
          <label className="text-xs text-[var(--muted)]"><span className="cash-flow-phone-only">{uiText("From date")}</span>
          <input
            type="date"
            aria-label={uiText("From date")}
            className="input input-narrow text-xs py-1"
            value={filters.from ?? ""}
            onChange={(e) => set("from", pick(e.target.value))}
          />
          </label>
          <label className="text-xs text-[var(--muted)]"><span className="cash-flow-phone-only">{uiText("To date")}</span>
          <input
            type="date"
            aria-label={uiText("To date")}
            className="input input-narrow text-xs py-1"
            value={filters.to ?? ""}
            onChange={(e) => set("to", pick(e.target.value))}
          />
          </label>
          <input aria-label={uiText("Search transactions")} className="cash-flow-desktop-only input input-narrow text-xs py-1" placeholder={uiText("Search")} value={filters.search} onChange={(e) => set("search", e.target.value)} />
        </div>
        <div className="mb-3">
          <SavedFilters
            scope="transactions"
            current={JSON.stringify(filters)}
            active={active}
            onApply={(config) => setFilters(parseTransactionFilters(config, options))}
          />
        </div>
        </MobileFold>

        {(approximate || unconverted.length > 0) && (
          <div className="text-[10px] text-[var(--muted)] mb-3 max-w-prose leading-relaxed">
            {approximate &&
              uiText("Amounts recorded in another currency are converted at today's rate, so figures before today are approximate.")+" "}
            {unconverted.length > 0 && (
              <span className="text-[var(--amber)]">
                {unconverted.length}{uiText(" row")}{unconverted.length === 1 ? uiText(" is") : uiText("s are")}{uiText(" missing entirely — ")}{[...new Set(unconverted.map((u) => u.currency))].join(", ")}{uiText(" has no rate, so it is left out and said rather than counted as nothing.")}</span>
            )}
          </div>
        )}

        <div className="overflow-x-auto">
          <div className="table-scroll mobile-records cash-flow-records" role="region" aria-label={uiText("Transactions")} tabIndex={0}><ResponsiveTable className="data-table" role="table">
            <thead>
              <tr>
                <th>{uiText("Date")}</th>
                <th>{uiText("Account")}</th>
                <th>{uiText("Category")}</th>
                <th>{uiText("Description")}</th>
                <th className="text-right">{uiText("Amount")}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => {
                const out = directionOf(t) === "out";
                return (
                  <tr key={t.id} role="row">
                    <td role="cell" data-label={uiText("Date")}><span className="cash-flow-phone-only">{new Date(t.date).toLocaleDateString(localeOf(language), { day: "numeric", month: "short", year: "numeric" })}</span><span className="cash-flow-desktop-only">{new Date(t.date).toLocaleDateString(localeOf(language))}</span></td>
                    <td role="cell" data-label={uiText("Account")}><span translate="no">{t.accountName ?? "—"}</span></td>
                    <td role="cell" data-label={uiText("Category")}>
                      <span translate="no">{t.categoryName ?? "—"}</span>
                      {/* The type says more than the direction for this one:
                          money leaving to be invested is not spending. */}
                      {t.type === "investment_contribution" && (
                        <div className="text-[10px] text-[var(--muted)]">{uiText("to investments")}</div>
                      )}
                      {t.type === "transfer" && (
                        <div className="text-[10px] text-[var(--muted)]">{uiText("internal transfer")}</div>
                      )}
                    </td>
                    <td role="cell" data-label={uiText("Description")} className="record-description max-w-64 truncate"><span className="cash-flow-phone-only"><span translate="no">{transactionDescription(t.description,uiText) || t.merchant || t.categoryName || (t.type === "transfer" ? uiText("Internal transfer") : t.type === "investment_contribution" ? uiText("Investment contribution") : out ? uiText("Expense") : uiText("Income"))}</span></span><span className="cash-flow-desktop-only"><span translate="no">{transactionDescription(t.description,uiText) || t.merchant || t.categoryName || "—"}</span></span></td>
                    <td
                      role="cell" data-label={uiText("Amount")}
                      className={`text-right font-medium ${
                        out ? "text-[var(--red)]" : "text-[var(--green)]"
                      }`}
                    >
                      <Money value={t.amount} currency={currency} />
                      {/* What it was actually recorded in, when that is not
                          what the column is showing. A converted figure with
                          no note reads as the original. */}
                      {t.currency !== currency && (
                        <div className="text-[10px] text-[var(--muted)] font-normal">{uiText("recorded in ")}{t.currency}
                        </div>
                      )}
                    </td>
                    <td role="cell" data-label={uiText("Actions")} className="record-actions text-right whitespace-nowrap">
                      <Link href={`/transactions/${t.id}/edit`} className="text-xs mr-3">{uiText("Edit")}</Link>
                      <form action={deleteAction} className="inline">
                        <input type="hidden" name="id" value={t.id} />
                        <ConfirmSubmitButton
                          label={uiText("Delete")}
                          confirmMessage="Remove this transaction? The account balance goes back to what it was."
                        />
                      </form>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </ResponsiveTable></div>
        </div>

        {filtered.length === 0 && (
          <div className="text-xs text-[var(--muted)] py-8 text-center">
            {rows.length === 0
              ? uiText("No transactions yet. Add your first transaction above or import a statement.")
              : uiText("No matching transactions. Try another search or clear the filters.")}
          </div>
        )}
      </div>
    </div>
  );
}

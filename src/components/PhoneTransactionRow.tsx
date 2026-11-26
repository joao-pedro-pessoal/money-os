import Link from "next/link";
import type { ReactNode } from "react";
import { Money } from "./PrivacyContext";
import PhoneIcon from "./PhoneIcon";
import { categoryIcon } from "@/lib/ui/phoneIcons";
import { transactionDescription } from "@/lib/i18n/systemText";
import type { TextTranslator } from "@/lib/i18n/text";

export type PhoneTransaction = { id: string; date: string; type: string; amount: number; currency: string; accountName: string | null; categoryName: string | null; description: string | null; merchant: string | null };

/**
 * One entry as the phone lists it (F30): picture, what it was, where, and how
 * much. The sign carries the direction, as in the cash-flow table
 * (`directionOf`); a transfer is muted because it is neither spent nor earned.
 *
 * With `actions` the row opens in place to show them (edit, delete); without,
 * it is a link to the entry's edit page.
 */
export default function PhoneTransactionRow({ row, uiText, currency, when, actions }: { row: PhoneTransaction; uiText: TextTranslator; currency: string; when?: string; actions?: ReactNode }) {
  const out = row.amount < 0;
  const title = transactionDescription(row.description, uiText) || row.merchant || row.categoryName
    || (row.type === "transfer" ? uiText("Internal transfer") : row.type === "investment_contribution" ? uiText("Investment contribution") : out ? uiText("Expense") : uiText("Income"));
  const tone = row.type === "transfer" ? "ph-amount ph-muted" : out ? "ph-amount" : "ph-amount ph-in";
  const where = [row.categoryName, row.accountName].filter(Boolean).join(" · ");
  const body = <>
    <span className="ph-icon-box"><PhoneIcon name={categoryIcon(row.categoryName, row.type === "transfer" ? "transfer" : out ? "expense" : "income")} size={19} /></span>
    <span className="ph-row-text">
      <span translate="no" className="ph-row-title">{title}</span>
      <span className="ph-row-sub"><span translate="no">{where}</span>{where && when ? " · " : ""}{when}</span>
    </span>
    <span className={tone}>{out ? "−" : "+"}<Money value={Math.abs(row.amount)} currency={currency} /></span>
  </>;
  if (actions) return (
    <li>
      <details className="ph-row-details">
        <summary className="ph-row">{body}</summary>
        <div className="ph-row-actions">{actions}</div>
      </details>
    </li>
  );
  return <li><Link href={`/transactions/${row.id}/edit`} className="ph-row">{body}</Link></li>;
}

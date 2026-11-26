import Link from "next/link";
import { Money } from "./PrivacyContext";
import PhoneIcon from "./PhoneIcon";
import AccountQuick from "./AccountQuick";
import TryQuickEntry from "./TryQuickEntry";
import { accountIcon } from "@/lib/ui/phoneIcons";
import type { TextTranslator } from "@/lib/i18n/text";

const SHARE_COLOURS = ["var(--accent)", "var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)"];

/**
 * The accounts page on a phone (F30): what you have in accounts, what it is
 * made of, the two things done here most, and each account as one tappable row
 * that opens the same sheet as before (set its balance, add an entry, send).
 * What you owe sits below, as on the dashboard's main card.
 */
export default function PhoneAccounts({ uiText, currency, cash, accounts, composition, debts, debtTotal }: {
  uiText: TextTranslator;
  currency: string;
  cash: number;
  accounts: { id: string; name: string; institution: string | null; accountType: string; currency: string; balance: number }[];
  composition: { name: string; value: number }[];
  debts: { id: string; name: string; balance: number; currency: string; monthlyPayment: number | null }[];
  debtTotal: number;
}) {
  const positive = composition.filter(part => part.value > 0).sort((a, b) => b.value - a.value);
  const whole = positive.reduce((sum, part) => sum + part.value, 0);
  // Five colours, then the rest as one slice, so no two slices share a colour.
  const shown = positive.length > 5
    ? [...positive.slice(0, 4), { name: uiText("Other"), value: positive.slice(4).reduce((sum, part) => sum + part.value, 0) }]
    : positive;
  return (
    <div className="ph-accounts">
      <section className="ph-card" aria-labelledby="ph-accounts-total">
        <span id="ph-accounts-total" className="ph-sub">{uiText("In accounts")}</span>
        <strong className="ph-big"><Money value={cash} currency={currency} /></strong>
        {whole > 0 && <>
          <span className="ph-share" role="img" aria-label={shown.map(part => `${part.name} ${Math.round((part.value / whole) * 100)}%`).join(", ")}>
            {shown.map((part, i) => <span key={part.name + i} style={{ width: `${(part.value / whole) * 100}%`, background: SHARE_COLOURS[i] }} />)}
          </span>
          <span className="ph-legend" aria-hidden="true">
            {shown.map((part, i) => <span key={part.name + i}><i style={{ background: SHARE_COLOURS[i] }} /><span translate="no">{part.name}</span></span>)}
          </span>
        </>}
      </section>

      <div className="ph-two">
        {accounts.length > 1
          ? <TryQuickEntry kind="transfer" label="Send money" className="ph-primary" icon="transfer" />
          : <TryQuickEntry kind="expense" label="Record an expense" className="ph-primary" icon="out" />}
        <a href="#add-account" className="ph-secondary"><PhoneIcon name="plus" size={18} strokeWidth={2} />{uiText("Add account")}</a>
      </div>

      {accounts.length > 0 && <>
        <ul className="ph-card ph-rows ph-rows-divided" aria-label={uiText("Accounts")}>
          {accounts.map(account => (
            <li key={account.id}>
              <AccountQuick canSend={accounts.length > 1} account={{ id: account.id, name: account.name, currency: account.currency, balance: account.balance }} className="ph-row">
                <span className="ph-icon-box"><PhoneIcon name={accountIcon(account.accountType, account.balance)} size={19} /></span>
                <span className="ph-row-text">
                  <span translate="no" className="ph-row-title">{account.name}</span>
                  {account.institution && <span translate="no" className="ph-row-sub">{account.institution}</span>}
                </span>
                <span className={account.balance < 0 ? "ph-amount ph-over-text" : "ph-amount"}><Money value={account.balance} currency={account.currency} /></span>
              </AccountQuick>
            </li>
          ))}
        </ul>
        <p className="ph-sub">{uiText("Tap an account to set its balance or add an entry.")}</p>
      </>}

      {debts.length > 0 && (
        <section className="ph-section" aria-labelledby="ph-debts">
          <div className="ph-section-head">
            <h2 id="ph-debts" className="ph-h2">{uiText("What you owe")}</h2>
            <Link href="/liabilities" className="ph-link">{uiText("See all")}</Link>
          </div>
          <ul className="ph-card ph-rows ph-rows-divided">
            {debts.map(debt => (
              <li key={debt.id}>
                <Link href="/liabilities" className="ph-row">
                  <span className="ph-icon-box"><PhoneIcon name="receipt" size={19} /></span>
                  <span className="ph-row-text">
                    <span translate="no" className="ph-row-title">{debt.name}</span>
                    {debt.monthlyPayment !== null && <span className="ph-row-sub"><Money value={debt.monthlyPayment} currency={debt.currency} />{uiText(" a month")}</span>}
                  </span>
                  <span className="ph-amount"><Money value={debt.balance} currency={debt.currency} /></span>
                </Link>
              </li>
            ))}
          </ul>
          {debts.length > 1 && <p className="ph-sub">{uiText("In total")}: <Money value={debtTotal} currency={currency} /></p>}
        </section>
      )}
    </div>
  );
}

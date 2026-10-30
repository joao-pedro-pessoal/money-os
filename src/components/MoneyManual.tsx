import Link from "next/link";
import { textForRequest } from "@/actions/pageLanguage";
import Section from "./Section";

export default async function MoneyManual() {
  const t = await textForRequest();
  const steps = [
    { href:"/accounts", title:"Accounts", text:"Create an account and enter its current balance." },
    { href:"/transactions", title:"Cash Flow", text:"Record income and expenses. Transfers move money between your own accounts." },
    { href:"/budgets", title:"Budgets", text:"Set a spending limit and choose the expense categories it watches." },
    { href:"/buckets", title:"Buckets", text:"Set money aside for a goal. Allocations do not move money between accounts." },
    { href:"/subscriptions", title:"Subscriptions", text:"Track upcoming charges. A forecast does not change your balance." },
    { href:"/analytics/report", title:"Reports", text:"Review your income and spending, then download a CSV or PDF." },
    { href:"/settings/data", title:"Your data", text:"Export a backup, restore your records or delete your account in Settings." },
  ];
  return <div className="space-y-5 max-w-3xl">
    <h1 className="text-lg font-semibold">{t("Manual")}</h1>
    {steps.map(step => <Section key={step.href} title={step.title} defaultOpen essential>
      <p className="text-sm text-[var(--muted)]">{t(step.text)}</p>
      <Link href={step.href} className="inline-block mt-3 text-[var(--accent)]">{t(step.title)} →</Link>
    </Section>)}
  </div>;
}

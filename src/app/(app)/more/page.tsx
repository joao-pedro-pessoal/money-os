import Link from "next/link";
import { textForRequest } from "@/actions/pageLanguage";
import { currentLanguage } from "@/actions/language";
import { currentInvestments } from "@/actions/releaseEdition";
import { listBudgets } from "@/actions/budgets";
import { listBucketsWithTotals } from "@/actions/buckets";
import { listExpected } from "@/actions/expected";
import { listSubscriptions } from "@/actions/subscriptions";
import { getNetWorth } from "@/actions/networth";
import { logout } from "@/app/login/actions";
import { messagesFor } from "@/lib/i18n/messages";
import { monthBudgetLine } from "@/lib/ui/phoneSummary";
import type { PhoneIconName } from "@/lib/ui/phoneIcons";
import { Money } from "@/components/PrivacyContext";
import PhoneIcon from "@/components/PhoneIcon";
import MoreSettings from "@/components/MoreSettings";

/**
 * Everything the phone's bottom bar has no room for (F30), as tiles that each
 * say what is behind them. On a computer the side menu already lists all of it;
 * the page still works there, it is just not linked.
 */
export default async function MorePage() {
  const [uiText, language, investmentsEnabled, budgets, goals, coming, subscriptions, worth] = await Promise.all([
    textForRequest(), currentLanguage(), currentInvestments(), listBudgets(), listBucketsWithTotals(), listExpected(), listSubscriptions(), getNetWorth(),
  ]);
  const t = messagesFor(language).nav;
  const currency = worth.baseCurrency;
  const month = monthBudgetLine(budgets.items, new Date());
  const monthly = subscriptions.filter(sub => sub.active && sub.monthlyInBase !== null).reduce((sum, sub) => sum + (sub.monthlyInBase ?? 0), 0);
  const saved = goals.reduce((sum, goal) => sum + goal.total, 0);

  const tiles: { href: string; icon: PhoneIconName; title: string; hint: React.ReactNode }[] = [
    { href: "/buckets", icon: "target", title: uiText("Buckets"), hint: goals.length === 0 ? uiText("None yet") : <>{uiText(goals.length === 1 ? "{0} goal" : "{0} goals", { "0": goals.length })} · <Money value={saved} currency={currency} /></> },
    { href: "/budgets", icon: "pie", title: uiText("Budgets"), hint: month ? uiText("{0}% used this month", { "0": month.percent }) : uiText("None yet") },
    { href: "/expected", icon: "calendar", title: uiText("Coming in"), hint: coming.rows.length === 0 ? uiText("None yet") : <><Money value={coming.total} currency={currency} />{uiText(" still to come")}</> },
    { href: "/subscriptions", icon: "repeat", title: uiText("Subscriptions"), hint: monthly > 0 ? <><Money value={Math.round(monthly * 100) / 100} currency={currency} />{uiText(" a month")}</> : uiText("None yet") },
    { href: "/liabilities", icon: "receipt", title: uiText("What you owe"), hint: worth.liabilities > 0 ? <Money value={worth.liabilities} currency={currency} /> : uiText("Nothing recorded") },
    { href: "/analytics", icon: "bars", title: uiText("Analytics"), hint: uiText("Where your money goes") },
    { href: "/analytics/report", icon: "report", title: uiText("Reports"), hint: uiText("PDF of any period") },
    { href: "/import", icon: "import", title: uiText("Import statement"), hint: uiText("Your bank's file") },
    ...(investmentsEnabled ? [{ href: "/investments", icon: "invest" as const, title: uiText("Investments"), hint: uiText("Holdings and performance") }] : []),
    { href: "/manual", icon: "help", title: t.manual, hint: uiText("How the app works") },
  ];

  return (
    <div className="ph-page space-y-6">
      <h1 className="ph-title">{uiText("More")}</h1>
      <nav aria-label={uiText("More")} className="ph-tiles">
        {tiles.map(tile => (
          <Link key={tile.href} href={tile.href} className="ph-tile">
            <span className="ph-tile-title"><span className="ph-icon-box"><PhoneIcon name={tile.icon} size={18} /></span>{tile.title}</span>
            <span className="ph-tile-hint">{tile.hint}</span>
          </Link>
        ))}
      </nav>
      <section aria-labelledby="more-settings" className="space-y-3">
        <h2 id="more-settings" className="ph-h2">{t.settings}</h2>
        <MoreSettings />
      </section>
      <form action={logout}>
        <button type="submit" className="ph-quiet-button">{t.logOut}</button>
      </form>
    </div>
  );
}

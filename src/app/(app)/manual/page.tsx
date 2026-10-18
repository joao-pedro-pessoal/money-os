import { textForRequest } from "@/actions/pageLanguage";
import ResponsiveTable from "@/components/ResponsiveTable";
import Link from "next/link";
import Section from "@/components/Section";
import PanelFrame from "@/components/PanelFrame";

/**
 * How to use this app, inside the app.
 *
 * Written here rather than kept as a document elsewhere for one reason: a
 * manual that lives outside the thing it describes goes stale the first week
 * and nobody notices. This page uses the same words the screens use — if a
 * label changes and this page still says the old one, the difference is visible
 * to anyone reading it beside the screen.
 *
 * Static: no data, no queries. It describes the app, it doesn't inspect it.
 */

/** Where a screen lives, in the words the sidebar uses. */
function Where({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs text-[var(--muted)] mb-3 font-mono">{children}</p>
  );
}

/**
 * A block set apart from the prose.
 *
 * `tone` is the whole point: "care" is something that will surprise you,
 * "stop" is something that will corrupt your figures if you get it wrong.
 * A manual where every note looks the same is one where the important note
 * gets skipped.
 */
async function Note({
  label,
  tone = "plain",
  children,
}: {
  label: string;
  tone?: "plain" | "care" | "stop";
  children: React.ReactNode;
}) {
  const uiText = await textForRequest();
  const colour =
    tone === "stop" ? "var(--red)" : tone === "care" ? "var(--amber)" : "var(--border-strong)";

  return (
    <div
      className="my-4 pl-4 py-1 text-sm"
      style={{ borderLeft: `2px solid ${colour}` }}
    >
      <div
        className="text-[10px] uppercase tracking-wider mb-1"
        style={{ color: tone === "plain" ? "var(--muted)" : colour }}
      >
        {uiText(label ?? "")}
      </div>
      <div className="text-[var(--muted)] space-y-2">{children}</div>
    </div>
  );
}

async function Entry({
  id,
  title,
  where,
  children,
}: {
  id: string;
  title: string;
  where: React.ReactNode;
  children: React.ReactNode;
}) {
  const uiText = await textForRequest();
  return (
    <section id={id} className="scroll-mt-6">
      <h3 className="text-sm font-medium mb-1">{uiText(title ?? "")}</h3>
      <Where>{where}</Where>
      <div className="text-sm text-[var(--muted)] space-y-3">{children}</div>
    </section>
  );
}

/** A part of the manual, with the divider the sidebar's own grouping implies. */
async function Part({
  eyebrow,
  title,
  lede,
  accent,
  children,
}: {
  eyebrow: string;
  title: string;
  lede: string;
  accent: string;
  children: React.ReactNode;
}) {
  const uiText = await textForRequest();
  return (
    <div className="space-y-6">
      <div className="pt-2">
        <div
          className="text-[10px] uppercase tracking-wider mb-2"
          style={{ color: accent }}
        >
          {uiText(eyebrow ?? "")}
        </div>
        <h2 className="text-lg font-semibold">{uiText(title ?? "")}</h2>
        <p className="text-xs text-[var(--muted)] mt-1 max-w-2xl">{uiText(lede ?? "")}</p>
      </div>
      {/* PanelFrame without a title: the h2 above already names this part, and
          the individual entries keep their own h3 so the manual's heading
          structure and its contents anchors survive folding. */}
      <PanelFrame essential persistKey={`manual:${title}`} className="card p-5" contentClassName="space-y-8">
        {children}
      </PanelFrame>
    </div>
  );
}

const CONTENTS = [
  {
    label: "Start here",
    items: [
      ["principle", "The one principle"],
      ["setup", "Setting up, in order"],
      ["dashboard", "Dashboard"],
    ],
  },
  {
    label: "1 · Managing money",
    items: [
      ["accounts", "Accounts"],
      ["cash-flow", "Cash Flow"],
      ["budgets", "Budgets"],
      ["buckets", "Buckets"],
      ["subscriptions", "Subscriptions"],
      ["interest", "Interest received"],
      ["analytics", "Analytics"],
    ],
  },
  {
    label: "2 · Investing",
    items: [
      ["connections", "Connections"],
      ["holdings", "Holdings"],
      ["positions", "Open positions"],
      ["analysis", "Analysis"],
      ["history", "Trade history"],
      ["playlists", "Playlists"],
      ["watchlist", "Watchlist"],
      ["dividends", "Dividends"],
      ["import", "Importing statements"],
    ],
  },
  {
    label: "The rest",
    items: [
      ["settings", "Settings"],
      ["library", "Library"],
      ["phone", "On your phone"],
      ["wont", "What it deliberately won't do"],
    ],
  },
];

export default async function ManualPage() {
  const uiText = await textForRequest();
  return (
    <div className="space-y-8 max-w-4xl">
      <div>
        <h1 className="text-lg font-semibold">{uiText("Manual")}</h1>
        <p className="text-xs text-[var(--muted)] mt-1 max-w-2xl">{uiText("What every screen is for, and the handful of things that will catch you out. Split the way the sidebar splits: money whose value holds still, then money the market can move.")}</p>
      </div>

      {/* ---- The principle, first, because it explains half the behaviour ---- */}
      <div
        className="card p-5"
        style={{ borderLeftWidth: 2, borderLeftColor: "var(--accent)" }}
        id="principle"
      >
        <div className="text-sm font-medium mb-2">{uiText("Zero is not a measurement")}</div>
        <p className="text-sm text-[var(--muted)]">{uiText("When this app doesn't know something, it says so — ")}<em>{uiText("unpriced")}</em>,{" "}
          <em>{uiText("no cost basis")}</em>, <em>{uiText("not priced")}</em>, <em>{uiText("approximate")}</em>{uiText(". It never writes ")}<span className="font-mono">0.00</span>{uiText(" to fill a gap. A number on screen has something behind it; an absence means nobody measured. That single rule explains most of what looks unusual here.")}</p>
      </div>

      {/* ---- Contents ---- */}
      <Section title="Contents" defaultOpen essential persistKey="manual:contents">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-5">
          {CONTENTS.map((group) => (
            <div key={group.label}>
              <div className="text-[10px] uppercase tracking-wider text-[var(--muted)] mb-2">
                {uiText(group.label ?? "")}
              </div>
              <ul className="space-y-1">
                {group.items.map(([id, label]) => (
                  <li key={id}>
                    <a
                      href={`#${id}`}
                      className="text-xs hover:underline"
                      style={{ color: "var(--accent)" }}
                    >
                      {uiText(label ?? "")}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Section>

      {/* ---- Getting started ---- */}
      <Section title="Getting started" defaultOpen essential persistKey="manual:getting-started" contentClassName="space-y-8">
        <Entry id="setup" title={uiText("Setting up, in order")} where="The order matters — each step needs the one before it">
          <ol className="list-decimal pl-5 space-y-2">
            <li>
              <strong className="text-[var(--foreground)]">{uiText("Set your base currency")}</strong>{uiText(" in Settings. Every total on every page is shown in it, and everything else is converted before being added.")}</li>
            <li>
              <strong className="text-[var(--foreground)]">{uiText("Create your accounts")}</strong>{uiText(" — one per place you keep money. This is where mistakes are most costly; read ")}<a href="#accounts" style={{ color: "var(--accent)" }}>{uiText("Accounts")}</a>{uiText(" first.")}</li>
            <li>
              <strong className="text-[var(--foreground)]">{uiText("Connect the platforms that have an API")}</strong>{uiText(", under Investments → Connections. Saves updating balances by hand.")}</li>
            <li>
              <strong className="text-[var(--foreground)]">{uiText("Record a month of transactions")}</strong>{uiText(" in Cash Flow, or import a statement. Without this, half the app has nothing to show.")}</li>
            <li>
              <strong className="text-[var(--foreground)]">{uiText("Set budgets and buckets")}</strong>{uiText(" once real data is in, not before. Budgeting against a real month is far easier than guessing.")}</li>
          </ol>
        </Entry>

        <Entry id="dashboard" title={uiText("Dashboard")} where="Sidebar → Dashboard">
          <p>{uiText("Your net worth, split into the two halves this app never mixes: the part that is guaranteed and the part the market can move. Alongside it, the shape of the month — how much is already committed before you do anything.")}</p>
        </Entry>
      </Section>

      {/* ============ PART 1 ============ */}
      <Part
        eyebrow="Part 1 — guaranteed"
        title={uiText("Managing money")}
        lede="Accounts, movements, budgets and goals. This half is money whose value doesn't change while you sleep: a thousand euros in the bank is a thousand euros tomorrow."
        accent="var(--green)"
      >
        <Entry id="accounts" title={uiText("Accounts")} where="Sidebar → Money → Accounts">
          <p>{uiText("An account is a place you keep money. The balance you enter is what is there today.")}</p>

          <p className="text-[var(--foreground)] font-medium">{uiText("The field that matters most in the whole app")}</p>
          <p>{uiText("When you create an account it asks ")}<em>{uiText("what does that balance mean?")}</em>{uiText(" There are three answers, and the wrong one corrupts your net worth.")}</p>

          <div className="overflow-x-auto">
            <div className="table-scroll" role="region" aria-label={uiText("Scrollable data table")} tabIndex={0}><ResponsiveTable className="data-table" style={{ minWidth: 560 }}>
              <colgroup>
                <col style={{ width: "22%" }} />
                <col style={{ width: "40%" }} />
                <col style={{ width: "38%" }} />
              </colgroup>
              <thead>
                <tr>
                  <th>{uiText("Choose")}</th>
                  <th>{uiText("When")}</th>
                  <th>{uiText("What the app does")}</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>{uiText("Cash sitting idle")}</td>
                  <td>{uiText("A current account, or a broker where the balance is only uninvested cash")}</td>
                  <td>{uiText("Positions you record are ")}<strong>{uiText("added on top")}</strong>{uiText(" of the balance")}</td>
                </tr>
                <tr>
                  <td>{uiText("Total value, positions included")}</td>
                  <td>{uiText("The balance is the whole account as the broker shows it")}</td>
                  <td>{uiText("Positions are detail only and ")}<strong>{uiText("never added again")}</strong></td>
                </tr>
                <tr>
                  <td>{uiText("Both")}</td>
                  <td>{uiText("One account that is bank and broker at once — Trade Republic")}</td>
                  <td>{uiText("Enter the total, then say how much is invested; the rest is cash")}</td>
                </tr>
              </tbody>
            </ResponsiveTable></div>
          </div>

          <Note label={uiText("If you get this wrong")} tone="stop">
            <p>{uiText("The same money is counted twice and your net worth is overstated, with nothing on screen to warn you. It is the most repeated mistake in this app, and the reason the question is asked at all.")}</p>
          </Note>

          <p className="text-[var(--foreground)] font-medium">{uiText("What else an account holds")}</p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong className="text-[var(--foreground)]">{uiText("Annual rate")}</strong>{uiText(" — if the account pays interest, so the app can work out what you should have received rather than only recording what you did.")}</li>
            <li><strong className="text-[var(--foreground)]">{uiText("Day count")}</strong>{uiText(" — 365 or 360. Not cosmetic: 360 pays about 1.4% more for the same rate.")}</li>
            <li><strong className="text-[var(--foreground)]">{uiText("Withholding")}</strong>{uiText(" — tax taken at source on interest. Your figure; the app assumes nobody's tax.")}</li>
            <li><strong className="text-[var(--foreground)]">{uiText("Investing cash %")}</strong>{uiText(" — cash waiting in a broker isn't the same as cash in your current account, even though both are &ldquo;free&rdquo;.")}</li>
          </ul>
        </Entry>

        <Entry id="cash-flow" title={uiText("Cash Flow")} where="Sidebar → Money → Cash Flow">
          <p>{uiText("Everything in and out. Each transaction carries a date, an amount, an account, a category and — importantly — ")}<strong className="text-[var(--foreground)]">{uiText("its own currency")}</strong>.
          </p>
          <p>{uiText("Enter them by hand or import a CSV from your bank. The import detects duplicate rows before saving, so importing the same file twice doesn't double anything.")}</p>
          <p>
            <strong className="text-[var(--foreground)]">{uiText("Transfers")}</strong>{uiText(" between your own accounts are a special case: they have two legs, and the app links them so it doesn't look like you spent in one place and earned in another.")}</p>
        </Entry>

        <Entry id="budgets" title={uiText("Budgets")} where="Sidebar → Money → Budgets">
          <p>{uiText("A spending limit per category, per period. It answers one question: how much of this have I spent, and how much is left.")}</p>
          <p>{uiText("Categories are marked ")}<strong className="text-[var(--foreground)]">{uiText("fixed")}</strong>{uiText(" or")}{" "}
            <strong className="text-[var(--foreground)]">{uiText("variable")}</strong>{uiText(". Rent and salary are fixed; groceries and freelance work are not. It is set on the category rather than per transaction, so it needs deciding once.")}</p>
          <Note label={uiText("Why there are no income budgets")}>
            <p>{uiText("A budget for what comes in is a wish list. You can control what you spend; you cannot decide to be paid 500 more.")}</p>
          </Note>
        </Entry>

        <Entry id="buckets" title={uiText("Buckets")} where="Sidebar → Money → Buckets">
          <p>{uiText("Money with a purpose — an emergency fund, a holiday, a deposit. A bucket is not an account; it is a label over money that already exists somewhere.")}</p>
          <p>{uiText("Each bucket has a ")}<strong className="text-[var(--foreground)]">{uiText("priority")}</strong>{uiText(", and that is what makes it more than a list: when you distribute money, the emergency fund fills before the holiday fund.")}</p>
          <p>{uiText("A bucket can hold cash and investments at once. The")}{" "}
            <span className="font-mono text-xs">{uiText("Unrealized P&L")}</span>{uiText(" column shows the gain on the invested part — ")}<strong className="text-[var(--foreground)]">{uiText("on paper")}</strong>{uiText(", which a price move can take back. It does not bring you closer to the goal the way realised money does.")}</p>
        </Entry>

        <Entry id="subscriptions" title={uiText("Subscriptions")} where="Sidebar → Money → Subscriptions">
          <p>{uiText("What repeats: streaming, the gym, insurance. Tells you how much is already committed before you do anything else.")}</p>
          <p>{uiText("Give a subscription its charge date and, on that day, it appears under")}{" "}
            <strong className="text-[var(--foreground)]">{uiText("Subscription charges to confirm")}</strong>{uiText(" — at the top of the dashboard and of this page. Choose ")}<em>{uiText("Record expense")}</em>{uiText(" to add it (change the account, amount or date first if needed), ")}<em>{uiText("Yes, that's it")}</em>{uiText(" when an expense already in your records is this charge, or ")}<em>{uiText("Skip this charge")}</em>{uiText(" when it did not happen. Charges from the last month are offered; older ones are not.")}</p>
          <Note label={uiText("Why it asks instead of adding")} tone="care">
            <p>{uiText("The same charge usually arrives another way too — a statement import, a connector, a quick entry. Adding it automatically would count it twice when that happened, and an invented transaction in a financial record is worse than a missing one. So nothing is added until you choose, and each charge can only be answered once.")}</p>
          </Note>
        </Entry>

        <Entry id="interest" title={uiText("Interest received")} where="Accounts → Interest received tab">
          <p>{uiText("Records the interest your accounts actually paid, against what the rate you set says they should have. It exists to catch a bank paying less than it promised — which is only visible if somebody does the arithmetic.")}</p>
        </Entry>

        <Entry id="analytics" title={uiText("Analytics and Trends")} where="Sidebar → Analytics · four tabs">
          <p>
            <strong className="text-[var(--foreground)]">{uiText("Overview")}</strong>{uiText(" shows where your money is, by place, and what it is for, by purpose.")}</p>
          <p>
            <strong className="text-[var(--foreground)]">{uiText("Where it goes")}</strong>{uiText(" shows spending. Choose a period, then open Filters for accounts, categories, merchants or custom dates.")}</p>
          <p>
            <strong className="text-[var(--foreground)]">{uiText("Trends & projections")}</strong>{uiText(" has two views. Your progress explains recorded cash flow and changes in net worth. Average monthly spending and surplus use up to three recorded months, with the period shown beside them. Future scenarios lets you choose monthly saving, a time horizon and an assumed return. These examples do not change your records or predict actual returns.")}</p>
          <p>
            <strong className="text-[var(--foreground)]">{uiText("When is it enough?")}</strong>{uiText(", in Future scenarios, is a financial-independence plan: the money that could pay for your life (a year of spending ÷ the share you would spend each year, 4% by default — about 25 times it) and when your net worth gets there at your average saving and an assumed return after inflation. It is filled from your own figures, every one editable, and says how much sooner €100 more saved or €100 less spent a month would make it. Nothing is saved, and it is arithmetic on assumptions, not advice.")}</p>
          <p>
            <strong className="text-[var(--foreground)]">{uiText("Reports")}</strong>{uiText(" read one week, month, year or any range of days back as a whole. Pick ")}<em>{uiText("Week")}</em>, <em>{uiText("Month")}</em>, <em>{uiText("Year")}</em>{uiText(" or")}{" "}
            <em>{uiText("Custom")}</em>{uiText(" at the top — a custom range takes a first and a last day and is compared with the same number of days just before it — and choose whether it covers your money, your investments or both; weeks run Monday to Sunday. The money part is income, spending, net and savings rate against the period before, spending by category with the change, fixed against variable, the budgets of that length, the largest expenses and net worth drawn through the period; a year, and a range across several months, also lists each month. The investments part is the portfolio's value at both ends and through the period, money deposited and withdrawn, what was bought and sold, what trades realised and cost in fees, dividends and interest, the time-weighted and money-weighted return against your chosen index, and what was held at the end — today's positions with their gains, or, for a period that has closed, the positions on its last day as recorded then (no gain is stated for a past day: what they cost then is not on record). ")}<em>{uiText("Download CSV")}</em>{uiText(" saves it for a spreadsheet;")}{" "}
            <em>{uiText("Download PDF")}</em>{uiText(" saves a file the app draws itself, charts included, the same on the computer and on the phone (there, to Downloads). Both hold the figures on the screen. A return the history cannot support is left out with the reason, as on the Investments page; transfers and money moved into investments are never counted as spending, and a period with no income shows no savings rate rather than 0%.")}</p>
        </Entry>
      </Part>

      {/* ============ PART 2 ============ */}
      <Part
        eyebrow="Part 2 — not guaranteed"
        title={uiText("Investing")}
        lede="The sidebar calls this section Not guaranteed, and it means it literally. Here values move on their own, and the app is far more careful about telling you where each number came from."
        accent="var(--amber)"
      >
        <Entry id="connections" title={uiText("Connections")} where="Investments → Connections tab">
          <p>{uiText("Connecting a platform keeps its balances and positions up to date on their own. Everything is")}{" "}
            <strong className="text-[var(--foreground)]">{uiText("read-only")}</strong>{uiText(": the app has no code capable of placing an order.")}</p>

          <div className="overflow-x-auto">
            <div className="table-scroll" role="region" aria-label={uiText("Scrollable data table")} tabIndex={0}><ResponsiveTable className="data-table" style={{ minWidth: 560 }}>
              <colgroup>
                <col style={{ width: "20%" }} />
                <col style={{ width: "34%" }} />
                <col style={{ width: "46%" }} />
              </colgroup>
              <thead>
                <tr>
                  <th>{uiText("Platform")}</th>
                  <th>{uiText("What it needs")}</th>
                  <th>{uiText("Worth knowing")}</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Hyperliquid</td>
                  <td>{uiText("Your public wallet address")}</td>
                  <td>{uiText("No keys, no secrets. Brings trade history too.")}</td>
                </tr>
                <tr>
                  <td>Trading 212</td>
                  <td>{uiText("API key (Settings → API)")}</td>
                  <td>{uiText("Generate it with order permissions switched off.")}</td>
                </tr>
                <tr>
                  <td>Bybit</td>
                  <td>{uiText("Read-only API key and secret")}</td>
                  <td>{uiText("bybit.com only. bybit.eu cannot be connected — their restriction.")}</td>
                </tr>
                <tr>
                  <td>Interactive Brokers</td>
                  <td>{uiText("A gateway running on your computer")}</td>
                  <td>{uiText("Needs an IBKR Pro account. The session expires and needs a new login.")}</td>
                </tr>
                <tr>
                  <td>Trade Republic</td>
                  <td>{uiText("CSV import")}</td>
                  <td>{uiText("No public API. See ")}<a href="#import" style={{ color: "var(--accent)" }}>{uiText("Importing statements")}</a>.</td>
                </tr>
              </tbody>
            </ResponsiveTable></div>
          </div>

          <Note label={uiText("Secrets")}>
            <p>{uiText("API secrets are encrypted before being stored and never shown again. They need ")}<span className="font-mono text-xs">{uiText("ENCRYPTION_KEY")}</span>{uiText(" configured — change it and those connections stop working, with no way back.")}</p>
            <p>{uiText("The key lives only on your own computer. A copy running on a hosting service shares the database but not the key, so it shows what was last synced and cannot open a single secret — those connections sync at home.")}</p>
          </Note>
        </Entry>

        <Entry id="holdings" title={uiText("Holdings")} where="Sidebar → Investments">
          <p>{uiText("Everything you hold, from wherever it came: synced, imported from a statement, or entered by hand. Five figures across the top.")}</p>

          <div className="overflow-x-auto">
            <div className="table-scroll" role="region" aria-label={uiText("Scrollable data table")} tabIndex={0}><ResponsiveTable className="data-table">
              <tbody>
                <tr><td className="whitespace-nowrap">{uiText("Portfolio Value")}</td><td>{uiText("Everything, at the capital you actually committed")}</td></tr>
                <tr><td className="whitespace-nowrap">{uiText("Unrealized P&L")}</td><td>{uiText("Profit ")}<strong>{uiText("on paper")}</strong>{uiText(", measured against cost")}</td></tr>
                <tr><td className="whitespace-nowrap">{uiText("Market-exposed")}</td><td>{uiText("The part whose price can move")}</td></tr>
                <tr><td className="whitespace-nowrap">{uiText("Cash & stablecoins")}</td><td>{uiText("The part whose price cannot")}</td></tr>
                <tr><td className="whitespace-nowrap">{uiText("Realized P&L")}</td><td>{uiText("Money that ")}<strong>{uiText("arrived")}</strong>{uiText(": closed sales, dividends, interest")}</td></tr>
              </tbody>
            </ResponsiveTable></div>
          </div>

          <p>{uiText("The middle two always add up to the first. The note under each says what it is made of, so you can check it.")}</p>

          <p className="text-[var(--foreground)] font-medium">{uiText("The table")}</p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong className="text-[var(--foreground)]">{uiText("Columns")}</strong>{uiText(" — pick which ones to show; remembered on this device. ")}<em>{uiText("Name")}</em>{uiText(" is the shortened instrument name, ")}<em>{uiText("Symbol")}</em>{uiText(" is what the broker wrote, in full.")}</li>
            <li><strong className="text-[var(--foreground)]">{uiText("Drag a column edge")}</strong>{uiText(" to resize it.")}</li>
            <li><strong className="text-[var(--foreground)]">{uiText("in balance")}</strong>{uiText(" — that money is already inside an account balance. Shown, never added on top.")}</li>
            <li><strong className="text-[var(--foreground)]">{uiText("at cost")}</strong>{uiText(" — the value shown is what you paid, not what it is worth today. The app will not invent a market price it does not have.")}</li>
          </ul>
        </Entry>

        <Entry id="positions" title={uiText("Open positions")} where="Investments → Open positions tab">
          <p>{uiText("What is synced from the platforms, live. This is where you")}{" "}
            <strong className="text-[var(--foreground)]">{uiText("tag")}</strong>{uiText(" each position and each spot balance: asset type, risk, horizon, liquidity, playlist, and the annual rate where the asset earns one.")}</p>
          <p>{uiText("That rate field is named after the income the type actually has —")}{" "}
            <em>{uiText("Dividend yield")}</em>{uiText(" on a stock, ")}<em>{uiText("Interest rate")}</em>{uiText(" on cash,")}{" "}
            <em>{uiText("Staking APR")}</em>{uiText(" on staking, ")}<em>{uiText("Coupon rate")}</em>{uiText(" on a bond. For types with no published annual rate the field disappears rather than inviting you to guess one.")}</p>
          <p>{uiText("The four cards at the top always reconcile:")}{" "}
            <strong className="text-[var(--foreground)]">{uiText("free + margin in use = account value")}</strong>.
          </p>
        </Entry>

        <Entry id="analysis" title={uiText("Analysis")} where="Investments → Analysis tab">
          <p>{uiText("The whole portfolio broken down by asset type, risk, horizon, liquidity, account and playlist, plus biggest gains and losses — always ")}<strong className="text-[var(--foreground)]">{uiText("unrealised")}</strong>{uiText(", and the page says so.")}</p>
          <p>{uiText("The ")}<span className="font-mono text-xs">{uiText("Cash & stablecoins")}</span>{uiText(" button hides idle money. Worth using: cash cannot lose value to the market, so it flattens every risk breakdown it sits in. Switched off, you see only what is actually exposed.")}</p>
          <p>
            <strong className="text-[var(--foreground)]">{uiText("Sectors, countries and regions")}</strong>{" "}{uiText("splits the stocks and ETFs you hold (positions typed Stocks or ETF) by what they are exposed to. Press ")}<em>{uiText("Look up sectors & countries")}</em>{uiText(": it asks Yahoo Finance about each listing — only the listing, nothing about your money — and keeps the answer for a month. A company counts once, by its sector and head office; a fund is spread by the sector weights its provider reports. Yahoo does not report where a fund's companies are, so a fund stays ")}<em>{uiText("Unclassified")}</em>{uiText(" by country and region instead of being guessed. Crypto, cash and other assets are left out and the page says how much. Open")}<em>{uiText(" What each position was matched to")}</em>{uiText(" to check the matches; a wrong one can be forgotten.")}</p>
          <p>
            <strong className="text-[var(--foreground)]">{uiText("Inside your ETFs")}</strong>{uiText(" adds what your funds hold of each company to the shares you own directly — Apple through three ETFs and Apple bought in Frankfurt become one row. Only a fund's largest holdings are reported (usually ten); the page says how much of your funds that covers, and the rest is not spread over companies by guess, so a real total can be higher than shown.")}</p>
          <p>
            <strong className="text-[var(--foreground)]">{uiText("What investing costs")}</strong>{uiText(" shows what your funds take each year — what you hold × the TER the provider reports, a cost that never appears on a statement because it is taken inside the fund's price — and the fees you paid by year: on each buy and sell (the same figure Trade history charts) and fee movements such as custody. A fund whose TER is not reported is listed as unknown, never counted as free.")}</p>
        </Entry>

        <Entry id="history" title={uiText("Trade history")} where="Investments → Trade history tab">
          <p>{uiText("What you ")}<em>{uiText("did")}</em>{uiText(", as opposed to what you hold. Fills itself from platforms that report movements, and by statement import for those that don't.")}</p>

          <div className="overflow-x-auto">
            <div className="table-scroll" role="region" aria-label={uiText("Scrollable data table")} tabIndex={0}><ResponsiveTable className="data-table">
              <tbody>
                <tr><td className="whitespace-nowrap">{uiText("Realised result over time")}</td><td>{uiText("What closed trades made, what fees cost, and what is left")}</td></tr>
                <tr><td className="whitespace-nowrap">{uiText("Result by instrument")}</td><td>{uiText("Ranked on net — after fees")}</td></tr>
                <tr><td className="whitespace-nowrap">{uiText("How often you trade")}</td><td>{uiText("Trades per month, and the hour of day they land")}</td></tr>
                <tr><td className="whitespace-nowrap">{uiText("How long you hold")}</td><td>{uiText("Winners against losers, as medians")}</td></tr>
              </tbody>
            </ResponsiveTable></div>
          </div>

          <Note label={uiText("Read the fees line")} tone="care">
            <p>{uiText("Fees are never folded into the result, deliberately. On a small account they routinely exceed what the trading made — only the")}{" "}
              <em>{uiText("Net")}</em>{uiText(" line tells you whether it was worth doing.")}</p>
          </Note>

          <p>{uiText("Hours are shown in ")}<strong className="text-[var(--foreground)]">UTC</strong>{uiText(". The app has no reliable way to know where you were when you placed each order, and a chart labelled with the wrong hours would be read as fact.")}</p>
        </Entry>

        <Entry id="playlists" title={uiText("Playlists")} where="Investments → Playlists tab">
          <p>{uiText("Groups of positions by purpose — retirement, speculation, long term. Answers which group is actually working, instead of treating the portfolio as one block.")}</p>
          <p>{uiText("Counts manual and synced positions alike. A leveraged position contributes what it actually ties up, not its notional value.")}</p>
        </Entry>

        <Entry id="watchlist" title={uiText("Watchlist")} where="Investments → Watchlist tab">
          <p>{uiText("Things you don't hold but are following, with the price at which they would interest you.")}</p>
        </Entry>

        <Entry id="valued-by-hand" title={uiText("Things valued by hand")} where="Investments → Add position">
          <p>{uiText("A flat, a painting, a watch, a car or shares in a private company have no market price. Add them as a position with the type ")}<em>{uiText("Real estate")}</em>, <em>{uiText("Art")}</em>,{" "}
            <em>{uiText("Collectibles")}</em>, <em>{uiText("Vehicles")}</em>{uiText(" or ")}<em>{uiText("Startups & private companies")}</em>{uiText(": quantity 1 with what you paid and what it is worth now (for startup shares, the number of shares and the last round's price). The value counts in your net worth, dated the day you entered it.")}</p>
          <p>{uiText("Because nothing updates it, the app keeps track of its age: the position's page says when it was last valued, and the bell (and the phone, if alerts are on) asks you to look again after a year for property, art and collectibles, and after six months for cars, which lose value, and startups, which are worth what the last round said. Enter the new value under ")}<em>{uiText("Update value")}</em>.
          </p>
        </Entry>

        <Entry id="dividends" title={uiText("Dividends")} where="Investments → Dividends tab">
          <p>{uiText("What your instruments paid, by holding and by year, with the yield against current value. ")}<strong className="text-[var(--foreground)]">{uiText("Interest on cash")}</strong>{uiText(" is kept apart from distributions: both are income, but only one says anything about what a holding yields.")}</p>
          <p>
            <strong className="text-[var(--foreground)]">{uiText("Expected next")}</strong>{uiText(" shows, per instrument, the date the company has ")}<em>{uiText("announced")}</em>{uiText(" — the payment day, or the ex-dividend day until the payment day is out — or, without one, an ")}<em>{uiText("estimate")}</em>{" "}{uiText("from the rhythm of your own payments; each line says which. Press")}{" "}
            <em>{uiText("Check announced dates")}</em>{uiText(" to read them (Yahoo Finance; funds rarely publish dates). ")}<strong className="text-[var(--foreground)]">{uiText("The next twelve months")}</strong>{" "}{uiText("is what the positions you still hold paid over the last twelve — not a promise, and positions sold since are left out.")}</p>
        </Entry>

        <Entry id="import" title={uiText("Importing statements")} where="From the page whose data the statement changes">
          <p>{uiText("For brokers with no API — Trade Republic being the case — importing the official statement is the route. The app takes CSV and detects files and rows already imported before saving.")}</p>
          <p>{uiText("It also keeps a")}{" "}
            <strong className="text-[var(--foreground)]">{uiText("record of what the file contained")}</strong>{uiText(": a fingerprint of the file and its sums. That exists because a statement put through a conversion tool can lose a row silently, and you cannot see the transaction that isn't there.")}</p>
          <p>{uiText("An import can be ")}<strong className="text-[var(--foreground)]">{uiText("undone as a whole")}</strong>{uiText(", which makes it safe to try.")}</p>
        </Entry>
      </Part>

      {/* ============ THE REST ============ */}
      <Section title="Settings and the rest" defaultOpen essential persistKey="manual:the-rest" contentClassName="space-y-8">
        <Entry id="settings" title={uiText("Settings")} where="Sidebar, at the bottom → Settings">
          <ul className="list-disc pl-5 space-y-1">
            <li><strong className="text-[var(--foreground)]">{uiText("Base currency")}</strong>{uiText(" — the currency of every total. Change it and the whole app reconverts.")}</li>
            <li><strong className="text-[var(--foreground)]">{uiText("Favourite currencies")}</strong>{uiText(" — the ones offered first in forms.")}</li>
            <li><strong className="text-[var(--foreground)]">{uiText("Dashboard currency")}</strong>{uiText(" — view the summary in another currency without changing the base.")}</li>
            <li><strong className="text-[var(--foreground)]">{uiText("Appearance")}</strong>{uiText(" — several themes, each with a light and a dark variant.")}</li>
            <li><strong className="text-[var(--foreground)]">{uiText("Categories")}</strong>{uiText(" — create, merge, and mark as fixed or variable.")}</li>
            <li><strong className="text-[var(--foreground)]">{uiText("Exchange rates")}</strong>{uiText(" — inspect them and force a refresh.")}</li>
            <li><strong className="text-[var(--foreground)]">{uiText("Data")}</strong>{uiText(" — backup and restore. The backup contains everything the app stores.")}</li>
          </ul>
          <Note label={uiText("Privacy mode")}>
            <p>{uiText("A switch hides every figure. Useful for showing someone the app without showing them what you have.")}</p>
          </Note>
        </Entry>

        <Entry id="library" title={uiText("Library")} where="Sidebar → Learning → Library">
          <p>{uiText("Books and courses, with reading progress. Nothing to do with your accounts — it is here because learning about money and managing money belong together.")}</p>
        </Entry>

        <Entry id="phone" title={uiText("On your phone")} where="The Money OS Android app, on the same Wi-Fi as the computer">
          <p>{uiText("The phone shows this same site, with every feature. It reaches it on the computer that runs Money OS, so the two have to be on the same Wi-Fi and the site has to be running there. Each page opens with only what it is for — the charts, audits and forms around it are one tap away, and what you open stays open on that phone.")}</p>
          <p>{uiText("To record an expense without opening the app first: add the")}{" "}
            <strong className="text-[var(--foreground)]">{uiText("Money OS widget")}</strong>{uiText(" to the home screen (Despesa / Receita), touch and hold the app icon for the same two shortcuts, or switch on the quick entry notification in Settings. Each opens the app straight on the quick entry form; nothing is saved until you press Save there, so the form's undo and duplicate protection still apply.")}</p>
          <p>{uiText("More widgets show figures: ")}<strong className="text-[var(--foreground)]">Money OS</strong>{" "}{uiText("(net worth and this month), ")}<strong className="text-[var(--foreground)]">{uiText("Net worth")}</strong>{" "}{uiText("over time, ")}<strong className="text-[var(--foreground)]">{uiText("Where the money is")}</strong>,{" "}
            <strong className="text-[var(--foreground)]">{uiText("Cash flow")}</strong>{uiText(" and")}{" "}
            <strong className="text-[var(--foreground)]">{uiText("Investments")}</strong>{uiText(" (portfolio value, unrealized P&L, and every position in a list you can scroll, each with its P&L in euros and percent), and for investing")}{" "}
            <strong className="text-[var(--foreground)]">{uiText("Allocation")}</strong>,{" "}
            <strong className="text-[var(--foreground)]">{uiText("Winners & losers")}</strong>,{" "}
            <strong className="text-[var(--foreground)]">{uiText("Dividends")}</strong>{uiText(" and")}{" "}
            <strong className="text-[var(--foreground)]">{uiText("Open trades")}</strong>{uiText(". They refresh about every half hour, when you leave the app and when you tap ↻, and always say when their figures were read — away from home they show the last ones. In the quick settings panel, beside the torch and Wi-Fi, you can add ")}<em>{uiText("Record expense")}</em>{uiText(" and ")}<em>{uiText("Net worth")}</em>{uiText("; the net worth tile stays hidden while the phone is locked.")}</p>
          <p>
            <strong className="text-[var(--foreground)]">{uiText("Alerts on the phone.")}</strong>{uiText(" In Settings, inside the app, switch on ")}<em>{uiText("Alert notifications")}</em>{uiText(" and what the bell would show you arrives as a notification: a budget over or running ahead, a subscription about to charge or waiting to be confirmed, a manual balance not updated in two months, a connection that stopped syncing, a watchlist price reached. Each alert once; one that goes away and comes back is news again. The site decides what is worth saying — the phone only asks, about every half hour, and hears nothing while it cannot reach this computer. The lock screen shows only that something is waiting, not the figures.")}</p>
          <Note label={uiText("Plain http at home")} tone="care">
            <p>{uiText("On your home network the connection is not encrypted: anyone on the same Wi-Fi who tried could read it, including your password as you sign in. Fine at home; don't use it on a shared network.")}</p>
          </Note>
        </Entry>

        <Entry id="wont" title={uiText("What it deliberately won't do")} where="Settled decisions, recorded so they aren't re-argued">
          <ul className="list-disc pl-5 space-y-1">
            <li><strong className="text-[var(--foreground)]">{uiText("No advice.")}</strong>{uiText(" No recommendations, no signals. It shows what you hold and what you did.")}</li>
            <li><strong className="text-[var(--foreground)]">{uiText("No orders.")}</strong>{uiText(" Every connector is read-only by architecture — the capability is not in the code.")}</li>
            <li><strong className="text-[var(--foreground)]">{uiText("No Trade Republic login.")}</strong>{uiText(" The only route is an unofficial client using a phone number and PIN, which would make it the one connection able to move your money.")}</li>
            <li><strong className="text-[var(--foreground)]">{uiText("No blocking negative balances.")}</strong>{uiText(" Credit cards and margin can legitimately go negative; forbidding it would model reality badly.")}</li>
            <li><strong className="text-[var(--foreground)]">{uiText("No Open Banking.")}</strong>{uiText(" It needs a licence.")}</li>
          </ul>
          <Note label={uiText("Not built yet")} tone="care">
            <p>{uiText("Alerts by email — on the phone they arrive as notifications, only while it can reach the computer. Recurring transactions created without asking — subscriptions propose theirs instead. Bonds modelled properly, with coupon and maturity. Attaching receipts.")}</p>
          </Note>
        </Entry>
      </Section>

      {/*
        AGPL-3.0 §13: anyone interacting with this over a network must be able
        to get the source. On a private single-user instance the operator and
        the user are the same person, so this changes nothing — but it is what
        makes the licence easy to honour for anyone who runs a copy for someone
        else, and it costs one line.
      */}
      <Section title="Your data, your copy" persistKey="manual:your-data" className="text-xs text-[var(--muted)]">
        <p>{uiText("This is your own instance. There is no shared database and no operator with access to it — nobody else can see these figures, including whoever wrote the app.")}</p>
        <p className="mt-2">{uiText("Money OS is free software under the")}{" "}
          <a
            href="https://www.gnu.org/licenses/agpl-3.0.html"
            target="_blank"
            rel="noreferrer"
            style={{ color: "var(--accent)" }}
          >{uiText("GNU AGPL-3.0")}</a>{uiText(". You may run, study and change it. If you modify it and offer it to other people over a network, you have to share your changes under the same licence.")}</p>
      </Section>

      <div className="text-xs text-[var(--muted)]">
        <Link href="/" style={{ color: "var(--accent)" }}>{uiText("Back to the dashboard")}</Link>
      </div>
    </div>
  );
}

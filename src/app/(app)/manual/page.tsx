import Link from "next/link";

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
function Note({
  label,
  tone = "plain",
  children,
}: {
  label: string;
  tone?: "plain" | "care" | "stop";
  children: React.ReactNode;
}) {
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
        {label}
      </div>
      <div className="text-[var(--muted)] space-y-2">{children}</div>
    </div>
  );
}

function Entry({
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
  return (
    <section id={id} className="scroll-mt-6">
      <h3 className="text-sm font-medium mb-1">{title}</h3>
      <Where>{where}</Where>
      <div className="text-sm text-[var(--muted)] space-y-3">{children}</div>
    </section>
  );
}

/** A part of the manual, with the divider the sidebar's own grouping implies. */
function Part({
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
  return (
    <div className="space-y-6">
      <div className="pt-2">
        <div
          className="text-[10px] uppercase tracking-wider mb-2"
          style={{ color: accent }}
        >
          {eyebrow}
        </div>
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-xs text-[var(--muted)] mt-1 max-w-2xl">{lede}</p>
      </div>
      <div className="card p-5 space-y-8">{children}</div>
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
      ["wont", "What it deliberately won't do"],
    ],
  },
];

export default function ManualPage() {
  return (
    <div className="space-y-8 max-w-4xl">
      <div>
        <h1 className="text-lg font-semibold">Manual</h1>
        <p className="text-xs text-[var(--muted)] mt-1 max-w-2xl">
          What every screen is for, and the handful of things that will catch you
          out. Split the way the sidebar splits: money whose value holds still,
          then money the market can move.
        </p>
      </div>

      {/* ---- The principle, first, because it explains half the behaviour ---- */}
      <div
        className="card p-5"
        style={{ borderLeftWidth: 2, borderLeftColor: "var(--accent)" }}
        id="principle"
      >
        <div className="text-sm font-medium mb-2">Zero is not a measurement</div>
        <p className="text-sm text-[var(--muted)]">
          When this app doesn&apos;t know something, it says so — <em>unpriced</em>,{" "}
          <em>no cost basis</em>, <em>not priced</em>, <em>approximate</em>. It
          never writes <span className="font-mono">0.00</span> to fill a gap.
          A number on screen has something behind it; an absence means nobody
          measured. That single rule explains most of what looks unusual here.
        </p>
      </div>

      {/* ---- Contents ---- */}
      <div className="card p-5">
        <div className="text-sm font-medium mb-4">Contents</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-5">
          {CONTENTS.map((group) => (
            <div key={group.label}>
              <div className="text-[10px] uppercase tracking-wider text-[var(--muted)] mb-2">
                {group.label}
              </div>
              <ul className="space-y-1">
                {group.items.map(([id, label]) => (
                  <li key={id}>
                    <a
                      href={`#${id}`}
                      className="text-xs hover:underline"
                      style={{ color: "var(--accent)" }}
                    >
                      {label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {/* ---- Getting started ---- */}
      <div className="card p-5 space-y-8">
        <Entry id="setup" title="Setting up, in order" where="The order matters — each step needs the one before it">
          <ol className="list-decimal pl-5 space-y-2">
            <li>
              <strong className="text-[var(--foreground)]">Set your base currency</strong> in
              Settings. Every total on every page is shown in it, and everything
              else is converted before being added.
            </li>
            <li>
              <strong className="text-[var(--foreground)]">Create your accounts</strong> — one
              per place you keep money. This is where mistakes are most costly;
              read <a href="#accounts" style={{ color: "var(--accent)" }}>Accounts</a> first.
            </li>
            <li>
              <strong className="text-[var(--foreground)]">Connect the platforms that have an
              API</strong>, under Investments → Connections. Saves updating
              balances by hand.
            </li>
            <li>
              <strong className="text-[var(--foreground)]">Record a month of transactions</strong> in
              Cash Flow, or import a statement. Without this, half the app has
              nothing to show.
            </li>
            <li>
              <strong className="text-[var(--foreground)]">Set budgets and buckets</strong> once
              real data is in, not before. Budgeting against a real month is far
              easier than guessing.
            </li>
          </ol>
        </Entry>

        <Entry id="dashboard" title="Dashboard" where="Sidebar → Dashboard">
          <p>
            Your net worth, split into the two halves this app never mixes: the
            part that is guaranteed and the part the market can move. Alongside
            it, the shape of the month — how much is already committed before you
            do anything.
          </p>
        </Entry>
      </div>

      {/* ============ PART 1 ============ */}
      <Part
        eyebrow="Part 1 — guaranteed"
        title="Managing money"
        lede="Accounts, movements, budgets and goals. This half is money whose value doesn't change while you sleep: a thousand euros in the bank is a thousand euros tomorrow."
        accent="var(--green)"
      >
        <Entry id="accounts" title="Accounts" where="Sidebar → Money → Accounts">
          <p>
            An account is a place you keep money. The balance you enter is what
            is there today.
          </p>

          <p className="text-[var(--foreground)] font-medium">
            The field that matters most in the whole app
          </p>
          <p>
            When you create an account it asks <em>what does that balance
            mean?</em> There are three answers, and the wrong one corrupts your
            net worth.
          </p>

          <div className="overflow-x-auto">
            <table className="data-table whitespace-nowrap">
              <thead>
                <tr>
                  <th>Choose</th>
                  <th>When</th>
                  <th className="whitespace-normal">What the app does</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Cash sitting idle</td>
                  <td>A current account, or a broker where the balance is only uninvested cash</td>
                  <td className="whitespace-normal">Positions you record are <strong>added on top</strong> of the balance</td>
                </tr>
                <tr>
                  <td>Total value, positions included</td>
                  <td>The balance is the whole account as the broker shows it</td>
                  <td className="whitespace-normal">Positions are detail only and <strong>never added again</strong></td>
                </tr>
                <tr>
                  <td>Both</td>
                  <td>One account that is bank and broker at once — Trade Republic</td>
                  <td className="whitespace-normal">Enter the total, then say how much is invested; the rest is cash</td>
                </tr>
              </tbody>
            </table>
          </div>

          <Note label="If you get this wrong" tone="stop">
            <p>
              The same money is counted twice and your net worth is overstated,
              with nothing on screen to warn you. It is the most repeated mistake
              in this app, and the reason the question is asked at all.
            </p>
          </Note>

          <p className="text-[var(--foreground)] font-medium">What else an account holds</p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong className="text-[var(--foreground)]">Annual rate</strong> — if the account pays interest, so the app can work out what you should have received rather than only recording what you did.</li>
            <li><strong className="text-[var(--foreground)]">Day count</strong> — 365 or 360. Not cosmetic: 360 pays about 1.4% more for the same rate.</li>
            <li><strong className="text-[var(--foreground)]">Withholding</strong> — tax taken at source on interest. Your figure; the app assumes nobody&apos;s tax.</li>
            <li><strong className="text-[var(--foreground)]">Investing cash %</strong> — cash waiting in a broker isn&apos;t the same as cash in your current account, even though both are &ldquo;free&rdquo;.</li>
          </ul>
        </Entry>

        <Entry id="cash-flow" title="Cash Flow" where="Sidebar → Money → Cash Flow">
          <p>
            Everything in and out. Each transaction carries a date, an amount, an
            account, a category and — importantly — <strong className="text-[var(--foreground)]">its own currency</strong>.
          </p>
          <p>
            Enter them by hand or import a CSV from your bank. The import detects
            duplicate rows before saving, so importing the same file twice
            doesn&apos;t double anything.
          </p>
          <p>
            <strong className="text-[var(--foreground)]">Transfers</strong> between your own
            accounts are a special case: they have two legs, and the app links
            them so it doesn&apos;t look like you spent in one place and earned in
            another.
          </p>
        </Entry>

        <Entry id="budgets" title="Budgets" where="Sidebar → Money → Budgets">
          <p>
            A spending limit per category, per period. It answers one question:
            how much of this have I spent, and how much is left.
          </p>
          <p>
            Categories are marked <strong className="text-[var(--foreground)]">fixed</strong> or{" "}
            <strong className="text-[var(--foreground)]">variable</strong>. Rent and salary are
            fixed; groceries and freelance work are not. It is set on the
            category rather than per transaction, so it needs deciding once.
          </p>
          <Note label="Why there are no income budgets">
            <p>
              A budget for what comes in is a wish list. You can control what you
              spend; you cannot decide to be paid 500 more.
            </p>
          </Note>
        </Entry>

        <Entry id="buckets" title="Buckets" where="Sidebar → Money → Buckets">
          <p>
            Money with a purpose — an emergency fund, a holiday, a deposit. A
            bucket is not an account; it is a label over money that already
            exists somewhere.
          </p>
          <p>
            Each bucket has a <strong className="text-[var(--foreground)]">priority</strong>, and
            that is what makes it more than a list: when you distribute money,
            the emergency fund fills before the holiday fund.
          </p>
          <p>
            A bucket can hold cash and investments at once. The{" "}
            <span className="font-mono text-xs">Unrealized P&amp;L</span> column shows the gain on
            the invested part — <strong className="text-[var(--foreground)]">on paper</strong>,
            which a price move can take back. It does not bring you closer to the
            goal the way realised money does.
          </p>
        </Entry>

        <Entry id="subscriptions" title="Subscriptions" where="Sidebar → Money → Subscriptions">
          <p>
            What repeats: streaming, the gym, insurance. Tells you how much is
            already committed before you do anything else.
          </p>
          <Note label="What it doesn't do yet" tone="care">
            <p>
              A subscription says what <em>will</em> go out — it does not create
              the transaction. You still record it by hand, or wait for the
              statement. That is deliberate for now: an invented transaction in a
              financial record is worse than a missing one.
            </p>
          </Note>
        </Entry>

        <Entry id="interest" title="Interest received" where="Accounts → Interest received tab">
          <p>
            Records the interest your accounts actually paid, against what the
            rate you set says they should have. It exists to catch a bank paying
            less than it promised — which is only visible if somebody does the
            arithmetic.
          </p>
        </Entry>

        <Entry id="analytics" title="Analytics and Trends" where="Sidebar → Analytics · two tabs">
          <p>
            <strong className="text-[var(--foreground)]">Overview</strong> shows where your money
            is, by place, and what it is for, by purpose.
          </p>
          <p>
            <strong className="text-[var(--foreground)]">Trends &amp; projections</strong> looks
            forward: average spending over the last three complete months,
            average saving, and how long you would last. Three months rather than
            one, because a single large purchase distorts a single month.
          </p>
        </Entry>
      </Part>

      {/* ============ PART 2 ============ */}
      <Part
        eyebrow="Part 2 — not guaranteed"
        title="Investing"
        lede="The sidebar calls this section Not guaranteed, and it means it literally. Here values move on their own, and the app is far more careful about telling you where each number came from."
        accent="var(--amber)"
      >
        <Entry id="connections" title="Connections" where="Investments → Connections tab">
          <p>
            Connecting a platform keeps its balances and positions up to date on
            their own. Everything is{" "}
            <strong className="text-[var(--foreground)]">read-only</strong>: the app has no code
            capable of placing an order.
          </p>

          <div className="overflow-x-auto">
            <table className="data-table whitespace-nowrap">
              <thead>
                <tr>
                  <th>Platform</th>
                  <th>What it needs</th>
                  <th className="whitespace-normal">Worth knowing</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Hyperliquid</td>
                  <td>Your public wallet address</td>
                  <td className="whitespace-normal">No keys, no secrets. Brings trade history too.</td>
                </tr>
                <tr>
                  <td>Trading 212</td>
                  <td>API key (Settings → API)</td>
                  <td className="whitespace-normal">Generate it with order permissions switched off.</td>
                </tr>
                <tr>
                  <td>Bybit</td>
                  <td>Read-only API key and secret</td>
                  <td className="whitespace-normal">bybit.com only. bybit.eu cannot be connected — their restriction.</td>
                </tr>
                <tr>
                  <td>Interactive Brokers</td>
                  <td>A gateway running on your computer</td>
                  <td className="whitespace-normal">Needs an IBKR Pro account. The session expires and needs a new login.</td>
                </tr>
                <tr>
                  <td>Trade Republic</td>
                  <td>CSV import</td>
                  <td className="whitespace-normal">No public API. See <a href="#import" style={{ color: "var(--accent)" }}>Importing statements</a>.</td>
                </tr>
              </tbody>
            </table>
          </div>

          <Note label="Secrets">
            <p>
              API secrets are encrypted before being stored and never shown again.
              They need <span className="font-mono text-xs">ENCRYPTION_KEY</span> configured —
              change it and those connections stop working, with no way back.
            </p>
          </Note>
        </Entry>

        <Entry id="holdings" title="Holdings" where="Sidebar → Investments">
          <p>
            Everything you hold, from wherever it came: synced, imported from a
            statement, or entered by hand. Five figures across the top.
          </p>

          <div className="overflow-x-auto">
            <table className="data-table">
              <tbody>
                <tr><td className="whitespace-nowrap">Portfolio Value</td><td>Everything, at the capital you actually committed</td></tr>
                <tr><td className="whitespace-nowrap">Unrealized P&amp;L</td><td>Profit <strong>on paper</strong>, measured against cost</td></tr>
                <tr><td className="whitespace-nowrap">Market-exposed</td><td>The part whose price can move</td></tr>
                <tr><td className="whitespace-nowrap">Cash &amp; stablecoins</td><td>The part whose price cannot</td></tr>
                <tr><td className="whitespace-nowrap">Realized P&amp;L</td><td>Money that <strong>arrived</strong>: closed sales, dividends, interest</td></tr>
              </tbody>
            </table>
          </div>

          <p>
            The middle two always add up to the first. The note under each says
            what it is made of, so you can check it.
          </p>

          <p className="text-[var(--foreground)] font-medium">The table</p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong className="text-[var(--foreground)]">Columns</strong> — pick which ones to show; remembered on this device. <em>Name</em> is the shortened instrument name, <em>Symbol</em> is what the broker wrote, in full.</li>
            <li><strong className="text-[var(--foreground)]">Drag a column edge</strong> to resize it.</li>
            <li><strong className="text-[var(--foreground)]">in balance</strong> — that money is already inside an account balance. Shown, never added on top.</li>
            <li><strong className="text-[var(--foreground)]">at cost</strong> — the value shown is what you paid, not what it is worth today. The app will not invent a market price it does not have.</li>
          </ul>
        </Entry>

        <Entry id="positions" title="Open positions" where="Investments → Open positions tab">
          <p>
            What is synced from the platforms, live. This is where you{" "}
            <strong className="text-[var(--foreground)]">tag</strong> each position and each spot
            balance: asset type, risk, horizon, liquidity, playlist, and the
            annual rate where the asset earns one.
          </p>
          <p>
            That rate field is named after the income the type actually has —{" "}
            <em>Dividend yield</em> on a stock, <em>Interest rate</em> on cash,{" "}
            <em>Staking APR</em> on staking, <em>Coupon rate</em> on a bond. For
            types with no published annual rate the field disappears rather than
            inviting you to guess one.
          </p>
          <p>
            The four cards at the top always reconcile:{" "}
            <strong className="text-[var(--foreground)]">free + margin in use = account value</strong>.
          </p>
        </Entry>

        <Entry id="analysis" title="Analysis" where="Investments → Analysis tab">
          <p>
            The whole portfolio broken down by asset type, risk, horizon,
            liquidity, account and playlist, plus biggest gains and losses —
            always <strong className="text-[var(--foreground)]">unrealised</strong>, and the page
            says so.
          </p>
          <p>
            The <span className="font-mono text-xs">Cash &amp; stablecoins</span> button hides
            idle money. Worth using: cash cannot lose value to the market, so it
            flattens every risk breakdown it sits in. Switched off, you see only
            what is actually exposed.
          </p>
        </Entry>

        <Entry id="history" title="Trade history" where="Investments → Trade history tab">
          <p>
            What you <em>did</em>, as opposed to what you hold. Fills itself from
            platforms that report movements, and by statement import for those
            that don&apos;t.
          </p>

          <div className="overflow-x-auto">
            <table className="data-table">
              <tbody>
                <tr><td className="whitespace-nowrap">Realised result over time</td><td>What closed trades made, what fees cost, and what is left</td></tr>
                <tr><td className="whitespace-nowrap">Result by instrument</td><td>Ranked on net — after fees</td></tr>
                <tr><td className="whitespace-nowrap">How often you trade</td><td>Trades per month, and the hour of day they land</td></tr>
                <tr><td className="whitespace-nowrap">How long you hold</td><td>Winners against losers, as medians</td></tr>
              </tbody>
            </table>
          </div>

          <Note label="Read the fees line" tone="care">
            <p>
              Fees are never folded into the result, deliberately. On a small
              account they routinely exceed what the trading made — only the{" "}
              <em>Net</em> line tells you whether it was worth doing.
            </p>
          </Note>

          <p>
            Hours are shown in <strong className="text-[var(--foreground)]">UTC</strong>. The app
            has no reliable way to know where you were when you placed each
            order, and a chart labelled with the wrong hours would be read as
            fact.
          </p>
        </Entry>

        <Entry id="playlists" title="Playlists" where="Investments → Playlists tab">
          <p>
            Groups of positions by purpose — retirement, speculation, long term.
            Answers which group is actually working, instead of treating the
            portfolio as one block.
          </p>
          <p>
            Counts manual and synced positions alike. A leveraged position
            contributes what it actually ties up, not its notional value.
          </p>
        </Entry>

        <Entry id="watchlist" title="Watchlist" where="Investments → Watchlist tab">
          <p>
            Things you don&apos;t hold but are following, with the price at which
            they would interest you.
          </p>
        </Entry>

        <Entry id="dividends" title="Dividends" where="Investments → Dividends tab">
          <p>
            What your instruments paid, by holding and by year, with the yield
            against current value. <strong className="text-[var(--foreground)]">Interest on
            cash</strong> is kept apart from distributions: both are income, but
            only one says anything about what a holding yields.
          </p>
        </Entry>

        <Entry id="import" title="Importing statements" where="From the page whose data the statement changes">
          <p>
            For brokers with no API — Trade Republic being the case — importing
            the official statement is the route. The app takes CSV and detects
            files and rows already imported before saving.
          </p>
          <p>
            It also keeps a{" "}
            <strong className="text-[var(--foreground)]">record of what the file contained</strong>:
            a fingerprint of the file and its sums. That exists because a
            statement put through a conversion tool can lose a row silently, and
            you cannot see the transaction that isn&apos;t there.
          </p>
          <p>
            An import can be <strong className="text-[var(--foreground)]">undone as a whole</strong>,
            which makes it safe to try.
          </p>
        </Entry>
      </Part>

      {/* ============ THE REST ============ */}
      <div className="card p-5 space-y-8">
        <Entry id="settings" title="Settings" where="Sidebar, at the bottom → Settings">
          <ul className="list-disc pl-5 space-y-1">
            <li><strong className="text-[var(--foreground)]">Base currency</strong> — the currency of every total. Change it and the whole app reconverts.</li>
            <li><strong className="text-[var(--foreground)]">Favourite currencies</strong> — the ones offered first in forms.</li>
            <li><strong className="text-[var(--foreground)]">Dashboard currency</strong> — view the summary in another currency without changing the base.</li>
            <li><strong className="text-[var(--foreground)]">Appearance</strong> — several themes, each with a light and a dark variant.</li>
            <li><strong className="text-[var(--foreground)]">Categories</strong> — create, merge, and mark as fixed or variable.</li>
            <li><strong className="text-[var(--foreground)]">Exchange rates</strong> — inspect them and force a refresh.</li>
            <li><strong className="text-[var(--foreground)]">Data</strong> — backup and restore. The backup contains everything the app stores.</li>
          </ul>
          <Note label="Privacy mode">
            <p>
              A switch hides every figure. Useful for showing someone the app
              without showing them what you have.
            </p>
          </Note>
        </Entry>

        <Entry id="library" title="Library" where="Sidebar → Learning → Library">
          <p>
            Books and courses, with reading progress. Nothing to do with your
            accounts — it is here because learning about money and managing money
            belong together.
          </p>
        </Entry>

        <Entry id="wont" title="What it deliberately won't do" where="Settled decisions, recorded so they aren't re-argued">
          <ul className="list-disc pl-5 space-y-1">
            <li><strong className="text-[var(--foreground)]">No advice.</strong> No recommendations, no signals. It shows what you hold and what you did.</li>
            <li><strong className="text-[var(--foreground)]">No orders.</strong> Every connector is read-only by architecture — the capability is not in the code.</li>
            <li><strong className="text-[var(--foreground)]">No Trade Republic login.</strong> The only route is an unofficial client using a phone number and PIN, which would make it the one connection able to move your money.</li>
            <li><strong className="text-[var(--foreground)]">No blocking negative balances.</strong> Credit cards and margin can legitimately go negative; forbidding it would model reality badly.</li>
            <li><strong className="text-[var(--foreground)]">No Open Banking.</strong> It needs a licence.</li>
          </ul>
          <Note label="Not built yet" tone="care">
            <p>
              Alerts — the app knows a budget is blown and doesn&apos;t tell you.
              A monthly report. Recurring transactions created automatically.
              Bonds modelled properly, with coupon and maturity. Attaching
              receipts.
            </p>
          </Note>
        </Entry>
      </div>

      <div className="text-xs text-[var(--muted)]">
        <Link href="/" style={{ color: "var(--accent)" }}>
          Back to the dashboard
        </Link>
      </div>
    </div>
  );
}

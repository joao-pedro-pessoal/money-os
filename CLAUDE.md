# Money OS — what will bite you

A personal finance app. Next.js App Router, TypeScript, Drizzle, PostgreSQL (Neon).
Single user, password-gated by `src/proxy.ts`. No API routes except `/api/sync`.

Everything below is here because it has already gone wrong at least once. Read it
before changing anything; none of it is style preference.

## The map

| Where | What | Rule |
| ----- | ---- | ---- |
| `src/lib/**` | 82 modules of pure logic — accounting, portfolio, quotes, csv, fx, connectors, stats | no DB, no React; no `fetch` outside the four below |
| `src/actions/**` | 29 server-action modules; every database access | `"use server"`, async exports only |
| `src/app/(app)/**` | pages, server components by default | |
| `src/components/**` | 56 components; `"use client"` only where it earns it | |
| `src/db/schema.ts` | one file, the whole schema | migrations generated, never written |
| `drizzle/` | 36 migrations + `meta/_journal.json` | the journal is what makes them run |

Four files in `src/lib/**` do call `fetch`, and the table above says "pure" of
all of them: `connectors/bybit/index.ts`, `connectors/trading212/index.ts`,
`connectors/types.ts` and `fx/index.ts`. They are the outbound edge and have to
reach the network. Everything else there is genuinely pure, which is what makes
the suite run without Postgres — but don't read the rule as covering these, and
don't add a fifth without a reason.

The arbiters — the modules that decide what a number means. If a total looks
wrong, it is almost always because something computed it outside one of these
rather than because one of them is wrong.

| Figure | Arbiter |
| ------ | ------- |
| Net worth | `lib/accounting/networth.ts` |
| What a balance covers | `lib/accounting/balanceScope.ts` |
| Free cash | `lib/accounting/unallocated.ts` — `accountFreeCash` |
| Unrealised gain | `lib/portfolio/positionView.ts` — `portfolioSummary` |
| Where a holding comes from | `lib/portfolio/holdingSource.ts` |
| A rebuilt position | `lib/portfolio/reconstruct.ts` |
| Which dividends are whose | `lib/portfolio/dividendSource.ts` |

This list is the one to trust; keep it complete. It was out of date once and
disagreed with the shorter list further down, which is the doc committing the
exact mistake it spends a section warning about.

## Before you start

Two things orient faster than reading the rest of this file.

Run `npm run audit`. It checks the invariants below against the real database
and reports what is currently wrong with the **data** — as opposed to the code —
so open issues announce themselves instead of living in a stale list here. At
the time of writing it reports two, both the user's to decide: a 100 transaction
stamped EUR on a USD account, and an IBKR stored balance that has drifted 100
above what the connector says.

Check `git branch`. Work has been happening on `fix/secrets-and-unconverted-sums`,
which is a long way ahead of `main` and has never been merged. Starting from
`main` means starting without any of it.

## A missing secret is refused, never defaulted

`APP_SECRET` fell back to `"dev-secret-change-me"` and `APP_PASSWORD` to
`"changeme"`. This repository is public, so both values are known to anyone who
can read `src/lib/auth.ts`: an instance started without a `.env` was open to
whoever found it, with a session cookie they could compute themselves. Only
`docker-compose.yml` caught it, and only on the Docker path — the README also
offers "on your own machine", where `npm start` checked nothing.

`deriveKey` throws without `ENCRYPTION_KEY` and `/api/sync` answers 503 without
`SYNC_SECRET`. Auth was the one place doing the opposite. **A secret is a
measurement like any other, and absence is not a value** — the same rule as the
rest of this file, applied to configuration.

An empty string counts as missing: `${APP_SECRET:-}` in a compose file leaves
one behind, and it is not a secret.

## Never hand-write a migration

`drizzle-kit migrate` reads `drizzle/meta/_journal.json`. A `.sql` file with no
journal entry is **skipped silently** — the app then fails at runtime with
`column "x" does not exist`, which looks like a code bug and isn't.

This warning was already here in bold and it happened anyway:
`0012_smooth_ledger.sql` sat in the folder for three weeks with no journal
entry, colliding on index 12 with the generated `0012_whole_firelord.sql`, and
would never have run. It was harmless — the journalled file created the same
three tables — but only by luck. `src/lib/__tests__/migrations.test.ts` now
fails the suite on any orphan, any journal entry with no file, and any two
migrations claiming the same index. A rule that has to be remembered is a rule
that gets forgotten.

Always:

```
npm run db:generate      # drizzle-kit generate — writes sql + snapshot + journal
npm run db:migrate       # tsx scripts/migrate.ts — loads .env, applies them
```

`npx drizzle-kit migrate` does **not** work here: the config reads
`process.env.DATABASE_URL` and drizzle-kit doesn't load `.env`.

After any schema change, `npm run db:generate` a second time must report
"No schema changes". If it doesn't, the migration and the schema disagree.

## Double counting is the recurring bug

It has happened nine times. Money can be reachable through more than one path —
an account balance, a connector's reported balance, a holding, a position, a
bucket allocation — and the same euro must be counted once.

- `balancesAreSeparatePool` (connectors) and `balanceMeaning` (manual accounts)
  exist so **the source declares what its number means**. Don't infer it.
- `balanceMeaning` has three values, not two. `bank_and_broker` describes an
  account like Trade Republic where one balance covers cash *and* investments;
  `accounts.investedValue` says how much of it is invested, and the cash is the
  remainder. Adding the positions on top of that balance counts them twice.
- Before adding anything to a total, ask which other total already contains it.
- `src/lib/accounting/networth.ts` is the arbiter. Changing it requires reading
  its tests first; they encode decisions that are not obvious from the code.

## A second definition is worse than a wrong one

This has now happened four times, and the third was not even a number.

The fourth was the most expensive, and it is the one to read first because it
shows how far a duplicate definition travels before anyone sees it.

The Interactive Brokers row read **34.24 USD of balance beside 134.24 "free"** —
more money committed to nothing than the account contained. The balance column
read the connector's equity; the free column read `accounts.balance`, a stored
figure a manual transaction had pushed 100 above what the venue held, and which
the last sync (status: `error`) never corrected.

The screen was the cheap part. `a.free` is read in **six** places, including the
buckets page's distributable total and `suggestDistribution`. Measured on real
data: **736.28 offered to assign to goals against 440.69 actually free.**
Trading 212 accounted for 144.19 of that on its own, because its balance is
nearly all ETFs and only 0.13 is cash. Two more spellings were hiding on the
dashboard — `explainFree` described the manual figure from the raw balance,
ignoring the invested half, and the number the card actually rendered came from
`p.available`, which is free of margin but not of bucket allocations.

Four definitions of one word, three of them wrong in different directions, none
of them failing a test.

`accountFreeCash` in `lib/accounting/unallocated.ts` is now the only one, and
`listAccountsWithState` computes it once and hands the whole view to the screens
so no page builds its own. **A connected account's stored balance is not
consulted at all** — falling back to it is precisely how the two diverged.

Note where the fix had to go. Patching the accounts page would have left five
readers wrong; the arbiter had to move to the action every screen already calls.
`getAccountPlatformTotals` moved to `actions/platformTotals.ts` to make that
possible, because `connections.ts` already imports `accounts.ts` and the obvious
placement would have been a cycle.

`parseBrokerCsv` repeated all eleven column-name lists inline instead of reading
`COLUMN_ROLES`, which `inspectBrokerCsv` uses. They agreed until they didn't:
translating the headers so Degiro's Portuguese export could be read updated one
list, so the report called the file readable and the parser threw "no column for
date, type" on the very same file. The report promising something the importer
then refuses is worse than either behaviour alone. There is one list now, and a
test asserts that anything the inspection calls readable does not throw.

The two cases below were both a figure. This one was a lookup table, which is
the same failure: **if something already defines what a thing is, read it.**

`portfolioSummary` in `lib/portfolio/positionView.ts` is the arbiter for an
unrealised gain. Its own comment records why it exists: the cards once read
"Unrealized P&L 0,00 €" while the table below them reported −0,51 €, because
the cards were computed from manual holdings alone.

It came back. `lib/accounting/composition.ts` grew an `unrealisedPnl` field
summed inside `getAccountComposition`, which walks holdings filtered by
`holdingCountsOnTop` and never sees a synced position at all. The dashboard
showed `+0,00 €` beside an Investments page showing `17,79 €`, on the same
portfolio, on the same screen refresh.

The tell is not that the number was wrong — it is that the number was
**recomputed**. If a figure already has a function that defines it, a second
sum over a different set of rows will agree right up until the rows differ,
and then it disagrees in a way nobody notices because both look plausible.

`compose` no longer reports a P&L at all, and says so where the field used to
be. The rule: **before summing anything, search for the function that already
defines it.** The table of arbiters under "The map" lists them; the correct move is always to
call one, never to reproduce it.

There is a second lesson underneath. `portfolioSummary` reports `costUnknown`
— market-exposed value whose cost nobody states — separately, with the
invariant `cost + pnl + costUnknown === floating`. A synced exchange balance
knows what it is worth and never what it cost, so it can never contribute a
gain. Anything showing `pnl` has to show that too, or it presents a subset of
the portfolio as all of it.

## A currency conversion is not a trade

IBKR books an FX conversion as a buy or a sell of `EUR.USD`, so holding a
dollar asset in a euro account produces a stream of them. On the live account
`EUR.USD` was the most "traded" instrument in the app — 17 rows against about
five real positions — and every figure in `lib/trading/stats.ts` counted them:
the trade count, the win rate, the average size, the instrument breakdown.

`isInstrumentTrade` is the predicate any figure must use; `isTrade` answers a
narrower question and is not what a statistic wants. The test is that **both
halves are currency codes**, which is what keeps `BRK.B` safe — it splits into
`BRK` and `B`, and `B` is not a currency. A "contains a dot" rule would have
eaten it.

### A venue that reports no result is not a venue with no results

Only Hyperliquid states a realised P&L per fill — 46 rows of 96. IBKR states
none on any of its 22 and Trading 212 none on its 30, so the page said "none of
which has closed a position yet" about an account that had bought 3.465 FEMY
and sold all of it a fortnight later.

`lib/trading/realised.ts` derives one by matching sells against average cost,
the same method `reconstruct.ts` uses — a different method here would mean two
screens disagreeing about the same sale. Three rules, each from the data:

- **The venue's figure always wins.** Where any row of a symbol carries one,
  nothing is derived for that symbol; mixing the two inside one instrument's
  total gives a number belonging to neither method.
- **A sale with nothing bought before it is left alone.** The feed reaches back
  only as far as the import does, and pricing against a cost of zero reports
  the whole proceeds as profit.
- **`pnlDerived` travels on the row**, so a screen cannot total the broker's
  figures and this app's together without choosing to. The two answer the same
  question by different methods and will not agree.

## Dividends can be known three ways

Same shape as holdings, one table further on. A distribution reaches the app
through a connector's `getDividends()` (`dividend_payments`), a broker
statement (`broker_events`) or the activity CSV (`investment_activities`), and
the page read the first alone — so thirteen real Trade Republic payments sat in
a statement, invisible, behind a total built from three.

Unioning the three would have been worse. On the live account Trading 212's
three payments exist in two of the tables on identical dates, differing only in
how the symbol is spelled: `EUN3d_EQ` from the API against `EUN3` from the
import.

`lib/portfolio/dividendSource.ts` is the arbiter, and the key is **the account
and the kind**, not the account alone. That second half was forced by the data:
Trading 212's connector reports dividends and no interest, while its import
reports both, so choosing one source per account kept three dividends and lost
sixty-five interest payments — one hole traded for another. The sources are not
rivals describing the same thing; they cover different subsets.

Counted went from 3 to 97, and the cross-check pile from 68 to 3 — exactly the
three duplicated payments, kept rather than deleted so a disagreement between a
broker's figures and an imported file stays visible.

**A name comes from the user's own file or not at all.** The statement's
dividend rows carry only an ISIN — "Cash Dividend for ISIN CA67077M1086" —
while its purchase rows name the instrument. `nameByInstrument` joins them on
the ISIN. Where nothing names it the screen shows the ISIN, which is true,
rather than a guess, which this codebase forbids.

## Holdings can now be known two ways

Positions can come from a live connector *or* be rebuilt from an imported
statement (`src/lib/portfolio/reconstruct.ts`). Trading 212 offers both, so
adding them together doubles the portfolio — the double-counting bug again,
wearing a new hat.

`src/lib/portfolio/holdingSource.ts` is the arbiter: the account **declares**
which source is authoritative, exactly one source feeds totals, and the others
become cross-checks. `partitionBySource` returns `counted` and `crossCheckOnly`
as separate arrays so adding the wrong one has to be deliberate.

Two rules that come with it:

- **A reconstruction is only as fresh as the last import.** A live price times a
  stale quantity looks current and isn't. `assessStaleness` decides how much to
  trust it; if it says `stale`, the screen says stale.
- **An unpriced holding is not a holding worth zero.** `valueHoldings` excludes
  it and marks the total `partial`. A portfolio that quietly shrinks is acted
  on.

Realised P&L derived here is **this app's number**, computed under a named
cost-basis method. Trading 212 publishes its own and the connector reports that
instead. Never present the two as the same kind of claim.

## Zero is not a measurement

This is the single most repeated bug in this codebase, and it wears a different
costume every time:

- Positions adopted from a statement carry their purchase price in the
  current-price field, so the P&L read `+0,00 €` for twelve rows — a portfolio
  claiming to be exactly flat, which nobody's portfolio has ever been.
- A HYPE balance showed `0,00 US$`, and the diagnosis written here for weeks —
  "a dormant pair reported a mark price of zero and the parser wrote it down" —
  was wrong. See the Hyperliquid section below: the parser was reading another
  pair's price entirely. Rejecting zeros made the symptom move rather than go
  away, and the balance came back as `0,09 US$` against a token worth 76.
- Unpriced coins were left out of the "Spot balances" card, which then displayed
  a smaller number with no indication that it was short.
- `toBase` returns null when it has no rate; treating that as zero deletes the
  row from the total.

The rule: **absence must be representable, and must be displayed as absence.**
Never `?? 0` a price, a rate or a valuation. `isUnpriced` in
`src/lib/portfolio` exists for this, and any total that leaves something out
must say what it left out.

The distinction that makes it concrete: "nothing has moved" is a measurement,
"nothing has been measured" is not, and they must never render the same.

## External prices: every field can be right and the answer still wrong

This cost an entire session. Eleven ETFs came back priced, in euros, from real
listings of the right funds — and the portfolio showed a 46 € loss on a
portfolio that was up 26 €. Nothing on any single row looked wrong.

The chain is `src/lib/quotes/`:

```
ISIN → knownListings.ts (hand-checked)  → symbol
     → openfigi.ts (every venue)        → candidateSymbols → symbol
     → yahoo.ts / stooq.ts              → price
```

**Three checks, each of which exists because it was missing.**

1. **The currency must be stated and must match.** The original check read
   `if (currency !== null && currency !== expected) reject`, which quietly let
   through every response that omitted the field. An unlabelled number is the
   one case where being wrong is undetectable, so it needed the strictest rule
   and had the loosest. Refuse, never convert: converting hides a wrong listing
   behind a plausible number.

2. **The price must be recent.** A venue that stopped trading years ago still
   answers, with the right instrument, the right currency, and its last print.
   SXR8 was around 425 € in 2021 and 714 € in 2026, and the app was showing 425.
   `quoteIsStale` refuses anything older than `MAX_PRICE_AGE_DAYS`, and an
   unreadable date counts as stale.

3. **The batch must agree with what the broker says.** An account that declares
   its own value gives a second, independent measurement. `crossCheckPricing`
   compares them and `autoPriceHoldings` **gathers every price, checks the sum,
   and only then writes** — a two-phase commit. Saving each price as it arrives
   is what let a set of individually plausible prices become a portfolio showing
   a loss on a portfolio that was up.

**Why `knownListings.ts` is hand-written.** OpenFIGI answers "where does this
ISIN trade" with every venue that carries it, including dead ones. Every German
venue collapses to the same Stooq symbol, so exactly one listing survives
deduplication and *its* exchange code decides which Yahoo listing gets priced —
which used to be settled by OpenFIGI's ordering, which is to say by nothing.
Sorting happens before deduplication now, Xetra first. The table is a shortcut,
not a gate: an ISIN that isn't in it falls back to OpenFIGI, so a wrong entry
costs a failed lookup rather than a wrong price.

**Trade Republic's crypto codes pass the ISIN check digit.** `XF000BTC0017` has
no issuer and no OpenFIGI entry — it is a house code wearing a valid ISIN's
clothes. A valid ISIN does not imply a listed security.

## A predicate that decides what to delete belongs in a tested function

"Forget found prices" was supposed to clear eleven wrong prices. It cleared
none, and reported success. The predicate was a regular expression written from
memory inside a database action: it matched the Stooq spelling `sxr8.de` and not
the Yahoo one, `yahoo:SXR8.DE`, which is how all of them were stored.

`wasFoundAutomatically` in `src/lib/quotes/symbolSource.ts` now answers that
question with tests beside it, including one asserting that a symbol *you* typed
is never deleted. Undoing a guess must not destroy a decision.

The general form: anything that decides what to throw away, what to trust, or
what counts as a match is load-bearing logic, and load-bearing logic does not
live inline in an action.

## Diagnose before you guess

Twice in one session the fix was to surface data the app already had, and both
times it came after several rounds of the user pasting the same generic failure
back. "No quote for this symbol" names no symbol; "0 of 11 priced" describes the
wrong problem when eleven prices arrived and were rejected.

When something external fails, report **what was tried and what came back**,
quoting the response body if it didn't parse. The user is not a debugger, and a
message that can't be acted on costs a round trip every time.

## Where code is allowed to live

- `src/lib/**` — pure functions. No database, no `fetch`, no React, no I/O.
  This is what makes the test suite fast and the logic testable. Enforced by
  convention, not tooling, so it's on you.
- `src/actions/**` — every database access. `"use server"` modules may **only**
  export async functions; a `const` export there is a build error with a
  confusing message.
- `src/app/**` — pages. Server components by default.

## Never add two amounts without converting first

Every table that holds money holds a currency beside it: `transactions.currency`,
`accounts.currency`, `holdings.currency`,
`accountConnections.reportingCurrency`. A `reduce` that adds `Number(x.amount)`
across rows is a bug unless every row is already in the same currency, and the
result is a number in no currency at all — rendered with whatever symbol the
page happened to use.

This has now been fixed in eleven places. When adding a sum, the question is not
"are these the same currency" but "what converts them".

**Where the answer is "nothing can convert them here", refuse.** `src/lib/**` is
pure and holds no rates, so `summariseCashFlows` returns `deposits`,
`withdrawals` and `net` as `number | null` — null exactly when the statement
spans more than one currency — plus the list of currencies it saw. A layer with
rates converts; this one hands back what it knows. Making the totals nullable is
what found the two components rendering them, because the compiler had to.

Note the asymmetry that makes this the right default: an empty statement still
reports `0`, because nothing moved *is* a measurement. Only the mixed case is
null.

**A component that only subtracts still has to report what it left out.** Every
part of `getNetWorth` went through `sumInBase`, which returns `unconverted` —
except liabilities, which used a raw `reduce` with `?? 0`. A debt in a currency
with no rate became a debt of zero, and the headline came out too high with no
marker anywhere. Money you own going missing understates you; money you owe
going missing tells you that you are richer than you are.

Two traps specific to this codebase:

- **`platformBalances.usdValue` is not always USD.** Trading 212 reports euros.
  The connection's `reportingCurrency` says which.
- **A cash balance is denominated in itself, not in the platform's currency.**
  1.75 EUR held at a dollar-reporting broker is 1.75 euros. It was displayed as
  "1,75 US$" — a real amount of the wrong money — and summed as dollars.
  `isCurrencyCode` in `src/lib/fx` tells a currency row from an asset row.
  Stablecoins are deliberately *not* currencies: USDC is worth about a dollar
  because a peg holds, which is a fact about a holding.
- **`toBase` returns null when it has no rate.** Treat that as "leave it out and
  say so", never as zero.

**A column default is not a currency.** `transactions.currency` defaults to
`EUR` and the transaction form has no currency field, so every manual row was
stamped EUR whatever account it landed in — while `createTransaction`
incremented the balance with a raw `balance + amount`. A 100 entered against a
USD broker became a 100 EUR row *and* 100 USD of balance: recorded in one
currency, added in another. It now reads the account and stamps that, which is
the only currency the form could have meant. `npm run audit` checks that no
transaction disagrees with its account.

## Only a time-weighted line may be drawn against a benchmark

Net worth rises when money is paid in. An index has no equivalent event, so
overlaying the two compares a return against a return plus your salary, and the
day of a deposit renders as a day of beating the market. `timeWeightedSeries`
exists for this and is the only portfolio line the comparison may use.

Its last point and `timeWeightedReturn`'s `totalReturn` are the same
measurement, and a test asserts it across generated flow dates — including the
case they could most easily disagree on, a flow on a day with no snapshot, where
`valueAt` breaks the period at the *previous* reading. A chart whose end
contradicts the headline above it is worse than either number alone.

The window comes from `twr.from`/`twr.to`, never from the index. Where the index
series does not reach that far back, `compareOverWindow` refuses: comparing
eleven months of market against two of portfolio presents a difference in
periods as a difference in performance.

**The proxy must be an accumulating share class.** There is no free total-return
series for an index, so the benchmark is an ETF that tracks it — and the share
class matters more than the index does. An accumulating fund reinvests dividends
internally, so its price *is* a total-return series. A distributing fund sheds
its dividend from the price on every ex-date, which would understate the index
by roughly its yield every year: about two points on a world tracker, small
enough to look right and large enough to reverse the verdict.

### A deposit on the last day used to read as a loss

Found while building the above, by a property test walking flow dates across the
window after every hand-written example had passed — each of those happened to
put its flow in the middle.

`timeWeightedReturn` closed its trailing leg against `last` even when the period
had opened on that same final day, so the leg ran from `value + deposit` down to
`value`: a loss exactly the size of the money paid in. €500 into a €1 300
portfolio reported −28% for the year, on a portfolio that had done nothing. The
app snapshots daily, so "a deposit on the most recent snapshot" is the ordinary
case rather than the exotic one.

The guard is `periodStartDate < to`: a period with no valuation after it is not
closed at all.

## An unlayered rule beats every Tailwind utility

`@import "tailwindcss"` puts utilities in `@layer utilities`. Every rule written
in `globals.css` after that import is **unlayered**, and unlayered styles win
over layered ones whatever their specificity. A single-class utility cannot
override anything in that file.

`table.data-table th { text-align: left }` therefore beat `.text-right` on every
header cell in the app: **71 of them across 19 files asked for right alignment
and none of them got it**, so "Value" sat at the left of a column of
right-aligned figures while the class saying otherwise looked like it worked.

The fix is an explicit unlayered rule (`table.data-table th.text-right`), not a
utility. Before assuming a Tailwind class is winning against something in
`globals.css`, check the compiled stylesheet — `.next/static/chunks/*.css` — for
which rules sit inside `@layer` and which do not. That check is what turned this
from a plausible theory into a verified one.

## A control that changes the view must not scroll it away

Next resets scroll on every navigation. That is right when you are going
somewhere and wrong when you are staying put — and the pages driven by search
params (portfolio analysis, the library) express sorting, filtering and opening
a row *as* navigation. Every filter threw the reader back to the top of a page
they had scrolled down; sorting a table meant scrolling back down to see the
result.

**`FilterLink` is `<Link scroll={false}>`. Use it for any link that lands on the
page it started from.** A link to a different page stays a plain `<Link>`:
arriving halfway down a document you have never seen is its own kind of lost.
`src/lib/__tests__/scroll-position.test.ts` fails if a same-page href appears on
a bare `<Link>`, because this bug is invisible in review and in a screenshot and
only shows up for someone who scrolls before clicking.

**Never use `<form method="GET">` to change a parameter.** It is a full document
navigation, and it carries only what is written into it as hidden inputs. The
grouping form on the analysis page listed `sort` and `dir`, so changing "Group
by" silently dropped `synced` — whose *absence reads as on* — and closed the
open group. `FilterSelect` takes a whole href per option, built by the page's
own query builder, so a parameter added later is carried without anyone
remembering to add a hidden input for it.

## Nested tables cannot align with the table they sit in

A `<table>` sizes its columns from its own content. The analysis page's group
detail was a nested table inside a `colSpan` cell, so its Value could never line
up under the Value it belonged to, and comparing a member against its group
meant measuring by eye. Detail rows now live in the same table as the row they
expand, which makes the alignment structural rather than something to maintain.

Two things follow. A sub-heading longer than the figures beneath it widens that
column for **every** row in the table, so let it wrap. And `whitespace-nowrap`
on the table is inherited by prose inside it — an explanatory paragraph ran off
the right edge and ended mid-word, readable only by scrolling sideways.

## A token used anywhere must exist in every theme

`--border-strong` was defined in three of the eight themes; in the other five
the borders using it fell back to `currentColor`, so a chart baseline drew in
the text colour. `src/lib/__tests__/theme-tokens.test.ts` now parses
`globals.css` and fails on any theme whose token set differs from the others,
on any `var(--x)` in the app that no theme defines, and on any override that
invents a name.

There are three axes, not two. `data-accent` × `data-mode` gives the eight
complete themes; `data-signal` is an override that applies only to the
monochrome pair and redefines a deliberate subset — the good/bad colours and
the categorical `--chart-N` palette. Overrides carry three attributes and so
win on specificity wherever they apply, regardless of order.

**A component with a colour literal in it cannot be themed.** `DonutChart` held
four hex values, so the monochrome theme was not monochrome past the fourth
slice: it drew blue, purple and cyan on a page that had deliberately thrown
every hue away. Slice colours are `--chart-1`…`--chart-4` now. A theme is only
honoured by the components that ask it.

## A NUL byte in a source file passes every check that runs the code

`dividendSource.ts` used a literal NUL as a map-key separator. It works — no id
or kind can contain one — and `tsc` was clean, 1 911 tests passed, eslint was
clean and the app ran. What broke was everything that *reads* the file: git
called it binary and stopped producing diffs and blame, and grep skipped it.
The defect was invisible to every tool that looks at behaviour, because the
behaviour was correct.

It arrived from an escape that did not survive being written through a shell:
`\u0000` reaching the file as the byte rather than as six characters. Twice,
because the second attempt to fix it made the same mistake.

The separator is `|` now — plainly typed, and impossible in a cuid2 id or in a
lowercase kind, so nothing is lost. `src/lib/__tests__/source-hygiene.test.ts`
fails on any NUL or stray control character in a source file, checked by
planting one and watching it name the file.

The general lesson: **when a script writes source code, check the bytes, not
just that it compiles.** Escaping through a shell into a heredoc into a
language is three chances to change what you meant.

## A label has to know which question it answers

Five tag values mean different things on different axes: `low` and `high` are
risk levels *and* liquidity levels, `medium` is a risk level *and* a horizon,
and `long` and `short` are horizons *and* directions.

`tagLabel` flattened all seven vocabularies into one value→label map, so the
last one spread in won every collision. The risk breakdown labelled its groups
"Low liquidity" and "High liquidity"; the horizon breakdown labelled its groups
"Long (gains when it rises)". Three of the four allocation axes were showing
another axis's words, and each looked entirely deliberate.

Spotted on a screenshot of the horizon chart, where "Medium term" sat between
two direction labels — the tell being that `medium` collides with one other
vocabulary and `long` with `DIRECTIONS`, which was last.

`tagLabel(value, axis)` takes the axis now, and every caller that knows it
passes it — which is nearly all of them, since a column of risk levels knows it
is showing risk. Without an axis an **ambiguous** value comes back unchanged:
`long` is not a wrong answer, "Long (gains when it rises)" on a horizon chart
is.

The general shape: **a lookup keyed only by value is a bug whenever the same
value appears in two vocabularies.** Flattening them hides which one won.

## Count calendar days by the calendar

`(a.getTime() - b.getTime()) / 86_400_000` is not the number of days between two
dates. Across a daylight-saving change a day is 23 or 25 hours, the quotient
lands at 894.958, and `Math.floor` loses a day.

The symptom is always seasonal and therefore invisible in testing: a weekly
budget showed the *previous* week on the day a new one began, but only for
anchors whose weekday matched, and only in months on the far side of a clock
change.

Use `Date.UTC(y, m, d)` on both sides — see `calendarDaysBetween` in
`envelopes.ts` or `daysBetween` in `interest.ts`.

## Rounding each share separately can invent money

`round2` on every slice of a total, then summing the slices, gives back more
than you started with — one cent per slice in the worst case. `distributeByPercent`
handed out €1 191.99 from €1 191.97 that way.

Cap each share by what is left, not only by what it asked for. Property tests
over generated inputs catch this; hand-written examples don't, because the
examples you think of happen to round down.

## Money is never a float

Amounts are `numeric` in Postgres and strings in TypeScript. Convert at the
edge, compute in cents where it matters, and never `parseFloat` a balance into a
running total.

## Frozen conversions

A converted figure is only true at the moment it was converted. Snapshots store
the rate used. Don't re-convert historical rows at today's rate to make a chart
look tidier — mark them `backfilled` and label them approximate instead.

## The library's editorial position is data

`src/lib/library/ranking.ts` decides what leads the library. It works from
`editorialRank`, `heroFeatured`, `specialBadge` and `specialDescription` on the
row. **Never** implement this with `if (title === "The Holy Bible")`. There is a
test that renames the book and asserts nothing moves.

Three similar-looking flags are deliberately separate:

| field           | who owns it  | meaning                                 |
| --------------- | ------------ | --------------------------------------- |
| `editorialRank` | the app      | a claim; rank 1 is unique in the schema |
| `featured`      | the app      | a shelf                                 |
| `favourite`     | the user     | never written by a seed or an import    |

## Don't invent data

No page counts, publication years, ISBNs, lesson counts, durations or cover URLs
unless verified. A number that looks official while being a guess is worse than
no number, because you'd plan against it. Where a value isn't known, the field is
absent and the UI omits it.

Seeds are idempotent by slug. Re-running one must add what's missing and
overwrite nothing the user edited.

## Verify before saying it works

```
npx tsc --noEmit
npx vitest run          # 1910+ tests; all must pass
npx eslint src          # 0 errors; 3 warnings in bybit tests are pre-existing
npm run build
npm run db:generate     # must say "No schema changes"
npm run audit           # invariants against the real database; needs DATABASE_URL
```

`npm run audit` is the one that finds what tests cannot. It calls the same
functions the screens call and checks the relationships their own comments
promise — it never re-derives a figure, because re-deriving is how a second
definition gets written. Its first run reported a failure that was the audit's
own wrong assumption, which is the usual split: when something disagrees here,
read both sides before believing either.

**The layer these checks do not cover.** `src/lib/**` is ~17 000 lines against
~15 000 lines of test. `src/actions/**`, `src/app/**` and `src/components/**`
are ~25 000 lines with **no tests at all** — and that is where the money bugs
live, because it is where two currencies meet. The suite being green says
nothing about them. When a fix lands in an action, ask what pure function could
have held it instead: `sumInBase` and `computeNetWorth` exist because that
question was asked, and the answer is what made them testable.

Tests here are expected to encode *why*, not just *what*. Several real bugs in
this codebase were found by property tests over a range of inputs after every
hand-written example had passed — a comparator returning `NaN`, a period
boundary that excluded today. When a test fails, check whether the test is wrong
before changing the code; roughly half the time it is.

## Hyperliquid: the contexts are not in the universe's order

`spotMetaAndAssetCtxs` returns `[meta, contexts]`, and it is natural to assume
`contexts[i]` describes `meta.universe[i]`. It does not. On a live response the
arrays are not even the same length — 326 universe entries against 717 contexts.

Each context names its own pair in `coin` ("@107"), and each universe entry
carries the same identifier in `name`. **That shared identifier is the only
correct join**, and `buildSpotPriceMap` uses it.

Positional reading cost two sessions across three weeks. Universe position 105
is the pair `@107`, whose mark price is 76.51; `ctxs[105]` belongs to `@105`,
trading at 0.0927. So a HYPE balance was valued at about one eight-hundredth of
its worth, and every other spot token was misread by the same drifting offset —
invisible because each individual number looked like a plausible price for
*something*.

The first attempt at this read the zero that the offset happened to land on and
concluded that dormant pairs were the problem. Rejecting zeros is right on its
own terms and it is still in the code, but it fixed nothing here: the offset
simply landed on a non-zero price next time, which is worse, because `0,00`
looks broken and `0,09` looks like an answer.

Two rules fall out of it:

- **Never pair two arrays by position when both carry an identifier.** Length
  agreeing today is not evidence; these two never agreed.
- **Do not add a positional fallback** for a context with no `coin`. Failing to
  find the price leaves the token unpriced and the screen says unpriced. That is
  the honest outcome, and the whole bug was preferring a number to an absence.

### `withdrawable: 0.0` does not mean nothing is free

Same connector, same shape of mistake, found the same week. Under a unified
account the perps sub-account holds no collateral of its own — it all sits in
spot, marked `hold` — so `clearinghouseState` answers `withdrawable: 0.0`. It is
answering about the sub-account, not about your money.

Margin used to be derived as `portfolioValue − withdrawable`. With that zero it
declared the whole balance committed: 149,29 € of margin against one open trade
tying up 9,15 €, and 0 € free when about 140 € was.

Read the margin instead of deriving it. `marginSummary.totalMarginUsed` reports
10.708233 and the spot USDC balance shows exactly 10.708233 on `hold` — two
endpoints, one answer, and `parseSpotBalances` returns that second reading as
`heldValue` so they can be compared. `withdrawable` is then the pot minus the
margin, which keeps `withdrawable + totalMarginUsed === equity` true; an
identity that has to hold is one a wrong number cannot hide in.

Note this breaks the `looksUnified` heuristic in `parse.ts`, which infers a
unified account from `withdrawable` exceeding the perps equity. That was true of
the account which exposed it and is not true of this one. It survives only as a
fallback for when `userAbstraction` cannot be reached — never prefer it.

## Adding a platform touches four places

`PLATFORM_LABELS` puts it in the picker, `PLATFORM_SETUP` says what it needs,
`NEEDS_SECRET` decides whether the credential is encrypted, and the `switch` in
`actions/connections.ts` builds the connector. Three out of four is worse than
none: the platform is offered, accepted and saved, then throws "No connector
for platform" on the first sync, far from anything that explains it. Missing
`NEEDS_SECRET` is worse again — the secret is stored unencrypted, silently.

`lib/connectors/__tests__/wiring.test.ts` fails on any of those gaps.

### OKX: `code` is a string, and `"0"` is truthy

Every reply is `{code, msg, data}` where `code` is text. Success is `"0"`, so
`if (!code)` is false on success *and* on failure, and `if (code)` is true on
both — a truthiness test gives the wrong answer in both directions, and the
wrong answer is an account that appears to hold nothing. `okxError` compares
explicitly and runs before anything is parsed.

It also brought the third credential. OKX and KuCoin issue key + secret +
passphrase, all three required per request, so `account_connections` has an
`encrypted_passphrase` column — its own column rather than JSON packed into
`encrypted_secret`, because structure hidden inside a blob is structure nobody
can query. `PLATFORM_SETUP.needsPassphrase` drives the form, and
`wiring.test.ts` fails if a platform declares one without the form asking for
it or without `connectorFor` passing it on.

### Binance: compose a symbol, never decompose one

The mirror image of the Kraken rule, from the same principle — use the
direction the venue defines.

`symbol === baseAsset + quoteAsset` holds for every one of Binance's 3 645 spot
symbols, checked against the live `exchangeInfo`, so composing `BTC` + `USDT`
is exact. Splitting is not: eight real symbols decompose two ways against
Binance's own quote list — `BTCBUSD` is (BTC, BUSD) and also reads as
(BTCB, USD). Anything splitting a symbol to learn what it prices is right most
of the time and silently wrong for those.

`exchangeInfo` is 16.65 MB and `ticker/price` is 153 KB, which is why prices
come from the ticker and symbols are composed rather than resolved.

**It reads the Spot wallet only**, and says so on the connection screen.
Funding, Simple Earn and Futures are separate wallets with separate endpoints;
a partial total presented as a whole one is the failure this codebase removes
most often, so the gap is stated rather than hidden.

### MEXC: the same API as Binance, the opposite error sign

MEXC copied Binance's v3 spot API endpoint for endpoint. `/api/v3/account`,
`/api/v3/ticker/price`, HMAC-SHA256 over the query string — all identical, which
is why those shapes live in `connectors/spotV3.ts` and both connectors import
them instead of holding a copy each. Only two things are MEXC's own, and both
are places where assuming Binance gives the wrong answer without saying so.

**Binance's error codes are negative; MEXC's are positive.** `binanceError`
asks `code < 0`, so on a MEXC refusal it returns `null` — no error. The payload
is then parsed for balances, `{balances:[...]}` is absent, nothing is found, and
**the account reads as holding nothing**. A wrong key would look like an emptied
exchange and net worth would drop silently. Confirmed against the live API with
a deliberately invalid key: HTTP 400, `{"code":10072,"msg":"Api key info
invalid"}`. `mexcError` therefore tests for the *presence* of a numeric `code`
with a `msg`, not its sign, treating only the documented sentinels 0 and 200 as
success — erring toward reporting an error, because a sync that stops loudly
leaves the last good balance alone while one that succeeds emptily overwrites it.

This is the third costume of the same bug: OKX's `"0"` is truthy, Kraken's
errors arrive with HTTP 200, MEXC's codes are positive. **A venue's error shape
is the last thing to assume is portable.**

**The key format differs too.** MEXC keys are `mx0…` and about thirty
characters; Binance's `isValidApiKey` demands forty and would have rejected
every valid MEXC key at the form, before the venue ever saw it — which looks
like the key being wrong rather than like the check being wrong.

The composition rule holds here as well: `symbol === baseAsset + quoteAsset` for
all 2 071 spot symbols, zero exceptions, checked against the live
`exchangeInfo`. **Spot wallet only** — Futures is a separate API on a separate
host, and the earn products are separate again; the connection screen says so.
`scripts/probe-mexc.mjs` is the way to check a real key without pasting one
anywhere.

### Kraken, and the two traps in it

**An error arrives with HTTP 200.** `{"error":["EAPI:Invalid key"],"result":{}}`
with a good status line. Checked only by status, a wrong key reads as an account
holding nothing. `krakenError` is called before anything is parsed.

**A pair is named by the venue.** DOGE's asset code is `XXDG` and its dollar
pair is `XDGUSD`; `XXDGZUSD` does not exist. Pair names are read from
`AssetPairs` and joined on base/quote, never constructed — the Hyperliquid
lesson in a different costume, and this one was confirmed against the live API
rather than guessed at.

## Trade Republic

There is no connector and there must not be one built from a login. See
`docs/trade-republic.md` — the short version is that the only public route is a
reverse-engineered client using a phone number and PIN, which would make this
the one connector holding credentials that can move money. The official CSV
export covers it instead, and automatic syncing is reserved for a licensed
aggregator.

## Secrets

`.env` holds `DATABASE_URL` (Neon), `APP_PASSWORD`, and `ENCRYPTION_KEY`.
`ENCRYPTION_KEY` decrypts the stored Bybit and IBKR API credentials — change it
and those connections stop working, with no way back. It is gitignored; keep it
that way, and don't echo it into logs or commit messages.

## The user

Writes in Portuguese, isn't a developer, and runs commands in `cmd.exe` on
Windows. Give complete commands with absolute paths, never `path/to/your/file`
placeholders — those get pasted literally. Explain what changed in terms of what
he'll see on screen, not in terms of the files you touched.

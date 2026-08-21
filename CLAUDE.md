# Money OS — what will bite you

A personal finance app. Next.js App Router, TypeScript, Drizzle, PostgreSQL (Neon).
Single user, password-gated by `src/proxy.ts`. No API routes except `/api/sync`.

Everything below is here because it has already gone wrong at least once. Read it
before changing anything; none of it is style preference.

## The map

| Where | What | Rule |
| ----- | ---- | ---- |
| `src/lib/**` | 73 modules of pure logic — accounting, portfolio, quotes, csv, fx, connectors, stats | no DB, no `fetch`, no React |
| `src/actions/**` | 25 server-action modules; every database access | `"use server"`, async exports only |
| `src/app/(app)/**` | pages, server components by default | |
| `src/components/**` | 48 components; `"use client"` only where it earns it | |
| `src/db/schema.ts` | one file, the whole schema | migrations generated, never written |
| `drizzle/` | 32 migrations + `meta/_journal.json` | the journal is what makes them run |

The arbiters — the modules that decide what a number means — are
`lib/accounting/networth.ts`, `lib/accounting/balanceScope.ts`,
`lib/portfolio/holdingSource.ts` and `lib/portfolio/reconstruct.ts`. If a total
looks wrong, it is almost always because something computed it outside one of
these rather than because one of them is wrong.

## Never hand-write a migration

`drizzle-kit migrate` reads `drizzle/meta/_journal.json`. A `.sql` file with no
journal entry is **skipped silently** — the app then fails at runtime with
`column "x" does not exist`, which looks like a code bug and isn't.

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

This has now been fixed in eight places. When adding a sum, the question is not
"are these the same currency" but "what converts them".

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
npx vitest run          # 1480+ tests; all must pass
npx eslint src          # 0 errors; a few warnings are pre-existing
npm run build
npm run db:generate     # must say "No schema changes"
```

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

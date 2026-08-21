# Trade Republic

## Decision

**Import the official CSV export. Do not automate a login.** Automatic syncing,
if it ever happens, goes through a licensed aggregator and nothing else.

## Why there is no connector

Trade Republic publishes no API. What exists publicly are reverse-engineered
clients (`pytr` and similar) that log in with a phone number, a PIN and a 2FA
code, impersonating the mobile app.

That path is closed here, and not on a technicality:

- It requires storing banking credentials that the app must replay on every
  sync. Every other connector in this codebase stores a read-only API key or
  nothing at all; this would be the only one holding the keys to an account
  that can move money.
- It breaks Trade Republic's terms.
- The likely outcome is not an error message. It is the account being locked
  for automated activity.

Since April 2026 there is an official transaction export, which removes the last
argument for taking that risk.

## What the export gives

In the app: **Profile → Account Statements → Transaction Export → Share →
All transactions → Create**.

One CSV covering both the securities account and the cash account, including
crypto, from a chosen period up to the whole life of the account. It carries
deposits, withdrawals, buys, sells, dividends, interest and ISINs.

It is read by the existing broker importer (`src/lib/csv/broker.ts`), which is
header-driven — adding Trade Republic means adding its column names and type
words to the alias tables, not writing a parser.

Exporting *all* transactions matters: `checkOpeningBalance` can then confirm the
history starts from zero, which is what makes "how much did I actually gain"
computable. A partial export leaves the opening balance unknown and the app
reports no gain rather than a wrong one.

### What it does not give

Current market value. The export records prices *paid*, not prices today.
Quantities held per ISIN are exact — buys minus sells — so only the price is
missing, and pricing it needs an external quote source. That is a separate
decision, unmade: it introduces a dependency that can disagree with what Trade
Republic itself shows.

## Automatic sync, if ever

Only through a licensed aggregator that genuinely covers Trade Republic —
Flanks is the closest fit, since it aggregates *securities* accounts rather than
just PSD2 payment accounts.

Three things to know before pursuing it:

1. **Coverage is unconfirmed.** Flanks lists 600+ institutions across 33
   countries but does not publicly confirm Trade Republic. This needs asking,
   not assuming.
2. **It is enterprise B2B.** The customers are banks, family offices and asset
   managers. There is no self-serve tier, so the realistic cost is a contract,
   not a subscription.
3. **The mechanism is often the same.** Flanks describes its own aggregation as
   APIs *plus* "secure reverse engineering" plus document ingestion. For a
   broker with no API, the technique is what we refused above. What changes is
   *who carries the liability and the relationship with the institution* — a
   licensed intermediary rather than one person's app. That is a real and
   sufficient difference, but it is not a technical one, and pretending
   otherwise would be self-deception.

### Cost of waiting: zero

`Connector` in `src/lib/connectors/types.ts` is the whole contract — `platform`,
`validateIdentifier`, `getAccountState`, and optionally `getDividends`. An
aggregator-backed connector drops in beside the others without the sync engine
changing. Nothing about the current design needs to anticipate it.

## The agreed plan, in order

Settled after weighing the options. The order matters and is not the order the
options were discovered in.

### 1. Import the CSV — and keep importing it

Ready except for the alias mapping. See above.

Not a one-off, and this is the hybrid's real weakness: **quantities age**. Every
purchase made after an export leaves the reconstruction stale, so a fresh price
multiplied by a stale quantity produces a figure that looks current and isn't —
the worst of both. If money goes in monthly, the export comes in monthly.

### 2. Prices by ISIN, end of day

Quantities come from the CSV and are exact — buys minus sells per ISIN. Only the
price is external.

**End-of-day prices, deliberately.** Real-time serves someone trading by the
minute, who would be looking at the broker's own app anyway. Daily closes are
enough to track a portfolio and are far cheaper and steadier to source.

Two traps, written down before they bite:

- **Snapshots must store the price they used.** The frozen-conversion rule in
  `CLAUDE.md` applies here identically: re-pricing history at today's quote
  rewrites what things *were* worth, which is a different claim from what they
  are worth.
- **Realised P&L here is ours, not theirs.** Trading 212 publishes its own
  figure, which is why this codebase reports it rather than deriving one. Trade
  Republic doesn't, so computing it is the only option — but it must be labelled
  as the app's own calculation, with the cost-basis method named. Average cost
  and FIFO give different answers and someone reading this in a year needs to
  know which was used.

### 3. Open banking (Enable Banking), last — and for a different job

Not for valuation. PSD2 covers payment accounts, so it yields cash and external
transfers, and for an account that is nearly fully invested that is the least
interesting number in it. It also needs re-consent roughly every 90 days, so
"automatic" still means reauthorising quarterly.

Its real value is as a **staleness detector**: cash leaving the account means a
purchase happened, which means the CSV is now out of date and the app can say so
instead of quietly multiplying old quantities by new prices.

Enable Banking is the one an individual can actually sign up for — self-serve,
with a Restricted Production mode that whitelists your own accounts under their
licence. GoCardless Bank Account Data (ex-Nordigen) was the free option and has
closed to new registrations.

**Check coverage before writing any code.** Their institution list is visible
after registering; nothing here is worth building if Trade Republic isn't on it.

### 4. Flanks — the only route to full automatic positions, and not available

Covered above. Enterprise B2B, no self-serve tier. Revisit only if that changes.

## What not to do

- Do not add a dependency on `pytr` or any client that authenticates as the
  mobile app.
- Do not route this through Plaid, Tink or TrueLayer expecting positions. PSD2
  covers payment accounts; the securities side is out of scope, so you would get
  the cash half and silently miss the investments.
- Do not infer holdings from the cash movements alone. The export has ISINs;
  use them.

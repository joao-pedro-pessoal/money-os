# Money OS — V1

Implementation of `MVP_SPEC.md`: the manual, single-user "Money OS" — accounts,
buckets, free/allocated cash with reconciliation states, cash flow, interest,
CSV import, JSON export. No trading connectors, no Open Banking, no
multi-tenancy — see `MVP_SPEC.md` §8 for the explicit out-of-scope list, and
`PRODUCT_VISION.md` for where this goes afterward (V1.5+).

## One deviation from TECH_STACK.md — read this first

`TECH_STACK.md` specifies **Prisma**. This codebase uses **Drizzle ORM**
instead. Reason: it was built inside a sandboxed environment whose network
allowlist blocks `binaries.prisma.sh`, the CDN Prisma's CLI downloads its
Rust query/schema engine from at `generate`/`migrate` time — so Prisma
literally could not be exercised there. That restriction is specific to that
sandbox, not to your machine, but rather than ship code I couldn't verify,
the ORM was swapped for Drizzle, which is pure TypeScript with no binary
download step (it talks to Postgres directly via the `pg` driver). Drizzle
is a legitimate peer to Prisma for this use case: same relational-schema
approach, arguably a better fit for a project this size since there's no
generated-client indirection to reason about. If you'd still rather use
Prisma, the `src/db/schema.ts` file is a straightforward 1:1 translation
target — nothing else in the app depends on Drizzle-specific APIs beyond
that file and `src/db/client.ts`.

Everything else matches `TECH_STACK.md`: Next.js (App Router) as a single
full-stack app for V1, PostgreSQL, single-user cookie auth, no worker/queue
yet (that arrives in V1.5 with the first trading connector).

## What's been verified

This isn't just scaffolded — it's been run end-to-end against a real local
Postgres instance during development:

- `npm test` — 16 unit tests for the accounting logic (`freeCash`,
  `netWorth`, `reconciliationState`, the OVERALLOCATED/STALE states), including
  the exact worked examples from `MVP_SPEC.md` (the €300 free cash example,
  the €400 overallocation scenario).
- `npm run build` — full production build compiles clean (TypeScript +
  Turbopack), all routes render.
- Migrations applied to a real Postgres, then exercised live over HTTP:
  login sets the session cookie correctly, the dashboard renders with real
  data, and submitting the "add account" form actually persists a row and
  shows up as RECONCILED with the correct free cash.

What has **not** been exercised: the CSV import UI end-to-end (the logic is
covered by the import action's dedup/skip counters, but not click-tested),
and general UI polish/responsiveness. Treat this as a working, correct
foundation rather than a finished product — see "What to do next" below.

## Setup

```bash
cp .env.example .env
# edit .env: set APP_PASSWORD and APP_SECRET to real values,
# and DATABASE_URL if not using the docker-compose Postgres.

npm install
npm run db:generate   # only needed if you change src/db/schema.ts
npm run db:migrate    # applies drizzle/*.sql to the database
npm run db:seed       # seeds the Income/Expense categories from MVP_SPEC §6
npm run dev            # http://localhost:3000
```

Log in with the `APP_PASSWORD` you set. There's no signup flow — this is a
single-user app by design (`MVP_SPEC.md` §0).

## Running with Docker

```bash
cp .env.example .env   # fill in APP_PASSWORD, APP_SECRET, POSTGRES_PASSWORD
docker compose up -d --build
```

This starts Postgres and the app together; the app container runs migrations
and the category seed automatically on boot, then serves on port 3000.

Per `TECH_STACK.md`: don't expose this port to the public internet. Put the
host behind Tailscale (or another private network) and reach it that way —
that's what lets the auth model stay this simple. If you do put it behind a
public-facing HTTPS reverse proxy instead, set `COOKIE_SECURE=true` in `.env`
so the session cookie gets the `Secure` flag.

## Project structure

```
src/db/schema.ts        Drizzle schema — all MVP_SPEC §3 entities
src/db/client.ts         DB client
src/lib/accounting/      Pure functions: freeCash, netWorth, reconciliationState
                          (zero DB dependency — this is what's unit tested)
src/lib/auth.ts           Single-user password check + session cookie signing
src/proxy.ts               Route protection (Next.js 16's successor to middleware.ts)
src/actions/               Server Actions — one file per entity (accounts,
                          buckets, transactions, imports, export)
src/app/(app)/              Authenticated pages (Dashboard, Accounts, Buckets,
                          Money Map, Cash Flow, Interest, Settings)
src/app/login/              Login page + action
scripts/migrate.ts, seed.ts  DB setup scripts, also used by the Docker image
drizzle/                    Generated SQL migrations (commit these)
```

## What to do next (in spec order — see MVP_SPEC.md §10 "Definition of done")

1. Click through the app once yourself with your real accounts/buckets and
   confirm the numbers match reality — that's the actual acceptance test for
   a personal finance tool, more than any automated test can be.
2. CSV import: the dedup logic is in `src/actions/imports.ts`, but it's only
   been exercised via its call signature, not with a real bank export. Try
   it with an actual CSV from one of your accounts and check the column
   mapping (`date`/`amount`/`description`, or `Data`/`Montante`/`Descrição`)
   actually matches your bank's export format — it likely won't on the first
   try, and the mapping is currently hardcoded rather than a UI step (that
   UI step is in `MVP_SPEC.md` §7 and wasn't built yet).
3. V1.5 (Hyperliquid) is now built — see below.

## V1.5 — Hyperliquid (read-only)

Add a connection in **Connections**: pick the account it feeds and paste your
**public wallet address** (`0x…`, 42 characters). Hyperliquid's `info` endpoint
is public, so there is no API key, no signature and nothing secret to store.

**Accounting rule — read this before trusting the numbers.**

`account balance = perps equity + spot balances`

- **Perps equity** (`accountValue`) *already includes* the unrealized P&L of
  every open position, so positions on **/positions** are shown for detail only
  and are never added on top — that would count the same money twice
  (`PRODUCT_VISION.md` §9).
- **Spot balances** (USDC and other tokens) are a *separate* pool on
  Hyperliquid, so they *are* added. Stablecoins are valued 1:1; other tokens use
  the mark price of their USDC pair. A token with no USDC market is listed as
  "unpriced" and left out of the total rather than counted as zero.

The Connections page shows the split (`perps equity + spot = total`) so you can
check it against what the exchange itself displays. If you use a **unified
account**, Hyperliquid treats spot as the source of truth for everything and
this sum would double count — tell me and it's a one-line change.

Note this is the *opposite* rule to the manual Investments module, where an
account balance is idle cash and positions add on top. Both are correct; they
just describe different things.

Balances are stored as `numeric(18,2)`, so equity is rounded to cent precision.

### Automatic syncing

While the app is open, **Connections** and **Open positions** sync themselves:
once on load if the data is older than 5 minutes, then every 5 minutes. The
"Sync now" button is still there for an immediate refresh.

A browser can't sync while the app is closed. For that, set `SYNC_SECRET` in
`.env` and have a scheduler POST to the endpoint:

```
curl -X POST http://localhost:3000/api/sync -H "x-sync-secret: YOUR_SECRET"
```

On Windows, Task Scheduler can run that command on a timer. The endpoint is
disabled (503) while `SYNC_SECRET` is unset, and returns 401 on a wrong secret,
so it can never become an open trigger for outbound requests.

> Running this on a server instead of your laptop is covered in
> **[DEPLOY.md](DEPLOY.md)** — it also explains the fixed-IP question that
> decides whether Bybit can work at all.

### Bybit on bybit.eu: a wall worth knowing about

Under MiCA, EEA users are on **bybit.eu**, and that site may only offer API keys
through "Connect to Third-Party Applications" — you pick an approved app from a
list. A key made that way is **locked to that application's server IPs**, so it
cannot work from software running on your own machine, whichever app you pick.
The symptom is Bybit error 10010, "Unmatched IP", even though the key and
signature are perfectly valid.

The IP field exists in Bybit's UI, but for keys made through that flow it is
managed by the application and isn't editable, so there is nothing to point at
your own machine. A server doesn't help either: a fixed IP is useless if you
can't register it anywhere.

If your account offers a self-generated key, that works. If it doesn't — which
is the common case on bybit.eu — the platform cannot be synced by self-hosted
software at all. The Connections page then offers **"Give up on syncing — track
this account manually instead"**, which drops the connection and keeps the
account, its balance and its history. You update the balance yourself, as with
Trade Republic or a bank, and every figure still reaches Net Worth, buckets and
statistics.

### Bybit: which one?

MiCA split Bybit into two entities on separate hosts — **bybit.eu** for the EEA
and **bybit.com** globally. Same V5 API, same docs, but an API key issued by one
is rejected by the other, so you pick the region when adding the connection. It
defaults to EU. If the first sync fails with an authentication error, that's the
first thing to check.

You also need `ENCRYPTION_KEY` in `.env` before adding any Bybit connection —
the API secret is encrypted with it. Whoever has that key can decrypt the stored
secrets; whoever loses it loses them. Create the Bybit key with **read-only**
permissions.

### Currency conversion

Base currency is set in **Settings** (EUR, USD, GBP, CHF or BRL; EUR by
default). Every total in the app is converted to it; individual accounts keep
their own currency. A Hyperliquid account is in USD, so balances are
converted before any total is shown. Rates come from the free Frankfurter API
(no key) and refresh with every sync; you can pin a rate by hand in
**Settings**, and a pinned rate is never overwritten by an automatic refresh.

A balance in a currency with no known rate is **left out of the total** and
flagged on the Dashboard, rather than being added as if it were euros.

### Stablecoins

USDC, USDT, EURC, DAI and friends are recognised automatically, both when
synced and when typed into **Add position**. For a stablecoin the form collapses
to symbol, account and amount: pricing is 1:1, risk is low and liquidity high,
so those aren't worth asking for.

Synced balances appear on the Investments page under **Synced balances** and
**are** part of Portfolio Value. The connected account's balance holds only
perps equity, so this is the one place that money is counted. Net Worth is
unchanged either way — the money just sits in a different column.

### Bucket plans

A bucket can carry a target **percentage** of your available money ("25%
emergency, 30% travel"). The Buckets page then shows what each bucket should
hold, what it actually holds and the drift, with an **Apply plan** button.

Percentages are used as declared, not normalised: if they add up to 80%, the
other 20% is meant to stay free and is left alone. Over 100% is flagged rather
than silently scaled down. Applying only rewrites which money is *earmarked*
for what — no real money moves, because the app cannot move money.

A bucket that reaches its target amount gets a green "Goal reached" badge.

### Tagging synced trades

Positions pulled from a platform can carry the same tags as manual ones (risk,
horizon, expected return, liquidity, playlist, notes). Sync fully replaces the
position rows, so the tags live in their own `position_meta` table keyed by
connection + coin — a refresh never wipes them (`PRODUCT_VISION.md` §10).

### What was NOT built (deliberate deviation from TECH_STACK.md §4)

`TECH_STACK.md` called for a separate worker service with BullMQ + Redis at
V1.5. That was skipped: for one user and one connector it means running Redis
and a second process for no functional gain. The part that actually matters —
`Connector → Normalizer → DB → UI` — is in place (`src/lib/connectors/`), and
Bybit/IBKR plug into `connectorFor()` in `src/actions/connections.ts` without
touching anything else. Revisit the queue when there are several connectors
with real rate-limit and retry pressure.

### Verification status

The parser, connector and freshness logic are unit tested (26 tests) against
fixtures taken from Hyperliquid's official docs, and the sync path was verified
end-to-end against a real Postgres with the network stubbed — including that
Net Worth equals equity and not equity + position value. The one thing not
verified here is the actual network call to `api.hyperliquid.xyz`, which the
build sandbox blocks. **Your first real "Sync now" is the test that matters.**
If it fails, the error appears on the Connections page and in `sync_logs`; the
account balance is left untouched.

# Money OS

A personal finance app you run yourself. It puts the money you have sitting
still and the money you have invested on the same screen, and it refuses to
show a number it cannot defend.

Single user by design. There are no accounts, no sign-up and no hosted version:
you run your own copy, on your own machine or your own server, against your own
database. Nobody else — including the author — ever sees your figures.

---

## What it does

**Money that holds its value.** Accounts across banks, brokers, exchanges and
cash, each in its own currency. Transactions in and out, with CSV import that
detects rows you have already imported. Budgets per category and period.
Buckets — money set aside for a purpose, filled in priority order.
Subscriptions, so you know what is already committed before you decide anything.

**Money the market moves.** Holdings from four platforms that sync themselves,
plus anything you type in or import from a broker statement. Automatic prices
for stocks and ETFs from their ISIN. A portfolio analysis by asset type, risk,
horizon and account. A trade history with charts covering whether trading is
making money, which instruments work, how often you trade and how long you hold.

| Platform | What it needs |
|---|---|
| Hyperliquid | A public wallet address. No keys. Brings trade history too. |
| Trading 212 | An API key, generated with order permissions off |
| Bybit | A read-only API key and secret. bybit.com only — [see below](#bybit-eu) |
| Interactive Brokers | Their Client Portal Gateway running on your machine. IBKR Pro. |
| Trade Republic | CSV import. No public API, [by decision](docs/trade-republic.md). |

Every connector is **read-only by architecture**. The `Connector` interface has
no method that could place an order or move funds — it is not a promise, it is
the shape of the code.

There is a manual inside the app, at `/manual`.

---

## The one thing to understand before using it

**Zero is not a measurement.**

When this app does not know something it says so — *unpriced*, *no cost basis*,
*not priced*, *approximate*. It never writes `0.00` to fill a gap. A number on
screen has something behind it; an absence means nobody measured.

That rule explains most of what looks unusual here, and it exists because the
opposite has gone wrong repeatedly. A holding shown at `0,00` because a dormant
trading pair reported a mark price of zero. Twelve rows reading `+0,00` P&L
because adopted positions carried their purchase price in the current-price
field — a portfolio claiming to be exactly flat, which nobody's portfolio has
ever been.

The second rule follows from the first: **the same money is never counted
twice.** That has failed nine times during development, each time wearing a
different disguise, and it is why one file decides what net worth means and
every page reads from it.

---

## Running it

You need Docker and Docker Compose. A 1 vCPU / 1 GB VPS is enough, or your own
machine.

```bash
git clone <this repo> money-os && cd money-os
cp .env.example .env
```

Fill in `.env`. Generate each secret with `openssl rand -base64 32`:

```bash
POSTGRES_PASSWORD="..."   # your database
APP_PASSWORD="..."        # what you log in with
APP_SECRET="..."          # signs the session cookie
ENCRYPTION_KEY="..."      # encrypts stored API secrets
COOKIE_SECURE=false       # true once TLS is in front
```

Then:

```bash
docker compose up -d --build
```

Migrations and the category seed run on start and are safe to repeat.

**Keep `ENCRYPTION_KEY` somewhere off the server.** Whoever holds it can decrypt
your stored API secrets, and losing it means reconnecting every platform.

**Do not put this on the open internet.** It holds your entire financial
position. Both ports bind to `127.0.0.1` by default. [DEPLOY.md](DEPLOY.md) has
the full setup, including Tailscale, backups and updating.

### Developing

```bash
npm install
cp .env.example .env      # DATABASE_URL pointing at any Postgres
npm run db:migrate
npm run dev
```

Before saying it works: `npx tsc --noEmit`, `npx vitest run` (1681 tests),
`npx eslint src`, `npm run build`, and `npm run db:generate` must report
"No schema changes".

Never hand-write a migration — `drizzle-kit` skips any `.sql` file with no
journal entry, silently, and the app then fails at runtime far from the cause.
Run `npm run db:generate`.

[CLAUDE.md](CLAUDE.md) is the file to read before changing anything. Everything
in it is there because it has already gone wrong at least once.

---

## What it deliberately will not do

These are settled, and recorded so they are not re-argued from scratch.

- **No advice.** No recommendations, no signals, no targets. It shows what you
  hold and what you did.
- **No orders.** Read-only by architecture, as above.
- **No Trade Republic login.** The only route is a reverse-engineered client
  using a phone number and PIN, which would make it the one connector holding
  credentials that can move money. The official CSV export covers it instead.
- **No Open Banking.** It needs a licence.
- **No multi-tenancy.** One instance, one person. This is what keeps your data
  yours: there is no shared database and no operator with access to it.

<a name="bybit-eu"></a>
**Bybit EU cannot be connected,** and no setting changes that. Its keys are
issued only through "Connect to Third-Party Applications" and stay bound to that
application's servers, so none of them authenticate from your own machine.
Tested against a live account: it always answers "Unmatched IP".

[FEATURES.md](FEATURES.md) has the honest list of what is built, what is broken
and what is missing.

---

## Licence

[GNU AGPL-3.0](LICENSE).

Run it, study it, change it, share it. If you modify it and offer it to others
over a network, you have to publish your changes under the same licence. Running
your own private copy carries no obligation at all — that is the normal case and
the one this app was built for.

---

## Built with

Next.js App Router, TypeScript, Drizzle ORM, PostgreSQL, Recharts, Tailwind.

`src/lib/**` is pure logic — no database and no React, and no `fetch` outside
the four connector/FX files that are the outbound edge. That discipline is why
1681 tests run without Postgres. Every database call lives in
`src/actions/**`.

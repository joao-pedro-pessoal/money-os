# Money OS

Project status and the single task list: [TAREFAS.md](TAREFAS.md).

**On your phone:** the Android app in [android-shell/](android-shell/) opens this
site from your own computer over your home Wi-Fi, with every feature — see
[On your phone](#on-your-phone) below, and [docs/APP_ANDROID.md](docs/APP_ANDROID.md)
(in Portuguese) to install and run it.

**Native mobile development:** [mobile/README.md](mobile/README.md) contains a
separate Android/iOS app with encrypted on-device storage and direct read-only
broker connections. It needs device testing before store distribution. The
instructions below describe the existing self-hosted web application.

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
Buckets — money set aside for a purpose, filled in priority order. A monthly
report for any month — income, spending by category against the month before,
budgets, largest expenses and what net worth did — as a page, a CSV or a PDF.
Subscriptions, so you know what is already committed before you decide anything —
and on each charge day the expense is proposed for you to record, match with one
already imported, or skip; never added behind your back.

**Money the market moves.** Holdings from eight platforms that sync themselves,
plus anything you type in or import from a broker statement. Automatic prices
for stocks and ETFs from their ISIN, with historical exchange rates. A portfolio
analysis by asset type, risk, horizon and account. Playlists — your own groups of
positions — with the positions inside each one and how the group is doing. A
dividends page with what was paid, by instrument and by year, and when the next
payment is likely. A trade history with a daily P&L calendar, account and P&L
evolution, result by kind of trade, which instruments work, how often you trade
and how long you hold.

**Everyday use.** Quick entry for an expense or income in a few taps, with undo.
Savings from discounts and cashback recorded against the purchase. Expected
money still to come. Alerts inside the app. The interface language can be
changed; financial names and data are never translated.

| Platform | What it needs | Status |
|---|---|---|
| Hyperliquid | A public wallet address. No keys. Brings trade history too. | Used with a real account |
| Trading 212 | An API key, generated with order permissions off | Used with a real account |
| Bybit | A read-only API key and secret. bybit.com only — [see below](#bybit-eu) | Used with a real account |
| Interactive Brokers | Their Client Portal Gateway running on your machine. IBKR Pro. | Used with a real account |
| MEXC | A read-only API key and secret. Spot and futures. | Used with a real account |
| Kraken | An API key with *Query Funds* only | Built and tested; not yet checked against a real account |
| Binance | An API key with *Enable Reading* only. Spot wallet. | Built and tested; not yet checked against a real account |
| OKX | A read-only API key, secret and passphrase | Built and tested; not yet checked against a real account |
| Trade Republic | CSV import. No public API, [by decision](docs/trade-republic.md). | CSV |

Every connector is **read-only by architecture**. The `Connector` interface has
no method that could place an order or move funds — it is not a promise, it is
the shape of the code.

There is a manual inside the app, at `/manual`.

<a name="on-your-phone"></a>
### On your phone

The Android app (version 0.7.2, [android-shell/](android-shell/)) is this same site
in a full-screen WebView, reached on the computer that runs it over home Wi-Fi. It
adds what a browser tab would: choosing files to import, saving exports to
Downloads, the back gesture.

- **A phone layout.** Below 768 px: a bottom menu, cards instead of wide tables,
  panels that open only when they matter, and two modes — **Simple** (the
  essentials) and **Complex** (all options). On a computer nothing changes.
- **Record an expense in one tap.** A home-screen widget, two shortcuts on the app
  icon, a *Record expense* tile in the quick settings panel and an optional
  notification all open the quick entry form. Nothing is saved until you press
  Save there, so its undo and duplicate protection still apply.
- **Widgets with figures.** Money OS (net worth and this month), Net worth over
  time, Where the money is, Cash flow, Investments (every position, with P&L in
  money and percent, in a list that scrolls), Allocation, Winners & losers,
  Dividends and Open trades — plus a *Net worth* tile that stays blank while the
  phone is locked. They read `GET /api/widget`, which sits behind the same session
  as every page and is built from the same functions as the pages it summarises.
- **Alerts as notifications.** Switched on in Settings inside the app: what the
  bell would show — a budget over or running ahead, a subscription charging or
  waiting to be confirmed, a stale balance, a failing connection, a watchlist price
  reached — arrives once as a notification. The phone asks `GET /api/alerts` about
  every half hour; the site decides what is worth an interruption. No push service
  and no email account, so nothing leaves your computer and phone — and nothing
  arrives while the phone cannot reach the computer.
- **What stays on the phone:** only the last figures the widgets read, so they
  can show something — always with its time — away from home. No keys, no
  password.
- **Limits:** home Wi-Fi only, with the computer on; plain http on the local
  network; no offline mode; a debug build, not in any store.

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
git clone https://github.com/joao-pedro-pessoal/money-os.git && cd money-os
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

**Where your API keys live.** In this web app they are stored in your database,
encrypted with AES-256-GCM. The key that decrypts them is `ENCRYPTION_KEY`, which
exists only in `.env` and never enters the database — so a copy of the database
alone, including one kept by a hosted Postgres provider, cannot read them. They
are **not** kept on a single device: the phone app opens the site and stores no
keys at all, and its widgets read figures through the session, never a key. Keys that never leave one device exist only in the separate native
app in [mobile/](mobile/), which is not the app in daily use; bringing that
model to this experience is planned, not built (see [TAREFAS.md](TAREFAS.md), E02).

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

Before saying it works: `npx tsc --noEmit`, `npx vitest run` (2421 tests),
`npx eslint src`, `npm run build`, and `npm run db:generate` must report
"No schema changes".

Never hand-write a migration — `drizzle-kit` skips any `.sql` file with no
journal entry, silently, and the app then fails at runtime far from the cause.
Run `npm run db:generate`.

[CLAUDE.md](CLAUDE.md) is the file to read before changing anything. Everything
in it is there because it has already gone wrong at least once.

---

## What it deliberately will not do

Before offering the app to other people, follow the [legal, privacy and security
release checklist](docs/LEGAL_SECURITY_CHECKLIST.md). It covers read-only broker
permissions, device-only API keys, GDPR, user warnings, security testing,
contracts, incident response and evidence to retain.

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
all 2421 tests run without Postgres. Every database call lives in
`src/actions/**`.

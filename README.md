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
3. Once V1 feels solid on real data for a few weeks, move to V1.5
   (`PRODUCT_VISION.md` roadmap): HyperliquidConnector, which is where the
   sync engine / normalizer architecture actually gets introduced.

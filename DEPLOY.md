# Deploying Money OS

Running this on a small server instead of your laptop buys three things:

1. **Syncing while the app is closed.** A browser can only sync while a tab is
   open. The scheduler container calls `POST /api/sync` on a timer.
2. **A fixed IP address**, which is what some exchanges demand — see below.
3. **Access from your phone**, without leaving a PC switched on.

## The fixed-IP problem (read this before paying for anything)

Bybit rejects a request whose source IP isn't on the key's allowlist — error
`10010`, "Unmatched IP". A home connection fails twice over: its address isn't
on any list, and most ISPs change it periodically. A server has one address that
never moves, which you can register once.

So a deployment **may** unblock Bybit. Whether it actually does depends on one
thing worth checking before you spend a cent:

> Open Bybit → API Management → your key → Edit, and see whether there is an
> **IP restriction** field you can type an address into.

- **There is a field** → deploy, then put the server's IP there. This works.
- **There is no field, only the "Connect to Third-Party Applications" dropdown**
  → the key is bound to that application's servers and no address of yours will
  ever match. At that point the only route is Bybit's Broker Program, which
  means being an approved third party yourself: a registered company, KYB, and
  a business case built on trading volume that a read-only tracker doesn't
  generate. Track the account manually instead — the app supports it, and every
  figure still reaches Net Worth.

Hyperliquid has no such restriction; its read endpoint is public.

## What you need

A small VPS is enough — 1 vCPU and 1 GB RAM handles this comfortably. Hetzner
or DigitalOcean at roughly €5/month. Docker and Docker Compose installed.

## Setup

```bash
git clone <your repo> money-os && cd money-os
cp .env.example .env
```

Fill in `.env`:

```bash
POSTGRES_PASSWORD="a long random string"
APP_PASSWORD="the password you'll log in with"
APP_SECRET="a long random string"        # signs the session cookie
ENCRYPTION_KEY="a long random string"    # encrypts stored API secrets
SYNC_SECRET="a long random string"       # enables scheduled syncing
SYNC_INTERVAL_SECONDS=900                # every 15 minutes
COOKIE_SECURE=false                      # true once TLS is in front
```

Generate each one with:

```bash
openssl rand -base64 32
```

Then:

```bash
docker compose up -d --build
```

Migrations run automatically on start and are safe to repeat.

**Keep `ENCRYPTION_KEY` somewhere outside the server.** Whoever has it can
decrypt your stored API secrets; losing it means reconnecting every platform.

## Do not put this on the open internet

It holds your entire financial position. Both ports bind to `127.0.0.1`, so
nothing is exposed by default. Pick one of:

- **Tailscale** (recommended). Install it on the server and your devices, and
  reach the app at `http://<tailscale-name>:3000`. Nothing is public, so there
  is no login page for anyone to find, let alone attack. This is what
  `TECH_STACK.md` §6 recommends.
- **Caddy or nginx** with a real domain and TLS, if you want to reach it from a
  device you can't put Tailscale on. Then set `COOKIE_SECURE=true`. Be aware
  that the app has a single password and no rate limiting, so this option puts a
  guessable door on the public internet.

## Finding the server's public IP

```bash
curl -s https://api.ipify.org
```

That is the address to register with an exchange.

## Backups

The database lives in a Docker volume, which a rebuilt server does not keep.
Two layers:

- **In-app**: Settings → Backup & export → full JSON. Do this before any risky
  change; restoring it is a supported path.
- **On the host**, scheduled:

```bash
docker compose exec -T db pg_dump -U moneyos moneyos > backup-$(date +%F).sql
```

## Updating

```bash
git pull
docker compose up -d --build
```

## Checking it works

```bash
docker compose logs -f app         # startup and migrations
docker compose logs -f scheduler   # should print "sync: 200" on each run
```

A `sync: 401` means `SYNC_SECRET` differs between the app and the scheduler; a
`503` means it isn't set at all.

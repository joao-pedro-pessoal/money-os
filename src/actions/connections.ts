"use server";

import { db } from "@/db/client";
import { isCurrencyCode, toBase } from "@/lib/fx";
import { getRates } from "@/actions/fx";
import {
  accountConnections,
  accounts,
  positions,
  positionSnapshots,
  platformBalances,
  positionMeta,
  dividendPayments,
  playlists,
  syncLogs,
  auditLog,
} from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createHyperliquidConnector } from "@/lib/connectors/hyperliquid";
import { createBybitConnector } from "@/lib/connectors/bybit";
import { createIbkrConnector, discoverIbkrAccounts } from "@/lib/connectors/ibkr";
import { createTrading212Connector } from "@/lib/connectors/trading212";
import { encryptSecret, decryptSecret, maskSecret } from "@/lib/crypto";
import { freshnessOf } from "@/lib/connectors/freshness";
import { marginView, describePressure } from "@/lib/connectors/margin";
import { refreshRates } from "./fx";
import type { Connector } from "@/lib/connectors/types";
import { NEW_ACCOUNT, PLATFORM_LABELS, bybitBaseUrl, BYBIT_REGIONS } from "@/lib/connectors/constants";
import { listAccountUsage } from "./accounts";
import { writeSnapshot } from "./snapshots";
import { suggestAssetType, assetTypeOnSync } from "@/lib/portfolio/assetType";
import { pickReusable, isAbandoned } from "@/lib/accounting/abandoned";

/**
 * An empty account left behind by an earlier attempt at the same platform.
 *
 * Connecting used to insert a new account unconditionally, so every failed
 * API key produced another zero-balance row that never went away.
 */
async function findAbandonedAccount(institution: string): Promise<string | null> {
  const usage = await listAccountUsage();
  return pickReusable(usage, institution)?.id ?? null;
}

/**
 * Registry of available connectors. Adding a platform is a case here plus its
 * own folder in src/lib/connectors — the sync engine is untouched.
 *
 * `secret` is the already-decrypted credential, passed only to platforms that
 * need one.
 */
function connectorFor(
  platform: string,
  externalId: string,
  secret: string | null,
  region: string | null = null
): Connector {
  switch (platform) {
    case "hyperliquid":
      // Public read endpoint — no credential exists to leak.
      return createHyperliquidConnector();
    case "ibkr":
      // Talks to a gateway running on this machine, not to IBKR — so there is
      // no credential to store, and none to leak.
      return createIbkrConnector();
    case "bybit":
      if (!secret) throw new Error("This Bybit connection has no stored API secret");
      // A key issued by bybit.eu is rejected by bybit.com and vice versa.
      return createBybitConnector(
        { apiKey: externalId, apiSecret: secret },
        undefined,
        bybitBaseUrl(region)
      );
    case "trading212":
      // The secret is optional at the protocol level but mandatory here: if
      // Trading 212 issued you one, storing only half the pair would fail on
      // the first sync with an authentication error that says nothing useful.
      if (!secret) throw new Error("This Trading 212 connection has no stored API secret");
      return createTrading212Connector({ apiKey: externalId, apiSecret: secret });
    default:
      throw new Error(`No connector for platform "${platform}"`);
  }
}

/** Platforms whose credentials must be encrypted before being stored. */
const NEEDS_SECRET = new Set(["bybit", "trading212"]);

/**
 * Whether secret storage is usable at all.
 *
 * Checked by the page so a missing key is explained up front, rather than
 * crashing on submit after the user has typed their credentials in.
 */
export async function canStoreSecrets(): Promise<boolean> {
  return Boolean(process.env.ENCRYPTION_KEY && process.env.ENCRYPTION_KEY.length >= 16);
}

function masterKey(): string {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) {
    throw new Error(
      "ENCRYPTION_KEY is not set. It's required to store API secrets — add a long random string to .env."
    );
  }
  return key;
}

export async function listConnections() {
  const [conns, allAccounts] = await Promise.all([
    db.select().from(accountConnections),
    db.select().from(accounts),
  ]);
  const accountName = new Map(allAccounts.map((a) => [a.id, a.name]));

  return conns.map((c) => {
    // The encrypted secret must never reach a page prop; only a masked hint.
    const { encryptedSecret, ...safe } = c;
    return {
      ...safe,
      hasSecret: encryptedSecret !== null,
      externalIdMasked: maskSecret(c.externalId),
      accountName: accountName.get(c.accountId) ?? "(unknown account)",
      freshness: freshnessOf({ lastSyncAt: c.lastSyncAt, lastSyncStatus: c.lastSyncStatus }),
      // Equity is not availability: with open positions part of it backs the
      // margin. We stored both figures and showed neither.
      margin: (() => {
        const view = marginView({
          equity: Number(c.lastEquity ?? 0),
          marginUsed: c.lastMarginUsed === null ? null : Number(c.lastMarginUsed),
          withdrawable: c.lastWithdrawable === null ? null : Number(c.lastWithdrawable),
        });
        return { ...view, note: describePressure(view) };
      })(),
    };
  });
}

export async function listPositionsForConnection(connectionId: string) {
  const rows = await db.select().from(positions).where(eq(positions.connectionId, connectionId));
  return rows.map(parsePositionRow);
}

export async function listAllPositions() {
  const [rows, conns, allAccounts, meta, allPlaylists] = await Promise.all([
    db.select().from(positions),
    db.select().from(accountConnections),
    db.select().from(accounts),
    db.select().from(positionMeta),
    db.select().from(playlists),
  ]);
  const accountName = new Map(allAccounts.map((a) => [a.id, a.name]));
  const platformOf = new Map(conns.map((c) => [c.id, c.platform]));
  /**
   * Every figure on a position is in the platform's own currency.
   *
   * Trading 212 reports euros, Hyperliquid dollars. Any page summing these
   * without converting is adding euros to dollars, which is the fourth bug in
   * this codebase's history and the reason the currency now travels with the
   * row rather than being assumed by whoever reads it.
   */
  const currencyOf = new Map(conns.map((c) => [c.id, c.reportingCurrency ?? "USD"]));
  const playlistName = new Map(allPlaylists.map((p) => [p.id, p.name]));
  // Tags live in their own table keyed by connection + coin so a sync, which
  // fully replaces `positions`, never wipes them.
  const metaFor = new Map(meta.map((m) => [`${m.connectionId}:${m.coin}`, m]));

  return rows.map((r) => {
    const m = metaFor.get(`${r.connectionId}:${r.coin}`);
    return {
      ...parsePositionRow(r),
      accountName: accountName.get(r.accountId) ?? "—",
      platform: platformOf.get(r.connectionId) ?? "—",
      currency: currencyOf.get(r.connectionId) ?? "USD",
      riskLevel: m?.riskLevel ?? null,
      expectedReturn: m?.expectedReturn ?? null,
      timeHorizon: m?.timeHorizon ?? null,
      liquidity: m?.liquidity ?? null,
      assetType: m?.assetType ?? null,
      assetTypeAuto: m?.assetTypeAuto ?? false,
      apr: m?.apr === null || m?.apr === undefined ? null : Number(m.apr),
      playlistId: m?.playlistId ?? null,
      playlistName: m?.playlistId ? playlistName.get(m.playlistId) ?? null : null,
      notes: m?.notes ?? null,
    };
  });
}

/**
 * Saves manual tags on an automatically-synced position.
 * Upserted on (connectionId, coin) so it survives every future sync.
 */
export async function setPositionTags(formData: FormData) {
  const connectionId = String(formData.get("connectionId"));
  const coin = String(formData.get("coin"));
  const value = (field: string) => {
    const v = String(formData.get(field) ?? "").trim();
    return v === "" ? null : v;
  };

  const assetType = value("assetType");

  const values = {
    riskLevel: value("riskLevel"),
    expectedReturn: value("expectedReturn"),
    timeHorizon: value("timeHorizon"),
    liquidity: value("liquidity"),
    assetType,
    /**
     * Absent field clears the rate, same rule as `setHoldingTags`: the form
     * hides this input for types with no income model, and a rate that no
     * longer applies would still be projected as income.
     */
    apr: (() => {
      const raw = String(formData.get("apr") ?? "").trim();
      if (raw === "") return null;
      const n = Number(raw);
      return Number.isFinite(n) && n >= 0 ? String(n) : null;
    })(),
    /**
     * Only a real choice locks the type.
     *
     * This used to be `false` unconditionally, which meant saving *any* tag —
     * a risk level, a playlist — silently froze the asset type at whatever the
     * dropdown happened to show. Leaving it on "unset" then wrote null and
     * disabled the detection for good, so the type you'd just seen appear went
     * away and never came back.
     *
     * Leaving it unset now means "you decide", and the next sync fills it in.
     */
    assetTypeAuto: assetType === null,
    playlistId: value("playlistId"),
    notes: value("notes"),
    updatedAt: new Date(),
  };

  await db
    .insert(positionMeta)
    .values({ connectionId, coin, ...values })
    .onConflictDoUpdate({
      target: [positionMeta.connectionId, positionMeta.coin],
      set: values,
    });

  revalidatePath("/positions");
}

function parsePositionRow(r: typeof positions.$inferSelect) {
  return {
    ...r,
    size: Number(r.size),
    entryPrice: r.entryPrice === null ? null : Number(r.entryPrice),
    markPrice: r.markPrice === null ? null : Number(r.markPrice),
    positionValue: r.positionValue === null ? null : Number(r.positionValue),
    unrealizedPnl: r.unrealizedPnl === null ? null : Number(r.unrealizedPnl),
    returnOnEquity: r.returnOnEquity === null ? null : Number(r.returnOnEquity),
    leverage: r.leverage === null ? null : Number(r.leverage),
    liquidationPrice: r.liquidationPrice === null ? null : Number(r.liquidationPrice),
    marginUsed: r.marginUsed === null ? null : Number(r.marginUsed),
    cumFunding: r.cumFunding === null ? null : Number(r.cumFunding),
  };
}

export async function listBalances() {
  const [rows, conns, allAccounts] = await Promise.all([
    db.select().from(platformBalances),
    db.select().from(accountConnections),
    db.select().from(accounts),
  ]);
  const accountName = new Map(allAccounts.map((a) => [a.id, a.name]));
  const accountOf = new Map(conns.map((c) => [c.id, c.accountId]));
  /**
   * The column is named `usdValue` and the value is not always in dollars.
   *
   * Trading 212 reports euros. Every caller that read this list and assumed USD
   * was wrong by the exchange rate — a figure that looks right and is out by
   * 15 %. The currency travels with the number from here on, so a caller has to
   * work at ignoring it.
   */
  const currencyOf = new Map(conns.map((c) => [c.id, c.reportingCurrency ?? "USD"]));

  return rows.map((b) => {
    /**
     * A cash balance is denominated in itself.
     *
     * The platform's reporting currency is right for a token — an amount of
     * BTC is worth so many dollars because Interactive Brokers reports in
     * dollars. It is wrong for cash: 1.75 EUR held at a dollar-reporting broker
     * is 1.75 euros, not 1.75 dollars. It was displayed as "1,75 US$", which is
     * a real amount of the wrong money, and the euro sitting at Trading 212
     * looked correct only because that platform happens to report in euros.
     */
    const platform = currencyOf.get(b.connectionId) ?? "USD";
    const currency = isCurrencyCode(b.coin) ? b.coin.toUpperCase() : platform;

    return {
    ...b,
    total: Number(b.total),
    hold: b.hold === null ? 0 : Number(b.hold),
    price: b.price === null ? null : Number(b.price),
    usdValue: b.usdValue === null ? null : Number(b.usdValue),
    /** What `usdValue` and `price` are actually denominated in. */
    currency,
    available: Number(b.total) - (b.hold === null ? 0 : Number(b.hold)),
    accountName: accountName.get(accountOf.get(b.connectionId) ?? "") ?? "—",
    };
  });
}

export async function getSyncLogs(connectionId: string, limit = 10) {
  return db
    .select()
    .from(syncLogs)
    .where(eq(syncLogs.connectionId, connectionId))
    .orderBy(desc(syncLogs.startedAt))
    .limit(limit);
}

export async function createConnection(formData: FormData) {
  let accountId = String(formData.get("accountId") ?? "").trim();
  const platform = String(formData.get("platform") ?? "hyperliquid").trim();
  // Identifiers — wallet addresses, API keys, account ids — never contain
  // whitespace or quotes, and a copy-paste routinely drags along a trailing
  // space or a non-breaking one. Those are invisible in an input box, so
  // stripping them here turns a baffling rejection into a working connection.
  let externalId = String(formData.get("externalId") ?? "")
    .replace(/[\s ​]/g, "")
    .replace(/^["']|["']$/g, "");
  const label = String(formData.get("label") ?? "").trim() || null;

  if (!accountId) throw new Error("Pick the account this connection feeds");

  const apiSecret = String(formData.get("apiSecret") ?? "").trim();
  const rawRegion = String(formData.get("region") ?? "").trim();
  // Only a known region is ever stored, so no arbitrary host can be reached.
  const region =
    platform === "bybit"
      ? (BYBIT_REGIONS.find((r) => r.value === rawRegion)?.value ?? BYBIT_REGIONS[0].value)
      : null;
  if (NEEDS_SECRET.has(platform) && !apiSecret) {
    throw new Error("This platform needs an API secret as well as a key");
  }

  // IBKR's gateway already knows which account it is signed into, so asking
  // the user is an invitation to type the login username instead. Left blank,
  // it is discovered.
  if (platform === "ibkr" && externalId === "") {
    const accounts = await discoverIbkrAccounts();
    if (accounts.length === 0) {
      throw new Error("The IBKR gateway is logged in but reports no accounts.");
    }
    if (accounts.length > 1) {
      throw new Error(
        `This gateway sees several accounts (${accounts
          .map((a) => a.accountId)
          .join(", ")}). Enter the one you want.`
      );
    }
    externalId = accounts[0].accountId;
  }

  const connector = connectorFor(platform, externalId, apiSecret || null, region);
  const check = connector.validateIdentifier(externalId);
  if (!check.ok) throw new Error(check.reason);

  // Encrypted before it goes anywhere near the database.
  const encryptedSecret = apiSecret ? encryptSecret(apiSecret, masterKey()) : null;

  // A platform you're connecting for the first time usually has no Account
  // yet, so offer to create it here rather than forcing a detour to /accounts.
  // Balance starts at 0 and is overwritten by the first sync with real equity.
  if (accountId === NEW_ACCOUNT) {
    const institution = PLATFORM_LABELS[platform] ?? platform;
    // IBKR is a broker whose base currency is usually the user's own; the
    // crypto venues settle in USD-denominated stablecoins.
    const isBroker = platform === "ibkr";

    /**
     * Reuse an abandoned account for the same platform instead of adding
     * another. A connection that failed to authenticate leaves behind an empty
     * account, and retrying used to create a second, a third… which then clutter
     * the dashboard and flatten the net-worth chart with zeroes.
     *
     * Only an account that is genuinely untouched qualifies: same institution,
     * zero balance, and nothing else pointing at it.
     */
    const reusable = await findAbandonedAccount(institution);
    if (reusable) {
      accountId = reusable;
    } else {
      const [created] = await db
        .insert(accounts)
        .values({
          institution,
          name: label ?? institution,
          accountType: isBroker ? "broker" : "exchange",
          currency: isBroker ? "EUR" : "USD",
          balance: "0",
        })
        .returning();
      accountId = created.id;
    }
  }

  const [c] = await db
    .insert(accountConnections)
    .values({ accountId, platform, region, externalId, label, encryptedSecret })
    .returning();

  await db.insert(auditLog).values({
    entityType: "connection",
    entityId: c.id,
    action: "connection_created",
    details: JSON.stringify({ platform, accountId }),
  });

  revalidatePath("/connections");
  revalidatePath("/accounts");
}

export async function deleteConnection(formData: FormData) {
  const id = String(formData.get("id"));

  const [conn] = await db.select().from(accountConnections).where(eq(accountConnections.id, id));

  await db.insert(auditLog).values({
    entityType: "connection",
    entityId: id,
    action: "connection_deleted",
  });
  // Positions and logs cascade — they're derived data, not user input.
  await db.delete(accountConnections).where(eq(accountConnections.id, id));

  /**
   * Take the account too if the connection never left anything behind.
   *
   * Removing a connection that failed to authenticate used to leave its
   * auto-created account sitting at zero forever, which is how the dashboard
   * ended up listing the same platform twice. Checked AFTER the delete so the
   * connection just removed doesn't count as a reason to keep it, and only
   * when the account is empty by every measure — a real balance or a single
   * transaction is enough to keep it.
   */
  if (conn) {
    const usage = await listAccountUsage();
    const account = usage.find((u) => u.id === conn.accountId);
    if (account && isAbandoned(account)) {
      await db.delete(accounts).where(eq(accounts.id, account.id));
      await db.insert(auditLog).values({
        entityType: "account",
        entityId: account.id,
        action: "empty_account_removed_with_connection",
        details: JSON.stringify({ name: account.name, institution: account.institution }),
      });
    }
  }

  revalidatePath("/connections");
  revalidatePath("/positions");
  revalidatePath("/accounts");
  revalidatePath("/");
}

/**
 * Gives up on syncing a platform and keeps it as a manual account.
 *
 * Some platforms simply cannot be read by self-hosted software — bybit.eu only
 * issues API keys bound to its approved applications' servers, so no key of
 * yours works from your own machine or your own server. Rather than leaving a
 * permanent error on the page, this drops the connection and leaves the account
 * intact, to be updated by hand like a bank.
 */
export async function convertToManual(formData: FormData) {
  const id = String(formData.get("id"));

  const [conn] = await db.select().from(accountConnections).where(eq(accountConnections.id, id));
  if (!conn) throw new Error("Connection not found");

  await db.insert(auditLog).values({
    entityType: "connection",
    entityId: id,
    action: "converted_to_manual",
    details: JSON.stringify({ platform: conn.platform, lastError: conn.lastSyncError }),
  });

  // Positions, balances and logs cascade; the account and its balance stay.
  await db.delete(accountConnections).where(eq(accountConnections.id, id));

  revalidatePath("/connections");
  revalidatePath("/positions");
  revalidatePath("/accounts");
  redirect(`/accounts/${conn.accountId}`);
}

export async function syncConnectionAction(formData: FormData) {
  const id = String(formData.get("id"));
  // A synced account is often in another currency, and a balance with no
  // exchange rate is excluded from every total. Refreshing first means the
  // first manual sync of a new connection lands in Net Worth straight away.
  await refreshRates();
  await syncConnection(id, "manual");
  revalidatePath("/connections");
  revalidatePath("/positions");
  revalidatePath("/");
}

/**
 * Pulls the current state from the platform and writes it locally.
 *
 * ACCOUNTING RULE (PRODUCT_VISION §9): `equity` already contains the unrealized
 * P&L of every open position, so it is written to `accounts.balance` and the
 * positions are stored purely for display. Nothing here adds position value on
 * top of the balance — doing so would count the same money twice.
 *
 * Never throws: a failure is recorded on the connection and in the sync log so
 * the UI can show ERROR rather than silently presenting stale data as live.
 */
export async function syncConnection(connectionId: string, trigger: "manual" | "scheduled" = "manual") {
  const [conn] = await db
    .select()
    .from(accountConnections)
    .where(eq(accountConnections.id, connectionId));

  if (!conn) throw new Error("Connection not found");

  const startedAt = new Date();

  try {
    const secret = conn.encryptedSecret ? decryptSecret(conn.encryptedSecret, masterKey()) : null;
    const connector = connectorFor(conn.platform, conn.externalId, secret, conn.region);
    const state = await connector.getAccountState(conn.externalId);

    // 1. Account balance = perps equity ONLY.
    //    Equity already contains the unrealized P&L of open positions, so
    //    positions are never added to it. Spot balances are a separate pool
    //    and are counted in Portfolio Value instead (see
    //    getPortfolioContribution) — deliberately NOT here, or the same money
    //    would land in Net Worth twice.
    const total = Math.round((state.equity + Number.EPSILON) * 100) / 100;

    await db
      .update(accounts)
      .set({
        balance: String(total),
        /**
         * The platform decides its own currency.
         *
         * An account created before this was read could be sitting on the
         * wrong one — a Trading 212 account marked USD while every figure in it
         * is euros. The platform is the authority here, so the sync corrects it
         * rather than leaving a silent 15% error in every conversion.
         */
        currency: state.currency,
        lastManualUpdate: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(accounts.id, conn.accountId));

    // Freezes the exchange rate of the moment along with the balance, so the
    // net-worth chart shows what this was worth then, not what it is worth now.
    const [syncedAccount] = await db.select().from(accounts).where(eq(accounts.id, conn.accountId));
    await writeSnapshot(conn.accountId, total, syncedAccount?.currency ?? "USD");

    /**
     * Distributions received, added rather than replaced.
     *
     * Unlike balances and positions, this is history: a dividend paid in 2024
     * is still true today, and the platform may stop returning it once it
     * falls out of the window it serves. Deleting and reinserting would lose
     * exactly the old payments the cadence is inferred from.
     *
     * Deduplicated on the platform's own reference. A failure here never fails
     * the sync — the balance is what the app is for.
     */
    if (connector.getDividends) {
      try {
        const paid = await connector.getDividends();
        if (paid.length > 0) {
          await db
            .insert(dividendPayments)
            .values(
              paid.map((d) => ({
                connectionId: conn.id,
                accountId: conn.accountId,
                ticker: d.ticker,
                instrumentName: d.instrumentName,
                isin: d.isin,
                paidOn: d.paidOn,
                quantity: d.quantity === null ? null : String(d.quantity),
                grossPerShare: d.grossPerShare === null ? null : String(d.grossPerShare),
                amount: String(d.amount),
                currency: d.currency,
                type: d.type,
                reference: d.reference,
              }))
            )
            .onConflictDoNothing();
        }
      } catch (e) {
        // Recorded, not raised: losing the dividend history is a gap in a
        // report; losing the sync is a wrong Net Worth.
        await db.insert(syncLogs).values({
          connectionId: conn.id,
          status: "warning",
          trigger: "dividends",
          message: e instanceof Error ? e.message.slice(0, 500) : "Could not read dividends",
        });
      }
    }

    // 2. Spot balances, fully replaced (a spent token stops being returned).
    await db.delete(platformBalances).where(eq(platformBalances.connectionId, conn.id));
    if (state.balances.length > 0) {
      await db.insert(platformBalances).values(
        state.balances.map((b) => ({
          connectionId: conn.id,
          coin: b.coin,
          total: String(b.total),
          hold: String(b.hold),
          price: b.price === null ? null : String(b.price),
          usdValue: b.usdValue === null ? null : String(b.usdValue),
          countsInPortfolio: state.balancesAreSeparatePool,
          updatedAt: new Date(),
        }))
      );
    }

    // 3. Replace the position set. Closed positions simply stop being returned
    //    by the API, so a full replace is what makes them disappear here too.
    await db.delete(positions).where(eq(positions.connectionId, conn.id));

    if (state.positions.length > 0) {
      await db.insert(positions).values(
        state.positions.map((p) => ({
          connectionId: conn.id,
          accountId: conn.accountId,
          coin: p.coin,
          side: p.side,
          size: String(p.size),
          entryPrice: p.entryPrice === null ? null : String(p.entryPrice),
          markPrice: p.markPrice === null ? null : String(p.markPrice),
          positionValue: p.positionValue === null ? null : String(p.positionValue),
          unrealizedPnl: p.unrealizedPnl === null ? null : String(p.unrealizedPnl),
          returnOnEquity: p.returnOnEquity === null ? null : String(p.returnOnEquity),
          leverage: p.leverage === null ? null : String(p.leverage),
          leverageType: p.leverageType,
          liquidationPrice: p.liquidationPrice === null ? null : String(p.liquidationPrice),
          marginUsed: p.marginUsed === null ? null : String(p.marginUsed),
          cumFunding: p.cumFunding === null ? null : String(p.cumFunding),
          updatedAt: new Date(),
        }))
      );

      await db.insert(positionSnapshots).values(
        state.positions.map((p) => ({
          connectionId: conn.id,
          coin: p.coin,
          markPrice: p.markPrice === null ? null : String(p.markPrice),
          positionValue: p.positionValue === null ? null : String(p.positionValue),
          unrealizedPnl: p.unrealizedPnl === null ? null : String(p.unrealizedPnl),
        }))
      );

      /**
       * Fill in what each position IS, from what the platform calls it.
       *
       * Only where the mapping is certain, and only where you haven't chosen
       * already — `assetTypeOnSync` returns null for anything it shouldn't
       * touch. A wrong type here would quietly move money between the
       * guaranteed and market-exposed columns, so silence beats a guess.
       */
      const existingMeta = await db
        .select()
        .from(positionMeta)
        .where(eq(positionMeta.connectionId, conn.id));

      for (const p of state.positions) {
        const mine = existingMeta.find((m) => m.coin === p.coin);
        const decision = assetTypeOnSync({
          existing: mine?.assetType ?? null,
          existingWasAuto: mine?.assetTypeAuto ?? true,
          suggestion: suggestAssetType({
            platform: conn.platform,
            assetClass: p.assetClass,
            coin: p.coin,
            instrumentName: p.instrumentName ?? null,
          }),
        });
        if (!decision) continue;

        await db
          .insert(positionMeta)
          .values({
            connectionId: conn.id,
            coin: p.coin,
            assetType: decision.value,
            assetTypeAuto: decision.auto,
          })
          .onConflictDoUpdate({
            target: [positionMeta.connectionId, positionMeta.coin],
            set: { assetType: decision.value, assetTypeAuto: decision.auto, updatedAt: new Date() },
          });
      }
    }

    await db
      .update(accountConnections)
      .set({
        lastSyncAt: new Date(),
        lastSyncStatus: "ok",
        lastSyncError: null,
        lastEquity: String(state.equity),
        lastSpotValue: String(state.spotValue),
        lastWithdrawable: state.withdrawable === null ? null : String(state.withdrawable),
        lastMarginUsed: state.totalMarginUsed === null ? null : String(state.totalMarginUsed),
        // What the platform says you have actually realised, all-time. Only
        // stored where the platform states it — never derived here, because a
        // figure we computed would quietly disagree with the broker's own.
        // What the platform's own numbers are denominated in, so nothing
        // downstream has to guess.
        reportingCurrency: state.currency,
        lastRealizedPnl: state.realizedPnl === null || state.realizedPnl === undefined
          ? null
          : String(state.realizedPnl),
        updatedAt: new Date(),
      })
      .where(eq(accountConnections.id, conn.id));

    await db.insert(syncLogs).values({
      connectionId: conn.id,
      startedAt,
      finishedAt: new Date(),
      status: "ok",
      positionsFound: String(state.positions.length),
      equity: String(total),
      trigger,
    });

    return {
      ok: true as const,
      equity: state.equity,
      spotValue: state.spotValue,
      total,
      positions: state.positions.length,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    await db
      .update(accountConnections)
      .set({ lastSyncStatus: "error", lastSyncError: message, updatedAt: new Date() })
      .where(eq(accountConnections.id, conn.id));

    await db.insert(syncLogs).values({
      connectionId: conn.id,
      startedAt,
      finishedAt: new Date(),
      status: "error",
      message,
      trigger,
    });

    return { ok: false as const, error: message };
  }
}

/** Fire-and-forget sync of every connection, for the AutoSync client component. */
export async function autoSyncAction() {
  // Refresh FX first so converted totals use today's rate, not yesterday's.
  await refreshRates();
  await syncAllConnections("scheduled");
  revalidatePath("/connections");
  revalidatePath("/positions");
  revalidatePath("/");
}

/** Syncs every active connection. Used by the schedulable route. */
export async function syncAllConnections(trigger: "manual" | "scheduled" = "scheduled") {
  const conns = await db.select().from(accountConnections).where(eq(accountConnections.active, true));
  const results = [];
  for (const c of conns) {
    results.push({ id: c.id, platform: c.platform, ...(await syncConnection(c.id, trigger)) });
  }
  return results;
}

/**
 * What each connected account actually holds on its platform.
 *
 * The stored `balance` is perps equity only — spot lives in Portfolio Value —
 * so an account whose money is all in USDC reads as 0, which looks broken even
 * though Net Worth is right. This gives the display layer the real figure
 * without changing what anything counts.
 */
export async function getAccountPlatformTotals() {
  const [conns, balances, pos, rates] = await Promise.all([
    db.select().from(accountConnections),
    db.select().from(platformBalances),
    db.select().from(positions),
    getRates(),
  ]);

  const byAccount = new Map<
    string,
    {
      equity: number;
      spot: number;
      /** The part of `spot` that is money beside the equity, not inside it. */
      spotOnTop: number;
      total: number;
      unrealizedPnl: number;
      positions: number;
      /** Free to trade with: equity minus what's backing open positions. */
      available: number;
      marginUsed: number;
    }
  >();

  for (const c of conns) {
    const mineBalances = balances.filter((b) => b.connectionId === c.id);

    /**
     * Coin balances split by whether they are money *beside* the account's
     * value or a breakdown *of* it. The connector states which — see
     * `balancesAreSeparatePool`, stored per balance as `countsInPortfolio`.
     *
     * The total used to add every balance to the equity unconditionally, which
     * double counted every platform that reports its cash as part of its own
     * total: Trading 212's free cash (0.13 counted twice), IBKR's EUR (1.75),
     * and — since Hyperliquid moved to a unified account — its entire USDC
     * balance, which is why that account read 109.91 against the venue's 92.49.
     */
    /**
     * Converted before adding, because a cash row is in its own currency.
     *
     * The stored value for a EUR balance is an amount of euros, and this total
     * is denominated in the platform's reporting currency. Adding them raw made
     * IBKR's 1.75 EUR into 1.75 USD — the same mistake, in miniature, as the
     * five currency-mixing sums fixed earlier: small here only because the
     * balance is small.
     */
    const platformCurrency = c.reportingCurrency ?? "USD";
    const valueIn = (b: (typeof mineBalances)[number]): number => {
      if (b.usdValue === null) return 0;
      const from = isCurrencyCode(b.coin) ? b.coin.toUpperCase() : platformCurrency;
      return toBase(Number(b.usdValue), from, rates, platformCurrency) ?? 0;
    };

    const spotOnTop = mineBalances
      .filter((b) => b.countsInPortfolio)
      .reduce((sum: number, b) => sum + valueIn(b), 0);
    const spotInside = mineBalances
      .filter((b) => !b.countsInPortfolio)
      .reduce((sum: number, b) => sum + valueIn(b), 0);

    // Shown as the cash part of the account, wherever it lives.
    const spot = spotOnTop + spotInside;

    const mine = pos.filter((p) => p.connectionId === c.id);
    const unrealizedPnl = mine.reduce(
      (s, p) => s + (p.unrealizedPnl === null ? 0 : Number(p.unrealizedPnl)),
      0
    );

    const equity = Number(c.lastEquity ?? 0);
    const existing = byAccount.get(c.accountId);

    // Equity is not availability. Open positions lock part of it as margin, so
    // "free" here means what could actually back a new trade — the spot pool
    // is separate money and adds on top.
    const view = marginView({
      equity,
      marginUsed: c.lastMarginUsed === null ? null : Number(c.lastMarginUsed),
      withdrawable: c.lastWithdrawable === null ? null : Number(c.lastWithdrawable),
    });

    byAccount.set(c.accountId, {
      equity: round2((existing?.equity ?? 0) + equity),
      spot: round2((existing?.spot ?? 0) + spot),
      spotOnTop: round2((existing?.spotOnTop ?? 0) + spotOnTop),
      // Only money that sits outside the account's own value is added to it.
      total: round2((existing?.total ?? 0) + equity + spotOnTop),
      unrealizedPnl: round2((existing?.unrealizedPnl ?? 0) + unrealizedPnl),
      positions: (existing?.positions ?? 0) + mine.length,
      // Same rule for availability: cash already inside the equity is inside
      // the platform's own withdrawable figure too, so adding it double counts.
      available: round2((existing?.available ?? 0) + view.available + spotOnTop),
      marginUsed: round2((existing?.marginUsed ?? 0) + view.marginUsed),
    });
  }

  return byAccount;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

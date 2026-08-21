import {
  listAllPositions,
  listBalances,
  listConnections,
  autoSyncAction,
  setPositionTags,
} from "@/actions/connections";
import { listPlaylists } from "@/actions/playlists";
import { listHoldingsWithPnL, setHoldingTags } from "@/actions/investments";
import HoldingTagsForm from "@/components/HoldingTagsForm";
import QuoteSymbolField from "@/components/QuoteSymbolField";
import RefreshPrices from "@/components/RefreshPrices";
import PositionTagsForm from "@/components/PositionTagsForm";
import AutoSync from "@/components/AutoSync";
import { Money } from "@/components/PrivacyContext";
import PageTabs from "@/components/PageTabs";
import { INVESTMENT_TABS } from "@/lib/navigation";
import Link from "next/link";
import { getRates } from "@/actions/fx";
import { getBaseCurrency } from "@/actions/settings";
import { toBase } from "@/lib/fx";
import { displaySymbol } from "@/lib/quotes/symbolSource";

/** A form action may not return a value. */
async function saveHoldingTags(formData: FormData) {
  "use server";
  await setHoldingTags(formData);
}

export default async function PositionsPage() {
  const [positions, balances, connections, playlistList, manual, rates, base] = await Promise.all([
    listAllPositions(),
    listBalances(),
    listConnections(),
    listPlaylists(),
    /**
     * Positions you keep yourself, including every one rebuilt from a
     * statement.
     *
     * This page was only ever about connectors, so a broker with no API — the
     * exact case a statement exists for — had nothing here at all. They are
     * held positions like any other and belong on the page called "Open
     * positions & balances".
     */
    listHoldingsWithPnL(),
    getRates(),
    getBaseCurrency(),
  ]);

  const lastSyncAt = connections
    .map((c) => c.lastSyncAt)
    .filter((d): d is Date => d !== null)
    .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;

  /**
   * These four totals used to add every platform's figures together and label
   * the result "USD".
   *
   * Trading 212 reports euros and Hyperliquid reports dollars, so the sum was
   * euros added to dollars — a number in no currency at all, displayed with a
   * dollar sign. Everything is converted to the base currency first, and the
   * cards say which currency that is.
   */
  function sumInBaseCurrency<T extends { currency: string }>(
    rows: T[],
    pick: (row: T) => number
  ): number {
    const total = rows.reduce(
      (s, r) => s + (toBase(pick(r), r.currency, rates, base) ?? 0),
      0
    );
    return Math.round((total + Number.EPSILON) * 100) / 100;
  }

  const connectionTotals = connections.map((c) => ({
    currency: c.reportingCurrency ?? "USD",
    equity: Number(c.lastEquity ?? 0),
    spot: Number(c.lastSpotValue ?? 0),
    free: Number(c.lastWithdrawable ?? 0),
    margin: Number(c.lastMarginUsed ?? 0),
  }));

  const totalEquity = sumInBaseCurrency(connectionTotals, (c) => c.equity);
  const totalSpot = sumInBaseCurrency(connectionTotals, (c) => c.spot);
  const totalFree = sumInBaseCurrency(connectionTotals, (c) => c.free);
  const totalMargin = sumInBaseCurrency(connectionTotals, (c) => c.margin);

  /**
   * Coins the platform holds and nothing could price.
   *
   * Their value is missing from every total above, and a total that is quietly
   * short is worse than one that admits it — HYPE sat unpriced inside "Spot
   * balances" for as long as this page existed, and the card went on looking
   * like a complete answer.
   */
  const unpricedCoins = balances.filter((b) => b.price === null).map((b) => b.coin);

  const totalUnrealized = sumInBaseCurrency(positions, (p) => p.unrealizedPnl ?? 0);
  const totalNotional = sumInBaseCurrency(positions, (p) => p.positionValue ?? 0);

  return (
    <div className="space-y-6">
      <PageTabs tabs={INVESTMENT_TABS} />
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-lg font-semibold">Open positions &amp; balances</h1>
          <p className="text-xs text-[var(--muted)] mt-1">Live from your connected platforms.</p>
          {connections.length > 0 && (
            <div className="mt-1">
              <AutoSync syncAction={autoSyncAction} lastSyncAt={lastSyncAt ? lastSyncAt.toISOString() : null} />
            </div>
          )}
        </div>
        <Link href="/connections" className="btn whitespace-nowrap">
          Connections
        </Link>
      </div>

      {connections.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="card p-4">
            <div className="text-xs text-[var(--muted)] mb-1">Perps equity</div>
            <div className="text-xl font-semibold truncate">
              <Money value={totalEquity} currency={base} />
            </div>
            <div className="text-[10px] text-[var(--muted)] mt-1">includes open position P&amp;L</div>
          </div>
          <div className="card p-4">
            <div className="text-xs text-[var(--muted)] mb-1">Spot balances</div>
            <div className="text-xl font-semibold truncate">
              <Money value={totalSpot} currency={base} />
            </div>
            <div className="text-[10px] text-[var(--muted)] mt-1">
              {unpricedCoins.length === 0
                ? "counted in Investments, not here"
                : `${unpricedCoins.join(", ")} not priced, so not in this figure`}
            </div>
          </div>
          <div className="card p-4">
            <div className="text-xs text-[var(--muted)] mb-1">Free / withdrawable</div>
            <div className="text-xl font-semibold truncate text-[var(--green)]">
              <Money value={totalFree} currency={base} />
            </div>
          </div>
          <div className="card p-4">
            <div className="text-xs text-[var(--muted)] mb-1">Margin in use</div>
            <div className="text-xl font-semibold truncate text-[var(--amber)]">
              <Money value={totalMargin} currency={base} />
            </div>
          </div>
        </div>
      )}

      {balances.length > 0 && (
        <div className="card p-4">
          <div className="text-sm font-medium mb-3">Spot balances</div>
          <div className="overflow-x-auto">
            <table className="data-table whitespace-nowrap">
              <thead>
                <tr>
                  <th>Coin</th>
                  <th>Tags</th>
                  <th>Account</th>
                  <th className="text-right">Total</th>
                  <th className="text-right">Available</th>
                  <th className="text-right">Price</th>
                  <th className="text-right">Value</th>
                </tr>
              </thead>
              <tbody>
                {balances.map((b) => (
                  <tr key={b.id}>
                    <td className="font-medium">{b.coin}</td>
                    {/* A coin held on spot is taggable exactly like an open
                        trade, and until now it wasn't — so a HYPE balance had
                        no route to an asset type at all, while the Investments
                        table sent you here to set one. */}
                    <td className="whitespace-normal">
                      <PositionTagsForm
                        action={setPositionTags}
                        connectionId={b.connectionId}
                        coin={b.coin}
                        riskLevel={b.riskLevel}
                        expectedReturn={b.expectedReturn}
                        timeHorizon={b.timeHorizon}
                        liquidity={b.liquidity}
                        assetType={b.assetType}
                        assetTypeAuto={b.assetTypeAuto}
                        apr={b.apr}
                        playlistId={b.playlistId}
                        notes={b.notes}
                        playlists={playlistList}
                      />
                    </td>
                    <td>{b.accountName}</td>
                    <td className="text-right">{b.total}</td>
                    <td className="text-right">
                      {b.available}
                      {b.hold > 0 && (
                        <div className="text-xs text-[var(--muted)]">{b.hold} on hold</div>
                      )}
                    </td>
                    <td className="text-right">
                      {b.price === null ? (
                        <span className="text-[var(--muted)]">unpriced</span>
                      ) : (
                        <Money value={b.price} currency={b.currency} />
                      )}
                    </td>
                    <td className="text-right">
                      {b.usdValue === null ? "—" : <Money value={b.usdValue} currency={b.currency} />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Positions you keep yourself — typed in, or rebuilt from a statement.
          They were absent from this page entirely, which meant a broker with no
          API had nothing here at all and no way to tag anything. */}
      {manual.holdings.length > 0 && (
        <div className="card p-4">
          <div className="flex items-baseline justify-between gap-3 flex-wrap mb-1">
            <div className="text-sm font-medium">Your own positions</div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-[var(--muted)]">
                tag them here — no need to open each one
              </span>
              <RefreshPrices />
            </div>
          </div>
          <p className="text-xs text-[var(--muted)] mb-3">
            Kept by you rather than by a platform. Anything rebuilt from an imported statement starts
            here, at the price you actually paid.
          </p>

          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Symbol</th>
                  <th>Tags</th>
                  <th>Price from</th>
                  <th>Account</th>
                  <th className="text-right">Quantity</th>
                  <th className="text-right">Avg cost</th>
                  <th className="text-right">Price now</th>
                  <th className="text-right">Value</th>
                  <th className="text-right">Unrealized</th>
                </tr>
              </thead>
              <tbody>
                {manual.holdings.map((h) => (
                  <tr key={h.id}>
                    <td className="font-medium">
                      <Link href={`/investments/${h.id}`} className="hover:underline">
                        {h.symbol}
                      </Link>
                      {/* The ISIN, when a statement supplied one. */}
                      {h.name && h.name !== h.symbol && (
                        <div className="text-[10px] text-[var(--muted)]">{h.name}</div>
                      )}
                    </td>
                    <td>
                      <HoldingTagsForm
                        action={saveHoldingTags}
                        id={h.id}
                        riskLevel={h.riskLevel}
                        expectedReturn={h.expectedReturn}
                        timeHorizon={h.timeHorizon}
                        liquidity={h.liquidity}
                        assetType={h.assetType}
                        apr={h.apr}
                        playlistId={h.playlistId}
                        playlists={playlistList}
                      />
                    </td>
                    <td>
                      <QuoteSymbolField
                        id={h.id}
                        symbol={h.quoteSymbol}
                        currency={h.currency}
                        ticker={h.symbol}
                      />
                    </td>
                    <td className="text-xs">{h.accountName ?? "—"}</td>
                    <td className="text-right tabular-nums">{h.quantity}</td>
                    <td className="text-right tabular-nums">
                      <Money value={h.avgEntryPrice} currency={h.currency} />
                    </td>
                    <td className="text-right tabular-nums">
                      <Money value={h.currentPrice} currency={h.currency} />
                      {/* Where this number came from. A wrong listing produces
                          a real price for the wrong instrument, and the only
                          way to spot it is to see the price beside the source
                          and compare it with your broker's screen. */}
                      {displaySymbol(h.quoteSymbol) && (
                        <div className="text-[10px] text-[var(--muted)]">
                          {displaySymbol(h.quoteSymbol)}
                        </div>
                      )}
                    </td>
                    <td className="text-right tabular-nums">
                      <Money value={h.marketValue} currency={h.currency} />
                    </td>
                    <td
                      className="text-right tabular-nums"
                      style={{
                        color:
                          h.unrealizedPnL === 0
                            ? undefined
                            : h.unrealizedPnL > 0
                              ? "var(--green)"
                              : "var(--red)",
                      }}
                    >
                      {h.unrealizedPnL === 0 ? (
                        <span className="text-[var(--muted)]">—</span>
                      ) : (
                        <Money value={h.unrealizedPnL} currency={h.currency} />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-[10px] text-[var(--muted)] mt-3 leading-snug">
            A dash under Unrealized means the price still equals what you paid — nothing has been
            measured yet, rather than nothing having happened. Open a position to set its current
            price.
          </p>
        </div>
      )}

      <div className="card p-4 border-l-2" style={{ borderLeftColor: "var(--amber)" }}>
        <div className="text-sm">
          These positions are <span className="text-[var(--amber)]">already included</span> in each
          account&apos;s balance.
        </div>
        <div className="text-xs text-[var(--muted)] mt-1">
          The exchange reports account equity, which already contains the unrealized P&amp;L below, so position
          values are never added on top — that would count the same money twice. The account balance is
          <strong> the account&apos;s own value only</strong>; coin balances that sit outside it are a
          separate pool and are counted in{" "}
          <strong>Investments</strong> instead, so every euro lands in Net Worth exactly once.
        </div>
      </div>

      {positions.length === 0 ? (
        <div className="card p-8 text-center text-sm text-[var(--muted)]">
          {connections.length === 0
            ? "No connections yet — add one first."
            : "No open positions right now."}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="card p-4">
              <div className="text-xs text-[var(--muted)] mb-1">Open positions</div>
              <div className="text-xl font-semibold">{positions.length}</div>
            </div>
            <div className="card p-4">
              <div className="text-xs text-[var(--muted)] mb-1">Total notional</div>
              <div className="text-xl font-semibold truncate">
                <Money value={totalNotional} />
              </div>
            </div>
            <div className="card p-4">
              <div className="text-xs text-[var(--muted)] mb-1">Unrealized P&amp;L</div>
              <div
                className={`text-xl font-semibold truncate ${
                  totalUnrealized >= 0 ? "text-[var(--green)]" : "text-[var(--red)]"
                }`}
              >
                <Money value={totalUnrealized} />
              </div>
            </div>
          </div>

          <div className="card p-4">
            <div className="overflow-x-auto">
              <table className="data-table whitespace-nowrap">
                <thead>
                  <tr>
                    <th>Coin</th>
                    <th>Tags</th>
                    <th>Side</th>
                    <th>Account</th>
                    <th className="text-right">Size</th>
                    <th className="text-right">Entry</th>
                    <th className="text-right">Mark</th>
                    <th className="text-right">Value</th>
                    <th className="text-right">Leverage</th>
                    <th className="text-right">Liquidation</th>
                    <th className="text-right">Unrealized P&amp;L</th>
                  </tr>
                </thead>
                <tbody>
                  {positions.map((p) => (
                    <tr key={p.id}>
                      <td className="font-medium">{p.coin}</td>
                      <td className="whitespace-normal">
                        <PositionTagsForm
                          action={setPositionTags}
                          connectionId={p.connectionId}
                          coin={p.coin}
                          riskLevel={p.riskLevel}
                          expectedReturn={p.expectedReturn}
                          timeHorizon={p.timeHorizon}
                          liquidity={p.liquidity}
                          assetType={p.assetType}
                          assetTypeAuto={p.assetTypeAuto}
                          apr={p.apr}
                          playlistId={p.playlistId}
                          notes={p.notes}
                          playlists={playlistList}
                        />
                      </td>
                      <td>
                        <span
                          className="badge"
                          style={{
                            border: `1px solid ${p.side === "long" ? "var(--green)" : "var(--red)"}`,
                            color: p.side === "long" ? "var(--green)" : "var(--red)",
                          }}
                        >
                          {p.side.toUpperCase()}
                        </span>
                      </td>
                      <td>
                        {p.accountName}
                        <div className="text-xs text-[var(--muted)] capitalize">{p.platform}</div>
                      </td>
                      <td className="text-right">{p.size}</td>
                      <td className="text-right">
                        {p.entryPrice === null ? "—" : <Money value={p.entryPrice} />}
                      </td>
                      <td className="text-right">
                        {p.markPrice === null ? "—" : <Money value={p.markPrice} />}
                      </td>
                      <td className="text-right">
                        {p.positionValue === null ? "—" : <Money value={p.positionValue} />}
                      </td>
                      <td className="text-right">
                        {p.leverage === null ? "—" : `${p.leverage}x`}
                        {p.leverageType && (
                          <div className="text-xs text-[var(--muted)]">{p.leverageType}</div>
                        )}
                      </td>
                      <td className="text-right text-[var(--amber)]">
                        {p.liquidationPrice === null ? "—" : <Money value={p.liquidationPrice} />}
                      </td>
                      <td
                        className={`text-right ${
                          (p.unrealizedPnl ?? 0) >= 0 ? "text-[var(--green)]" : "text-[var(--red)]"
                        }`}
                      >
                        {p.unrealizedPnl === null ? "—" : <Money value={p.unrealizedPnl} />}
                        {p.returnOnEquity !== null && (
                          <div className="text-xs">{(p.returnOnEquity * 100).toFixed(2)}%</div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

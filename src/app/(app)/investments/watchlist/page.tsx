import { listWatchlist, addWatchlistItem, deleteWatchlistItem, listPlaylists } from "@/actions/playlists";
import { Money } from "@/components/PrivacyContext";
import ConfirmSubmitButton from "@/components/ConfirmSubmitButton";
import { ASSET_TYPES, tagLabel } from "@/lib/portfolio/tags";
import Link from "next/link";

export default async function WatchlistPage() {
  const [items, playlistList] = await Promise.all([listWatchlist(), listPlaylists()]);

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-lg font-semibold">Watchlist</h1>
          <p className="text-xs text-[var(--muted)] mt-1">
            Assets you&apos;re following but don&apos;t own. Nothing here counts toward portfolio value or Net Worth.
          </p>
        </div>
        <Link href="/investments" className="btn whitespace-nowrap">
          Back to positions
        </Link>
      </div>

      <div className="card p-4">
        {items.length === 0 ? (
          <div className="text-sm text-[var(--muted)] py-8 text-center">
            Nothing on the watchlist yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table whitespace-nowrap">
              <thead>
                <tr>
                  <th>Symbol</th>
                  <th>Type</th>
                  <th>Playlist</th>
                  <th className="text-right">Current</th>
                  <th className="text-right">Target</th>
                  <th className="text-right">To target</th>
                  <th>Notes</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.map((w) => (
                  <tr key={w.id}>
                    <td>
                      <span className="font-medium">{w.symbol}</span>
                      {w.reached && (
                        <span className="badge ml-2 text-[var(--green)] border border-[var(--green)]">
                          at target
                        </span>
                      )}
                      {w.name && <div className="text-xs text-[var(--muted)]">{w.name}</div>}
                    </td>
                    <td>{tagLabel(w.assetType, "assetType") ?? "—"}</td>
                    <td>{w.playlistName ?? "—"}</td>
                    <td className="text-right">
                      {w.currentPrice === null ? "—" : <Money value={w.currentPrice} currency={w.currency} />}
                    </td>
                    <td className="text-right">
                      {w.targetPrice === null ? "—" : <Money value={w.targetPrice} currency={w.currency} />}
                    </td>
                    <td
                      className={`text-right ${
                        w.distancePercent === null
                          ? ""
                          : w.distancePercent <= 0
                            ? "text-[var(--green)]"
                            : "text-[var(--muted)]"
                      }`}
                    >
                      {w.distancePercent === null ? "—" : `${w.distancePercent.toFixed(1)}%`}
                    </td>
                    <td className="text-xs text-[var(--muted)] whitespace-normal max-w-[16rem]">{w.notes}</td>
                    <td className="text-right">
                      <form action={deleteWatchlistItem}>
                        <input type="hidden" name="id" value={w.id} />
                        <ConfirmSubmitButton label="Remove" confirmMessage={`Remove ${w.symbol} from the watchlist?`} />
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card p-4 max-w-md">
        <div className="text-sm font-medium mb-3">Add to watchlist</div>
        <form action={addWatchlistItem} className="space-y-3">
          <input name="symbol" placeholder="Symbol (e.g. VWCE, NVDA)" className="input" required />
          <input name="name" placeholder="Name (optional)" className="input" />
          <div className="flex gap-2">
            <select name="assetType" className="input" defaultValue="">
              <option value="">Asset type — unset</option>
              {ASSET_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
            <select name="playlistId" className="input" defaultValue="">
              <option value="">Playlist — none</option>
              {playlistList.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            <input name="currentPrice" type="number" step="0.0001" placeholder="Current price" className="input" />
            <input name="targetPrice" type="number" step="0.0001" placeholder="Target price" className="input" />
          </div>
          <select name="currency" className="input">
            <option value="EUR">EUR</option>
            <option value="USD">USD</option>
          </select>
          <textarea name="notes" placeholder="Why are you watching this?" className="input" rows={2} />
          <button type="submit" className="btn w-full">
            Add to watchlist
          </button>
        </form>
      </div>
    </div>
  );
}

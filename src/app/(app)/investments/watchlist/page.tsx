import { textForRequest } from "@/actions/pageLanguage";
import PlaylistPicker from "@/components/PlaylistPicker";
import { playlistsText } from "@/lib/portfolio/playlists";
import SymbolName from "@/components/SymbolName";
import ResponsiveTable from "@/components/ResponsiveTable";
import AssetSearch from "@/components/AssetSearch";
import { listWatchlist, addWatchlistItem, deleteWatchlistItem, listPlaylists } from "@/actions/playlists";
import { Money } from "@/components/PrivacyContext";
import ConfirmSubmitButton from "@/components/ConfirmSubmitButton";
import { ASSET_TYPES, tagLabel } from "@/lib/portfolio/tags";
import Link from "next/link";

export default async function WatchlistPage() {
  const uiText = await textForRequest();
  const [items, playlistList] = await Promise.all([listWatchlist(), listPlaylists()]);

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-lg font-semibold">{uiText("Watchlist")}</h1>
          <p className="text-xs text-[var(--muted)] mt-1">{uiText("Assets you're following but don't own. Nothing here counts toward portfolio value or Net Worth.")}</p>
        </div>
        <Link href="/investments" className="btn whitespace-nowrap">{uiText("Back to positions")}</Link>
      </div>

      <div className="card p-4">
        {items.length === 0 ? (
          <div className="text-sm text-[var(--muted)] py-8 text-center">{uiText("Nothing on the watchlist yet.")}</div>
        ) : (
          <div className="overflow-x-auto">
            <div className="table-scroll" role="region" aria-label={uiText("Scrollable data table")} tabIndex={0}><ResponsiveTable className="data-table whitespace-nowrap">
              <thead>
                <tr>
                  <th>{uiText("Symbol")}</th>
                  <th>{uiText("Type")}</th>
                  <th>{uiText("Playlist")}</th>
                  <th className="text-right">{uiText("Current")}</th>
                  <th className="text-right">{uiText("Target")}</th>
                  <th className="text-right">{uiText("To target")}</th>
                  <th>{uiText("Notes")}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.map((w) => (
                  <tr key={w.id}>
                    <td>
                      <Link href={`/investments/asset/${encodeURIComponent(w.symbol)}?type=${encodeURIComponent(w.assetType ?? "")}&name=${encodeURIComponent(w.name ?? "")}`} className="font-medium hover:underline"><SymbolName symbol={w.symbol} /></Link>
                      {w.reached && (
                        <span className="badge ml-2 text-[var(--green)] border border-[var(--green)]">{uiText("at target")}</span>
                      )}
                      {w.name && <div className="text-xs text-[var(--muted)]"><span translate="no">{w.name}</span></div>}
                    </td>
                    <td>{uiText(tagLabel(w.assetType, "assetType") ?? "—")}</td>
                    <td><span translate="no">{playlistsText(w.playlistNames)}</span></td>
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
                        <ConfirmSubmitButton label={uiText("Remove")} confirmMessage={`Remove ${w.symbol} from the watchlist?`} />
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </ResponsiveTable></div>
          </div>
        )}
      </div>

      <div className="card p-4 max-w-md">
        <div className="text-sm font-medium mb-3">{uiText("Add to watchlist")}</div>
        <form action={addWatchlistItem} className="space-y-3">
          <AssetSearch />
          <div className="flex gap-2">
            <select name="assetType" className="input" defaultValue="">
              <option value="">{uiText("Asset type — unset")}</option>
              {ASSET_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {uiText(t.label)}
                </option>
              ))}
            </select>
            <PlaylistPicker playlists={playlistList} selected={[]} />
          </div>
          <div className="flex gap-2">
            <input name="currentPrice" type="number" step="0.0001" placeholder={uiText("Current price")} className="input" />
            <input name="targetPrice" type="number" step="0.0001" placeholder={uiText("Target price")} className="input" />
          </div>
          <select name="currency" className="input">
            <option value="EUR">EUR</option>
            <option value="USD">USD</option>
          </select>
          <textarea name="notes" placeholder={uiText("Why are you watching this?")} className="input" rows={2} />
          <button type="submit" className="btn w-full">{uiText("Add to watchlist")}</button>
        </form>
      </div>
    </div>
  );
}

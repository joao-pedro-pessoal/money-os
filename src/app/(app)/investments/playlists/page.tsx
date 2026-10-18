import { textForRequest } from "@/actions/pageLanguage";
import SymbolName from "@/components/SymbolName";
import ResponsiveTable from "@/components/ResponsiveTable";
import { listPlaylistsWithTotals, createPlaylist, deletePlaylist } from "@/actions/playlists";
import { Money } from "@/components/PrivacyContext";
import ConfirmSubmitButton from "@/components/ConfirmSubmitButton";
import Link from "next/link";
import PanelFrame from "@/components/PanelFrame";

export default async function PlaylistsPage() {
  const uiText = await textForRequest();
  const lists = await listPlaylistsWithTotals();
  // A position can be in several playlists, whole in each: then the totals below
  // add up to more than the portfolio, and the page should say why.
  const seen = new Map<string, number>();
  for (const p of lists) for (const position of p.positions) seen.set(position.id, (seen.get(position.id) ?? 0) + 1);
  const shared = [...seen.values()].filter((n) => n > 1).length;

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-lg font-semibold">{uiText("Playlists")}</h1>
          <p className="text-xs text-[var(--muted)] mt-1">{uiText("Group your positions by purpose (Retirement, Speculation, …) and see which group is actually performing. A position can be in several playlists; tick them on the position.")}</p>
        </div>
        <Link href="/investments" className="btn whitespace-nowrap">{uiText("Back to positions")}</Link>
      </div>

      <div className="card p-4">
        {shared > 0 && (
          <p className="text-xs text-[var(--muted)] mb-3">
            {shared === 1 ? uiText("1 position is") : uiText("{0} positions are", { "0": shared })}{uiText(" in more than one playlist and counted whole in each, so these totals add up to more than the portfolio.")}</p>
        )}
        {lists.some(p => p.tradesMayBeIncomplete) && (
          <p className="text-xs text-[var(--muted)] mb-3">{uiText("Some trades have no exchange rate and are left out. Playlist results may be incomplete.")}</p>
        )}
        {lists.length === 0 ? (
          <div className="text-sm text-[var(--muted)] py-8 text-center">{uiText("No playlists yet. Create one below, then pick it when adding or editing a position.")}</div>
        ) : (
          <div className="overflow-x-auto">
            <div className="table-scroll" role="region" aria-label={uiText("Scrollable data table")} tabIndex={0}><ResponsiveTable className="data-table whitespace-nowrap">
              <thead>
                <tr>
                  <th>{uiText("Playlist")}</th>
                  <th className="text-right">{uiText("Positions")}</th>
                  <th className="text-right">{uiText("Value")}</th>
                  <th className="text-right">{uiText("Cost")}</th>
                  <th className="text-right">{uiText("Unrealized P&L")}</th>
                  <th className="text-right" title={uiText("Closed trades put in this playlist, a trade split into several fills counted whole, and manual sales. Dividends and interest are not split by playlist.")}>{uiText("Realized")}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {lists.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <div className="flex items-center gap-2">
                        {p.color && (
                          <span
                            style={{ background: p.color, width: 10, height: 10, borderRadius: 999 }}
                            className="inline-block shrink-0"
                          />
                        )}
                        <a href={`#playlist-${p.id}`} className="font-medium hover:underline"><span translate="no">{p.name}</span></a>
                      </div>
                      {p.description && <div className="text-xs text-[var(--muted)]"><span translate="no">{p.description}</span></div>}
                    </td>
                    <td className="text-right">{p.count}</td>
                    <td className="text-right">
                      <Money value={p.value} currency={p.currency} />
                    </td>
                    <td className="text-right">
                      <Money value={p.cost} currency={p.currency} />
                    </td>
                    <td className={`text-right ${p.pnl >= 0 ? "text-[var(--green)]" : "text-[var(--red)]"}`}>
                      <Money value={p.pnl} currency={p.currency} />
                      <div className="text-xs">{p.pnlPercent.toFixed(1)}%</div>
                    </td>
                    <td className={`text-right ${p.realized >= 0 ? "text-[var(--green)]" : "text-[var(--red)]"}`}>
                      <Money value={p.realized} currency={p.currency} />
                      {p.unconverted > 0 && <div className="text-xs text-[var(--muted)]">{p.unconverted}{uiText(" manual sales left out: no exchange rate")}</div>}
                    </td>
                    <td className="text-right">
                      <form action={deletePlaylist}>
                        <input type="hidden" name="id" value={p.id} />
                        <ConfirmSubmitButton
                          label={uiText("Delete")}
                          confirmMessage={`Delete the playlist "${p.name}"? The positions in it are kept — they just become ungrouped.`}
                        />
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </ResponsiveTable></div>
          </div>
        )}
      </div>

      {/* What each playlist holds. A total is only worth trusting when the
          rows behind it can be seen; these are the same items the table above
          adds up. On a phone each playlist opens when tapped. */}
      {lists.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-sm font-medium">{uiText("Positions by playlist")}</h2>
          {lists.map((p) => (
            <PanelFrame
              key={p.id}
              id={`playlist-${p.id}`}
              as="section"
              persistKey={`playlist-${p.id}`}
              title={p.name}
              titleTranslate="no"
              summary={<>{p.count} {p.count === 1 ? uiText("position") : uiText("positions")} · <Money value={p.value} currency={p.currency} /></>}
              className="card p-4 scroll-mt-20"
            >
              {p.positions.length === 0 ? (
                <p className="text-xs text-[var(--muted)] py-4">{uiText("Nothing in this playlist yet. Pick it on the")}{" "}
                  <Link href="/positions" className="text-[var(--accent)] hover:underline">{uiText("Positions page")}</Link>{" "}{uiText("or when adding a position.")}</p>
              ) : (
                <div className="overflow-x-auto mt-3">
                  <div className="table-scroll" role="region" aria-label={uiText("Positions in {0}", { "0": p.name })} tabIndex={0}><ResponsiveTable className="data-table whitespace-nowrap text-sm">
                    <thead>
                      <tr>
                        <th>{uiText("Position")}</th>
                        <th>{uiText("Account")}</th>
                        <th className="text-right">{uiText("Value")}</th>
                        <th className="text-right">{uiText("Unrealized P&L")}</th>
                        <th className="text-right">{uiText("Share")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {p.positions.map((i) => {
                        const cost = i.value - i.pnl;
                        return (
                          <tr key={i.id}>
                            <td className="font-medium" title={i.symbol}>
                              <Link href={`/investments/asset/${encodeURIComponent(i.symbol)}?type=${encodeURIComponent(i.assetType ?? "")}`} className="break-words hover:underline">
                                <SymbolName symbol={i.symbol} short />
                              </Link>
                              {i.side === "short" && <span className="text-[10px] text-[var(--muted)] ml-1">{uiText("short")}</span>}
                              {i.leverage !== null && i.leverage > 1 && <span className="text-[10px] text-[var(--muted)] ml-1">{i.leverage}×</span>}
                            </td>
                            <td className="text-xs text-[var(--muted)]"><span translate="no">{i.accountName}</span></td>
                            <td className="text-right">
                              <Money value={i.value} currency={p.currency} />
                              {i.atCost && <div className="text-[10px] text-[var(--muted)]">{uiText("at cost")}</div>}
                            </td>
                            {i.measured ? (
                              <td className={`text-right ${i.pnl >= 0 ? "text-[var(--green)]" : "text-[var(--red)]"}`}>
                                <Money value={i.pnl} currency={p.currency} />
                                {cost > 0 && <div className="text-xs">{((i.pnl / cost) * 100).toFixed(1)}%</div>}
                              </td>
                            ) : (
                              <td className="text-right text-[var(--muted)]">—</td>
                            )}
                            <td className="text-right text-xs text-[var(--muted)]">
                              {p.value > 0 ? `${((i.value / p.value) * 100).toFixed(1)}%` : "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </ResponsiveTable></div>
                </div>
              )}
            </PanelFrame>
          ))}
        </div>
      )}

      <div className="card p-4 max-w-md">
        <div className="text-sm font-medium mb-3">{uiText("New playlist")}</div>
        <form action={createPlaylist} className="space-y-3">
          <input name="name" placeholder={uiText("Name (e.g. Reforma)")} className="input" required />
          <input name="description" placeholder={uiText("Description (optional)")} className="input" />
          <div className="flex gap-2 items-center">
            <input name="color" type="color" defaultValue="#c9a86a" className="input input-narrow h-10 w-16 p-1" />
            <span className="text-xs text-[var(--muted)]">{uiText("Colour used in charts and lists")}</span>
          </div>
          <button type="submit" className="btn w-full">{uiText("Create playlist")}</button>
        </form>
      </div>
    </div>
  );
}

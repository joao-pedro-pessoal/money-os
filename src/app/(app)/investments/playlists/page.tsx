import ResponsiveTable from "@/components/ResponsiveTable";
import { listPlaylistsWithTotals, createPlaylist, deletePlaylist } from "@/actions/playlists";
import { Money } from "@/components/PrivacyContext";
import ConfirmSubmitButton from "@/components/ConfirmSubmitButton";
import Link from "next/link";
import PanelFrame from "@/components/PanelFrame";
import { shortName } from "@/lib/portfolio/shortName";

export default async function PlaylistsPage() {
  const lists = await listPlaylistsWithTotals();

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-lg font-semibold">Playlists</h1>
          <p className="text-xs text-[var(--muted)] mt-1">
            Group your positions by purpose (Retirement, Speculation, …) and see which group is actually performing.
          </p>
        </div>
        <Link href="/investments" className="btn whitespace-nowrap">
          Back to positions
        </Link>
      </div>

      <div className="card p-4">
        {lists.length === 0 ? (
          <div className="text-sm text-[var(--muted)] py-8 text-center">
            No playlists yet. Create one below, then pick it when adding or editing a position.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <div className="table-scroll" role="region" aria-label="Scrollable data table" tabIndex={0}><ResponsiveTable className="data-table whitespace-nowrap">
              <thead>
                <tr>
                  <th>Playlist</th>
                  <th className="text-right">Positions</th>
                  <th className="text-right">Value</th>
                  <th className="text-right">Cost</th>
                  <th className="text-right">Unrealized P&amp;L</th>
                  <th className="text-right">Realized</th>
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
                        <a href={`#playlist-${p.id}`} className="font-medium hover:underline">{p.name}</a>
                      </div>
                      {p.description && <div className="text-xs text-[var(--muted)]">{p.description}</div>}
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
                    </td>
                    <td className="text-right">
                      <form action={deletePlaylist}>
                        <input type="hidden" name="id" value={p.id} />
                        <ConfirmSubmitButton
                          label="Delete"
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
          <h2 className="text-sm font-medium">Positions by playlist</h2>
          {lists.map((p) => (
            <PanelFrame
              key={p.id}
              id={`playlist-${p.id}`}
              as="section"
              persistKey={`playlist-${p.id}`}
              title={p.name}
              summary={<>{p.count} {p.count === 1 ? "position" : "positions"} · <Money value={p.value} currency={p.currency} /></>}
              className="card p-4 scroll-mt-20"
            >
              {p.positions.length === 0 ? (
                <p className="text-xs text-[var(--muted)] py-4">
                  Nothing in this playlist yet. Pick it on the{" "}
                  <Link href="/positions" className="text-[var(--accent)] hover:underline">Positions page</Link>{" "}
                  or when adding a position.
                </p>
              ) : (
                <div className="overflow-x-auto mt-3">
                  <div className="table-scroll" role="region" aria-label={`Positions in ${p.name}`} tabIndex={0}><ResponsiveTable className="data-table whitespace-nowrap text-sm">
                    <thead>
                      <tr>
                        <th>Position</th>
                        <th>Account</th>
                        <th className="text-right">Value</th>
                        <th className="text-right">Unrealized P&amp;L</th>
                        <th className="text-right">Share</th>
                      </tr>
                    </thead>
                    <tbody>
                      {p.positions.map((i) => {
                        const cost = i.value - i.pnl;
                        return (
                          <tr key={i.id}>
                            <td className="font-medium" title={i.symbol}>
                              <Link href={`/investments/asset/${encodeURIComponent(i.symbol)}?type=${encodeURIComponent(i.assetType ?? "")}`} className="break-words hover:underline">
                                {shortName(i.symbol)}
                              </Link>
                              {i.side === "short" && <span className="text-[10px] text-[var(--muted)] ml-1">short</span>}
                              {i.leverage !== null && i.leverage > 1 && <span className="text-[10px] text-[var(--muted)] ml-1">{i.leverage}×</span>}
                            </td>
                            <td className="text-xs text-[var(--muted)]">{i.accountName}</td>
                            <td className="text-right">
                              <Money value={i.value} currency={p.currency} />
                              {i.atCost && <div className="text-[10px] text-[var(--muted)]">at cost</div>}
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
        <div className="text-sm font-medium mb-3">New playlist</div>
        <form action={createPlaylist} className="space-y-3">
          <input name="name" placeholder="Name (e.g. Reforma)" className="input" required />
          <input name="description" placeholder="Description (optional)" className="input" />
          <div className="flex gap-2 items-center">
            <input name="color" type="color" defaultValue="#c9a86a" className="input input-narrow h-10 w-16 p-1" />
            <span className="text-xs text-[var(--muted)]">Colour used in charts and lists</span>
          </div>
          <button type="submit" className="btn w-full">
            Create playlist
          </button>
        </form>
      </div>
    </div>
  );
}

import { listPlaylistsWithTotals, createPlaylist, deletePlaylist } from "@/actions/playlists";
import { Money } from "@/components/PrivacyContext";
import ConfirmSubmitButton from "@/components/ConfirmSubmitButton";
import Link from "next/link";

export default async function PlaylistsPage() {
  const lists = await listPlaylistsWithTotals();

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-lg font-semibold">Playlists</h1>
          <p className="text-xs text-[var(--muted)] mt-1">
            Group your positions by purpose (Reforma, Especulação, …) and see which group is actually performing.
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
            <table className="data-table whitespace-nowrap">
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
                        <span className="font-medium">{p.name}</span>
                      </div>
                      {p.description && <div className="text-xs text-[var(--muted)]">{p.description}</div>}
                    </td>
                    <td className="text-right">{p.count}</td>
                    <td className="text-right">
                      <Money value={p.value} />
                    </td>
                    <td className="text-right">
                      <Money value={p.cost} />
                    </td>
                    <td className={`text-right ${p.pnl >= 0 ? "text-[var(--green)]" : "text-[var(--red)]"}`}>
                      <Money value={p.pnl} />
                      <div className="text-xs">{p.pnlPercent.toFixed(1)}%</div>
                    </td>
                    <td className={`text-right ${p.realized >= 0 ? "text-[var(--green)]" : "text-[var(--red)]"}`}>
                      <Money value={p.realized} />
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
            </table>
          </div>
        )}
      </div>

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

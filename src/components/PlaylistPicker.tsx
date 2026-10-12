/**
 * The playlists a position, a trade or a watched instrument is in: one box per
 * playlist, any number ticked. Sends `playlistIdsSent` too, so the action can
 * tell "none ticked" from a form that never showed the boxes
 * (`actions/playlistChoice.ts`).
 *
 * No state of its own: a plain form field, drawn on the server or the client.
 */
export default function PlaylistPicker({
  playlists,
  selected,
  label = "Playlists",
  compact = false,
}: {
  playlists: readonly { id: string; name: string }[];
  selected: readonly string[];
  label?: string;
  compact?: boolean;
}) {
  return (
    <fieldset className={compact ? "space-y-1" : "space-y-1.5"}>
      <input type="hidden" name="playlistIdsSent" value="1" />
      <legend className={compact ? "text-xs" : "text-xs text-[var(--muted)]"}>{label}</legend>
      {playlists.length === 0 ? (
        <p className="text-xs text-[var(--muted)]">No playlists yet — create one in Investments → Playlists.</p>
      ) : (
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {playlists.map((p) => (
            <label key={p.id} className={`flex items-center gap-1.5 ${compact ? "text-xs" : "text-sm"}`}>
              <input type="checkbox" name="playlistIds" value={p.id} defaultChecked={selected.includes(p.id)} />
              <span translate="no">{p.name}</span>
            </label>
          ))}
        </div>
      )}
    </fieldset>
  );
}

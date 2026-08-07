"use client";

import { useState } from "react";
import { RISK_LEVELS, TIME_HORIZONS, EXPECTED_RETURNS, LIQUIDITY_LEVELS, tagLabel } from "@/lib/portfolio/tags";
import HoldingTags from "./HoldingTags";

/**
 * Lets a synced position carry the same tags as a manual one.
 * Collapsed by default so the positions table stays readable; the tags
 * themselves are always visible as badges.
 */
export default function PositionTagsForm({
  action,
  connectionId,
  coin,
  riskLevel,
  expectedReturn,
  timeHorizon,
  liquidity,
  playlistId,
  notes,
  playlists,
}: {
  action: (formData: FormData) => Promise<void>;
  connectionId: string;
  coin: string;
  riskLevel: string | null;
  expectedReturn: string | null;
  timeHorizon: string | null;
  liquidity: string | null;
  playlistId: string | null;
  notes: string | null;
  playlists: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const hasTags = Boolean(riskLevel || expectedReturn || timeHorizon || liquidity || playlistId);

  if (!open) {
    return (
      <div>
        {hasTags ? (
          <HoldingTags
            riskLevel={riskLevel}
            expectedReturn={expectedReturn}
            timeHorizon={timeHorizon}
            liquidity={liquidity}
          />
        ) : null}
        {playlistId && (
          <div className="text-xs text-[var(--muted)] mt-1">
            {playlists.find((p) => p.id === playlistId)?.name}
          </div>
        )}
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-xs text-[var(--accent)] hover:underline mt-1"
        >
          {hasTags ? "Edit tags" : "Add tags"}
        </button>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-2 min-w-[15rem]">
      <input type="hidden" name="connectionId" value={connectionId} />
      <input type="hidden" name="coin" value={coin} />

      <select name="riskLevel" className="input py-1 text-xs" defaultValue={riskLevel ?? ""}>
        <option value="">Risk — unset</option>
        {RISK_LEVELS.map((r) => (
          <option key={r.value} value={r.value}>
            {r.label}
          </option>
        ))}
      </select>
      <select name="timeHorizon" className="input py-1 text-xs" defaultValue={timeHorizon ?? ""}>
        <option value="">Time horizon — unset</option>
        {TIME_HORIZONS.map((t) => (
          <option key={t.value} value={t.value}>
            {t.label}
          </option>
        ))}
      </select>
      <select name="expectedReturn" className="input py-1 text-xs" defaultValue={expectedReturn ?? ""}>
        <option value="">Expected return — unset</option>
        {EXPECTED_RETURNS.map((r) => (
          <option key={r.value} value={r.value}>
            {r.label}
          </option>
        ))}
      </select>
      <select name="liquidity" className="input py-1 text-xs" defaultValue={liquidity ?? ""}>
        <option value="">Liquidity — unset</option>
        {LIQUIDITY_LEVELS.map((l) => (
          <option key={l.value} value={l.value}>
            {tagLabel(l.value)}
          </option>
        ))}
      </select>
      {playlists.length > 0 && (
        <select name="playlistId" className="input py-1 text-xs" defaultValue={playlistId ?? ""}>
          <option value="">Playlist — none</option>
          {playlists.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      )}
      <input
        name="notes"
        defaultValue={notes ?? ""}
        placeholder="Notes (e.g. strategy)"
        className="input py-1 text-xs"
      />

      <div className="flex gap-2">
        <button type="submit" className="btn py-1 px-3 text-xs">
          Save
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs text-[var(--muted)] hover:underline"
        >
          Cancel
        </button>
      </div>
      <p className="text-[10px] text-[var(--muted)]">Tags are kept when the position re-syncs.</p>
    </form>
  );
}

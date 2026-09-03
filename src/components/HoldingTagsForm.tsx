"use client";

import { useState } from "react";
import {
  RISK_LEVELS,
  TIME_HORIZONS,
  EXPECTED_RETURNS,
  LIQUIDITY_LEVELS,
  ASSET_TYPES,
  annualYieldLabel,
  tagLabel,
} from "@/lib/portfolio/tags";
import HoldingTags from "./HoldingTags";

/**
 * Tagging a manual position without leaving the list.
 *
 * The synced ones have had this since the Positions page existed; manual ones —
 * which is every position rebuilt from a statement — could only be tagged by
 * opening each in turn. On a list of twelve that is twelve page loads to say
 * "these are all ETFs".
 *
 * Collapsed by default, exactly like `PositionTagsForm`, so the table stays a
 * table. The badges are always visible; the form is one click away.
 */
export default function HoldingTagsForm({
  action,
  id,
  riskLevel,
  expectedReturn,
  timeHorizon,
  liquidity,
  assetType,
  apr,
  playlistId,
  playlists,
}: {
  action: (formData: FormData) => Promise<void>;
  id: string;
  riskLevel: string | null;
  expectedReturn: string | null;
  timeHorizon: string | null;
  liquidity: string | null;
  assetType: string | null;
  apr: number | null;
  playlistId: string | null;
  playlists: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  // Tracked rather than left uncontrolled because the annual-rate field below
  // is named after the type: pick "ETF" and the field has to stop saying APR.
  const [type, setType] = useState(assetType ?? "");
  const yieldLabel = annualYieldLabel(type);

  const select = (
    name: string,
    label: string,
    options: readonly { value: string; label: string }[],
    current: string | null
  ) => (
    <label className="block text-[10px]">
      <span className="text-[var(--muted)]">{label}</span>
      <select name={name} defaultValue={current ?? ""} className="input input-narrow text-xs py-1 mt-0.5">
        <option value="">—</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <div>
      <div className="flex items-center gap-2 flex-wrap">
        {/* The type is the one that decides how the money is counted, so it
            gets its own badge rather than sitting among the four judgement
            tags — and its absence is what the button offers to fix. */}
        {assetType && (
          <span className="badge" style={{ color: "var(--muted)" }}>
            {tagLabel(assetType, "assetType") ?? assetType}
          </span>
        )}
        <HoldingTags
          riskLevel={riskLevel}
          expectedReturn={expectedReturn}
          timeHorizon={timeHorizon}
          liquidity={liquidity}
        />
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="text-[10px]"
          style={{ color: "var(--accent)" }}
        >
          {open ? "Cancel" : assetType === null ? "Set type" : "Edit tags"}
        </button>
      </div>

      {open && (
        <form action={action} className="mt-2 flex flex-wrap gap-2 items-end">
          <input type="hidden" name="id" value={id} />
          <label className="block text-[10px]">
            <span className="text-[var(--muted)]">Type</span>
            <select
              name="assetType"
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="input input-narrow text-xs py-1 mt-0.5"
            >
              <option value="">—</option>
              {ASSET_TYPES.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          {select("riskLevel", "Risk", RISK_LEVELS, riskLevel)}
          {select("expectedReturn", "Return", EXPECTED_RETURNS, expectedReturn)}
          {select("timeHorizon", "Horizon", TIME_HORIZONS, timeHorizon)}
          {select("liquidity", "Liquidity", LIQUIDITY_LEVELS, liquidity)}

          <label className="block text-[10px]">
            <span className="text-[var(--muted)]">Playlist</span>
            <select
              name="playlistId"
              defaultValue={playlistId ?? ""}
              className="input input-narrow text-xs py-1 mt-0.5"
            >
              <option value="">—</option>
              {playlists.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>

          {yieldLabel && (
            <label className="block text-[10px]">
              <span className="text-[var(--muted)]">{yieldLabel} %</span>
              <input
                name="apr"
                type="number"
                step="0.01"
                min="0"
                defaultValue={apr ?? ""}
                className="input input-narrow text-xs py-1 mt-0.5 w-20"
              />
            </label>
          )}

          <button type="submit" className="btn text-xs py-1">
            Save
          </button>
        </form>
      )}
    </div>
  );
}

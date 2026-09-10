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
  assetType,
  assetTypeAuto,
  apr,
  playlistId,
  notes,
  playlists,
  entryPriceOverride,
  venueEntryPrice,
}: {
  action: (formData: FormData) => Promise<void>;
  connectionId: string;
  coin: string;
  riskLevel: string | null;
  expectedReturn: string | null;
  timeHorizon: string | null;
  liquidity: string | null;
  assetType: string | null;
  /** True while the type came from the platform rather than from you. */
  assetTypeAuto: boolean;
  apr: number | null;
  playlistId: string | null;
  notes: string | null;
  playlists: { id: string; name: string }[];
  /** What you said this cost per unit, or null to use the platform's. */
  entryPriceOverride?: number | null;
  /** The platform's own average, shown so you can see what you are replacing. */
  venueEntryPrice?: number | null;
}) {
  const [open, setOpen] = useState(false);
  // Controlled so the rate field can be named after the type as you change it.
  const [type, setType] = useState(assetType ?? "");
  const yieldLabel = annualYieldLabel(type);
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
        {/* Filled in from what the platform calls the instrument. The badge
            says so, because a value you didn't type should never look like one
            you did. */}
        {assetType && (
          <div className="text-xs mt-1">
            <span className="text-[var(--foreground)]">{tagLabel(assetType, "assetType") ?? assetType}</span>
            {assetTypeAuto && (
              <span
                className="text-[10px] text-[var(--muted)] ml-1"
                title="Read from the platform. Change it and it stays changed."
              >
                auto
              </span>
            )}
          </div>
        )}
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

      <select
        name="assetType"
        className="input py-1 text-xs"
        value={type}
        onChange={(e) => setType(e.target.value)}
      >
        <option value="">Asset type — unset</option>
        {ASSET_TYPES.map((a) => (
          <option key={a.value} value={a.value}>
            {a.label}
          </option>
        ))}
      </select>

      {/* Cash and stablecoins have no P&L — their price doesn't move — so a
          rate is the only return they have, and only you know it. The field is
          named after the type's income model, and absent for types that have
          none. */}
      {yieldLabel && (
        <label className="text-xs block">
          <span className="text-[var(--muted)]">{yieldLabel}, if it earns one</span>
          <input
            name="apr"
            type="number"
            step="0.001"
            min="0"
            defaultValue={apr ?? ""}
            placeholder="e.g. 4.5 for 4.5% a year"
            className="input py-1 text-xs mt-1"
          />
        </label>
      )}

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
            {tagLabel(l.value, "liquidity")}
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

      {/*
        What it really cost you, when the platform's average is not the one you
        mean — coins moved in from elsewhere arrive carrying the venue's basis,
        and a position rebuilt from a statement carries the statement's.

        In whatever currency the venue quotes the instrument in, which is what
        its own screen shows. Empty puts the platform's figure back.
      */}
      {venueEntryPrice !== undefined && (
        <label className="text-xs block">
          <span className="text-[var(--muted)]">
            Entry price, if the platform&apos;s is not what you paid
          </span>
          <input
            name="entryPriceOverride"
            type="number"
            step="any"
            min="0"
            defaultValue={entryPriceOverride ?? ""}
            placeholder={
              venueEntryPrice === null
                ? "the platform states none"
                : `platform says ${venueEntryPrice}`
            }
            className="input py-1 text-xs mt-1"
          />
          <span className="text-[10px] text-[var(--muted)]">
            In the currency the platform quotes it in. Empty uses theirs.
          </span>
        </label>
      )}

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

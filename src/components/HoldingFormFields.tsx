"use client";

import { useState } from "react";
import {
  ASSET_TYPES,
  YIELD_BEARING_ASSET_TYPES,
  DIRECTIONS,
  RISK_LEVELS,
  TIME_HORIZONS,
  EXPECTED_RETURNS,
  LIQUIDITY_LEVELS,
} from "@/lib/portfolio/tags";

/**
 * The parts of the position form that depend on the asset type.
 *
 * A stablecoin is 1:1 and capital-stable, so asking for an entry price, a
 * direction, a risk level or a playlist is noise — those are filled in
 * automatically via hidden inputs. APR only appears for types that can
 * actually earn a yield. This is why this slice of the form is a client
 * component while the rest of the page stays server-rendered.
 */
export default function HoldingFormFields({
  defaultAssetType = "",
  defaultDirection = "long",
  defaultApr = "",
  defaultRisk = "",
  defaultTimeHorizon = "",
  defaultExpectedReturn = "",
  defaultLiquidity = "",
  playlistOptions = [],
  defaultPlaylistId = "",
  showPriceFields = true,
}: {
  defaultAssetType?: string;
  defaultDirection?: string;
  defaultApr?: string;
  defaultRisk?: string;
  defaultTimeHorizon?: string;
  defaultExpectedReturn?: string;
  defaultLiquidity?: string;
  playlistOptions?: { id: string; name: string }[];
  defaultPlaylistId?: string;
  showPriceFields?: boolean;
}) {
  const [assetType, setAssetType] = useState(defaultAssetType);
  const isStable = assetType === "stablecoin" || assetType === "cash";
  const showApr = YIELD_BEARING_ASSET_TYPES.includes(assetType);

  return (
    <>
      <div className="flex gap-2">
        <select
          name="assetType"
          className="input"
          value={assetType}
          onChange={(e) => setAssetType(e.target.value)}
        >
          <option value="">Asset type — unset</option>
          {ASSET_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
        {!isStable && (
          <select name="direction" className="input" defaultValue={defaultDirection}>
            {DIRECTIONS.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>
        )}
      </div>

      {isStable && (
        <>
          {/* 1:1 by definition — no entry price to ask for. */}
          <input type="hidden" name="direction" value="long" />
          <input type="hidden" name="avgEntryPrice" value="1" />
          <input type="hidden" name="currentPrice" value="1" />
          <input type="hidden" name="riskLevel" value="low" />
          <input type="hidden" name="liquidity" value="high" />
          <input type="hidden" name="expectedReturn" value="conservative" />
          <p className="text-xs text-[var(--muted)]">
            Stablecoin: priced 1:1, so no entry price, risk or playlist is needed — just the amount you hold.
          </p>
        </>
      )}

      {!isStable && (
        <>
          {showPriceFields && (
            <div className="flex gap-2">
              <input
                name="avgEntryPrice"
                type="number"
                step="0.0001"
                placeholder="Avg entry price"
                className="input"
                required
              />
              <input
                name="currentPrice"
                type="number"
                step="0.0001"
                placeholder="Current price"
                className="input"
              />
            </div>
          )}

          {playlistOptions.length > 0 && (
            <select name="playlistId" className="input" defaultValue={defaultPlaylistId}>
              <option value="">Playlist — none</option>
              {playlistOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}

          <div className="pt-1 text-xs text-[var(--muted)]">Asset allocation tags (optional)</div>
          <div className="grid grid-cols-2 gap-2">
            <select name="riskLevel" className="input" defaultValue={defaultRisk}>
              <option value="">Risk — unset</option>
              {RISK_LEVELS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
            <select name="timeHorizon" className="input" defaultValue={defaultTimeHorizon}>
              <option value="">Time horizon — unset</option>
              {TIME_HORIZONS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
            <select name="expectedReturn" className="input" defaultValue={defaultExpectedReturn}>
              <option value="">Expected return — unset</option>
              {EXPECTED_RETURNS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
            <select name="liquidity" className="input" defaultValue={defaultLiquidity}>
              <option value="">Liquidity — unset</option>
              {LIQUIDITY_LEVELS.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </select>
          </div>
        </>
      )}

      {showApr && (
        <input
          name="apr"
          type="number"
          step="0.0001"
          defaultValue={defaultApr}
          placeholder="APR % (rendimento anual)"
          className="input"
        />
      )}
    </>
  );
}

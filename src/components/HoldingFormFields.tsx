"use client";

import { useState } from "react";
import { ASSET_TYPES, YIELD_BEARING_ASSET_TYPES, DIRECTIONS } from "@/lib/portfolio/tags";

/**
 * The asset-type / direction / APR trio.
 *
 * APR only makes sense for yield-bearing assets, so the field is hidden until
 * such a type is picked — that's why this small part of the form is a client
 * component while the rest of the page stays server-rendered.
 */
export default function HoldingFormFields({
  defaultAssetType = "",
  defaultDirection = "long",
  defaultApr = "",
}: {
  defaultAssetType?: string;
  defaultDirection?: string;
  defaultApr?: string;
}) {
  const [assetType, setAssetType] = useState(defaultAssetType);
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
        <select name="direction" className="input" defaultValue={defaultDirection}>
          {DIRECTIONS.map((d) => (
            <option key={d.value} value={d.value}>
              {d.label}
            </option>
          ))}
        </select>
      </div>

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

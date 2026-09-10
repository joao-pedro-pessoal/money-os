import { describe, it, expect } from "vitest";
import { knownListingFor, knownIsinCount } from "../knownListings";
import { isValidIsin } from "@/lib/portfolio/isin";

/**
 * A table written by hand deserves the checks a table written by hand needs.
 *
 * Every entry here was looked up one at a time after the automatic route chose
 * dormant venues for eleven positions in a row. The risk of hand-written data
 * is a typo that turns into a wrong price, so the shape of every row is
 * checked even though the values themselves can only be verified against a
 * broker's screen.
 */
describe("the hand-checked listing table", () => {
  it("finds the fund that started all this", () => {
    const sxr8 = knownListingFor("IE00B5BMR087");

    expect(sxr8?.symbol).toBe("SXR8.DE");
    expect(sxr8?.currency).toBe("EUR");
  });

  it("is not case- or whitespace-sensitive", () => {
    expect(knownListingFor(" ie00b5bmr087 ")?.symbol).toBe("SXR8.DE");
  });

  it("says nothing about an ISIN nobody checked", () => {
    // Falling back to OpenFIGI is the point: this is a shortcut, not a gate.
    expect(knownListingFor("IE00B4L5Y983")).toBeNull();
    expect(knownListingFor(null)).toBeNull();
    expect(knownListingFor("")).toBeNull();
  });

  it("records the Canadian listing as Canadian rather than omitting it", () => {
    // Knowing a position cannot be priced in the currency it was bought in is
    // a better answer than failing to find it again every time.
    const dfn = knownListingFor("CA25537R1091");

    expect(dfn?.symbol).toBe("DFN.TO");
    expect(dfn?.currency).toBe("CAD");
  });

  it("covers the crypto codes that are not ISINs at all", () => {
    // XF000BTC0017 is a Trade Republic house code. It has no issuer and no
    // OpenFIGI entry, so nothing could ever have priced it automatically.
    expect(knownListingFor("XF000BTC0017")?.symbol).toBe("BTC-EUR");
  });

  it("has a well-formed ISIN for every entry, including the crypto codes", () => {
    /**
     * Trade Republic's crypto codes pass the ISIN check digit.
     *
     * Worth writing down, because it is the reason they reach the lookup at
     * all — the importer only hunts for prices against something that
     * validates. They are house codes wearing a valid ISIN's clothes, which
     * is a happy accident here and a trap anywhere that assumes a valid ISIN
     * implies a listed security.
     */
    const everyEntry = ["IE00B5BMR087", "LU1681048804", "IE00B53SZB19", "IE00BYVQ9F29",
      "IE00BF4RFH31", "IE00BFNM3J75", "LU0322253906", "IE000KCS7J59", "LU1600334798",
      "CA25537R1091", "XF000BTC0017", "XF000ETH0019"];

    for (const isin of everyEntry) {
      expect(isValidIsin(isin), `${isin} fails its own check digit`).toBe(true);
      expect(knownListingFor(isin)).not.toBeNull();
    }
  });

  it("gives every entry a symbol, a currency and a name", () => {
    expect(knownIsinCount()).toBeGreaterThanOrEqual(11);

    for (const isin of ["IE00B5BMR087", "XF000BTC0017", "CA25537R1091"]) {
      const listing = knownListingFor(isin)!;
      expect(listing.symbol).toMatch(/\S/);
      expect(listing.currency).toMatch(/^[A-Z]{3}$/);
      expect(listing.name).toMatch(/\S/);
    }
  });
});

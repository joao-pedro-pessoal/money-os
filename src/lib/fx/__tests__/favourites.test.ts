import { describe, it, expect } from "vitest";
import {
  parseFavourites,
  serialiseFavourites,
  resolveDisplayCurrency,
  isConverted,
} from "../favourites";

describe("the favourites list", () => {
  it("always includes the base currency, first", () => {
    // It's the one denomination every stored figure is already comparable in,
    // so it can't be removed by editing a setting.
    expect(parseFavourites("USD,GBP", "EUR")).toEqual(["EUR", "USD", "GBP"]);
    expect(parseFavourites("", "EUR")).toEqual(["EUR"]);
    expect(parseFavourites(null, "USD")).toEqual(["USD"]);
  });

  it("normalises case and spacing", () => {
    expect(parseFavourites(" usd , gbp ", "eur")).toEqual(["EUR", "USD", "GBP"]);
  });

  it("drops anything that isn't a currency code", () => {
    // A hand-edited setting must not become a currency the app tries to
    // convert into and silently fails at.
    expect(parseFavourites("USD,not-a-currency,XX,GBPP,,GBP", "EUR")).toEqual([
      "EUR",
      "USD",
      "GBP",
    ]);
  });

  it("never lists the same currency twice", () => {
    expect(parseFavourites("USD,usd,EUR", "EUR")).toEqual(["EUR", "USD"]);
  });

  it("round-trips without storing the base redundantly", () => {
    const stored = serialiseFavourites(["EUR", "USD", "GBP"], "EUR");
    expect(stored).toBe("USD,GBP");
    expect(parseFavourites(stored, "EUR")).toEqual(["EUR", "USD", "GBP"]);
  });

  it("stores nothing when only the base was chosen", () => {
    expect(serialiseFavourites(["EUR"], "EUR")).toBe("");
  });
});

describe("choosing what to display in", () => {
  const favourites = ["EUR", "USD", "GBP"];

  it("uses the base when nothing was asked for", () => {
    expect(resolveDisplayCurrency(null, favourites, "EUR")).toBe("EUR");
    expect(resolveDisplayCurrency("", favourites, "EUR")).toBe("EUR");
  });

  it("honours a favourite", () => {
    expect(resolveDisplayCurrency("usd", favourites, "EUR")).toBe("USD");
  });

  it("falls back to the base for anything not on the list", () => {
    // A hand-edited URL asking for a currency with no rate would otherwise
    // render nulls all over a page about someone's money.
    expect(resolveDisplayCurrency("JPY", favourites, "EUR")).toBe("EUR");
    expect(resolveDisplayCurrency("nonsense", favourites, "EUR")).toBe("EUR");
  });

  it("falls back rather than breaking on a stale bookmark", () => {
    // GBP was a favourite yesterday and isn't today.
    expect(resolveDisplayCurrency("GBP", ["EUR", "USD"], "EUR")).toBe("EUR");
  });
});

describe("saying when a figure is converted", () => {
  it("is true only away from the base", () => {
    // A converted total moves when rates move, even though nothing about the
    // money changed — worth stating rather than leaving to be discovered.
    expect(isConverted("USD", "EUR")).toBe(true);
    expect(isConverted("EUR", "EUR")).toBe(false);
    expect(isConverted("eur", "EUR")).toBe(false);
  });
});

import { describe, it, expect } from "vitest";
import { attribute, realisedShare, SOURCES } from "../attribution";

const base = { unrealised: 0, realisedTrades: 0, dividends: 0, interest: 0 };

describe("splitting a gain into where it came from", () => {
  it("adds up to the net", () => {
    const a = attribute({ unrealised: 120, realisedTrades: 40, dividends: 25, interest: 3 });
    expect(a.net).toBe(188);
  });

  it("separates money in hand from a market opinion", () => {
    // The distinction the whole file exists for.
    const a = attribute({ unrealised: 120, realisedTrades: 40, dividends: 25, interest: 3 });
    expect(a.realised).toBe(68);
    expect(a.unrealised).toBe(120);
  });

  it("counts interest on idle cash as realised", () => {
    // It was paid and it landed. Nothing about it is a paper gain.
    const a = attribute({ ...base, interest: 5 });
    expect(a.realised).toBe(5);
    expect(a.unrealised).toBe(0);
    expect(SOURCES.find((s) => s.value === "interest")!.realised).toBe(true);
  });

  it("counts dividends as realised too", () => {
    expect(attribute({ ...base, dividends: 12 }).realised).toBe(12);
  });

  it("keeps a loss as a loss", () => {
    const a = attribute({ unrealised: -80, realisedTrades: 10, dividends: 0, interest: 0 });
    expect(a.net).toBe(-70);
    expect(a.lines.find((l) => l.key === "unrealised")!.amount).toBe(-80);
  });
});

describe("shares of the movement", () => {
  it("sizes each source by how much it moved, not by the net", () => {
    // A gain of 110 against a loss of 100 nets 10. Sharing out the net would
    // make the loss −1000%, which describes nothing.
    const a = attribute({ unrealised: -100, realisedTrades: 110, dividends: 0, interest: 0 });
    expect(a.net).toBe(10);
    const shares = Object.fromEntries(a.lines.map((l) => [l.key, l.share]));
    expect(shares.unrealised).toBeCloseTo(47.62, 1);
    expect(shares.realisedTrades).toBeCloseTo(52.38, 1);
  });

  it("shares sum to 100 when anything moved", () => {
    const a = attribute({ unrealised: 30, realisedTrades: -10, dividends: 5, interest: 1 });
    const total = a.lines.reduce((s, l) => s + l.share, 0);
    expect(total).toBeCloseTo(100, 1);
  });

  it("gives everything zero when nothing moved, instead of dividing by zero", () => {
    const a = attribute(base);
    expect(a.lines.every((l) => l.share === 0)).toBe(true);
    expect(a.net).toBe(0);
  });
});

describe("a platform that doesn't report realised trades", () => {
  it("says so instead of showing zero", () => {
    // "€0.00 realised" and "we don't know" are very different claims to make
    // about someone's money.
    const a = attribute({ ...base, realisedTrades: null, unrealised: 50 });
    expect(a.realisedTradesUnknown).toBe(true);
  });

  it("still adds up correctly, treating the unknown as nothing", () => {
    const a = attribute({ unrealised: 50, realisedTrades: null, dividends: 10, interest: 0 });
    expect(a.net).toBe(60);
  });

  it("is not flagged when the platform genuinely reports zero", () => {
    expect(attribute({ ...base, realisedTrades: 0 }).realisedTradesUnknown).toBe(false);
  });
});

describe("how much of it is actually yours", () => {
  it("is the realised part of everything that moved", () => {
    const a = attribute({ unrealised: 75, realisedTrades: 25, dividends: 0, interest: 0 });
    expect(realisedShare(a)).toBe(25);
  });

  it("is 100 when everything has been banked", () => {
    expect(realisedShare(attribute({ ...base, dividends: 40 }))).toBe(100);
  });

  it("is null, not zero, when nothing has moved at all", () => {
    // "0% realised" reads as a judgement about a portfolio that simply has
    // no gains to describe yet.
    expect(realisedShare(attribute(base))).toBeNull();
  });

  it("treats a realised loss as realised", () => {
    const a = attribute({ unrealised: 0, realisedTrades: -30, dividends: 0, interest: 0 });
    expect(realisedShare(a)).toBe(100);
  });
});

describe("every source is described", () => {
  it("has a label and an explanation", () => {
    for (const s of SOURCES) {
      expect(s.label.length).toBeGreaterThan(3);
      expect(s.help.length).toBeGreaterThan(20);
    }
  });

  it("marks exactly one source as unrealised", () => {
    expect(SOURCES.filter((s) => !s.realised).map((s) => s.value)).toEqual(["unrealised"]);
  });
});

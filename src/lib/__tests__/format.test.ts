import { describe, expect, it } from "vitest";
import { decimalInput, fmt, formatFor, formatNumber } from "../format";
import { LANGUAGES } from "../i18n/languages";
import { manualBalance } from "../money/manualEntry";

const spaces = (value: string) => value.replace(/\s/g," ");
describe("C1 selected-language amount formatting",()=>{
  it("defaults to English and keeps the amount's currency",()=>{
    expect(fmt(12298.77,"EUR")).toBe("€12,298.77");
    expect(fmt(12298.77,"USD")).toBe("$12,298.77");
    expect(fmt(12298.77,"GBP")).toBe("£12,298.77");
  });
  it("uses Portuguese notation only when selected",()=>{
    expect(spaces(fmt(12298.77,"EUR","pt"))).toBe("12 298,77 €");
    expect(spaces(fmt(-12.5,"EUR","pt"))).toBe("-12,50 €");
    expect(fmt(-12.5,"EUR","en")).toBe("-€12.50");
  });
  it("formats compact axes with the selected language",()=>{
    expect(formatNumber(4000,"en",{notation:"compact"})).toBe("4K");
    expect(spaces(formatNumber(4000,"pt",{notation:"compact"}))).toBe("4 mil");
  });
  it.each(["en","pt"] as const)("keeps editable balances ungrouped and accepted by the money parser (%s)",language=>{
    for(const value of [0,12.5,12298.77,-1234.5]) {
      const input=decimalInput(value,language);
      expect(input).not.toMatch(/\s/);
      expect(input).not.toMatch(/\d[,\.]\d{3}[,\.]/);
      expect(manualBalance(input)).toBe(value.toFixed(2));
    }
    expect(decimalInput(12298.77,language)).toBe(language==="en"?"12298.77":"12298,77");
  });
  it("binds a formatter without sharing language state between people",()=>{
    const en=formatFor("en"),pt=formatFor("pt");
    expect(en.fmt(12.5,"EUR")).toBe("€12.50");
    expect(spaces(pt.fmt(12.5,"EUR"))).toBe("12,50 €");
    expect(en.fmt(12.5,"EUR")).toBe("€12.50");
    expect(pt.input(12.5)).toBe("12,50");
  });
});

it.each(LANGUAGES)("keeps prefilled editable balances parser-compatible in $code",({code})=>{
  for(const value of [12298.77,-12.5])expect(manualBalance(decimalInput(value,code))).toBe(value.toFixed(2));
});

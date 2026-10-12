import { describe, expect, it } from "vitest";
import { spreadsheetSafe } from "../formula";
import { csvCell } from "../../backup";
import { csvField } from "../../reports/monthly";

describe("cells a spreadsheet would run", () => {
  it("are made text, whatever starts the formula", () => {
    for (const formula of ['=HYPERLINK("http://x","y")', "+1+1", "-2+3", "@SUM(A1)", "\t=1", "\r=1", "-Coffee"]) {
      expect(spreadsheetSafe(formula)).toBe(`'${formula}`);
    }
  });

  it("leave numbers, dates and plain words alone", () => {
    for (const plain of ["-12.5", "+3", "1e5", "-.5", "2026-10-01", "Coffee", "", "a=b"]) {
      expect(spreadsheetSafe(plain)).toBe(plain);
    }
  });

  it("are neutralised in the backup CSV and the report CSV, numbers kept as numbers", () => {
    expect(csvCell("=1+1")).toBe("'=1+1");
    expect(csvCell(-42.1)).toBe("-42.1");
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvField("@cmd")).toBe("'@cmd");
    expect(csvField(-3)).toBe("-3");
    expect(csvField("=a,b")).toBe(`"'=a,b"`);
  });
});

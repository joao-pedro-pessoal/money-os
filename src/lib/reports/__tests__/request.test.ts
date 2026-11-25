import { describe, expect, it } from "vitest";
import { pdfRequest, resolveReportPeriod } from "../request";

describe("shared report period and strict PDF boundary", () => {
  it("preserves default, legacy month and future-period behaviour", () => {
    expect(resolveReportPeriod({}, "2026-11-25")).toMatchObject({ kind: "month", key: "2026-11" });
    expect(resolveReportPeriod({ month: "2026-10" }, "2026-11-25").key).toBe("2026-10");
    expect(resolveReportPeriod({ period: "year", at: "9999" }, "2026-11-25").key).toBe("2026");
    expect(resolveReportPeriod({ period: "custom" }, "2026-11-25").key).toBe("2026-10-27..2026-11-25");
  });
  it.each(["", "period=week&at=2026-W01", "month=2026-09", "period=custom&from=2026-01-01&to=2026-02-01&scope=money"])("accepts a normal report request: %s", query => {
    expect(() => pdfRequest(new URLSearchParams(query), "2026-11-25", 3660)).not.toThrow();
  });
  it.each(["period=bad", "scope=someone", "userId=other", "period=month&period=year", "from=2026-02-31", "at=2026-W99", "period=custom&from=2026-02-01&to=2026-01-01"])("rejects malformed PDF parameters: %s", query => {
    expect(() => pdfRequest(new URLSearchParams(query), "2026-11-25", 3660)).toThrow();
  });
  it("applies the custom range limit after the page's shared normalisation", () => {
    expect(() => pdfRequest(new URLSearchParams("period=custom&from=2000-01-01&to=2026-11-25"), "2026-11-25", 3660)).toThrow(/range/);
    expect(() => pdfRequest(new URLSearchParams("period=custom&from=2026-11-01&to=2099-01-01"), "2026-11-25", 30)).not.toThrow();
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { reportDownload } from "../reportDownload";
afterEach(() => vi.unstubAllGlobals());
describe("PDF download errors", () => {
  it("shows the server's retry delay in Portuguese without parsing a host error page", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("host error", { status: 429, headers: { "Retry-After": "42" } })));
    await expect(reportDownload("/api/report/pdf", "pt")).rejects.toThrow("42 segundos");
  });
  it("offers CSV for a bounded report and handles an expired session", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response("", { status: 413 })).mockResolvedValueOnce(new Response("", { status: 401 })));
    await expect(reportDownload("/api/report/pdf", "pt")).rejects.toThrow("CSV");
    await expect(reportDownload("/api/report/pdf", "pt")).rejects.toThrow("sessão");
  });
  it("localises network failure and accepts an actual PDF response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValueOnce(new TypeError("Failed to fetch")).mockResolvedValueOnce(new Response("%PDF-synthetic", { headers: { "Content-Type": "application/pdf" } })));
    await expect(reportDownload("/api/report/pdf", "pt")).rejects.toThrow("Não foi possível");
    expect(await (await reportDownload("/api/report/pdf", "en")).text()).toBe("%PDF-synthetic");
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { transferRequest } from "../transferClient";
import { transferText } from "@/lib/backup/text";
afterEach(() => vi.unstubAllGlobals());
describe("transfer response recovery", () => {
  it("localises a real network failure without claiming nothing committed", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    await expect(transferRequest("/api/import/bank", "{}", "pt")).rejects.toThrow(transferText("pt").failed);
  });
  it("does not render private server diagnostics or call an unconfirmed result a refusal", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ message: "private database details" }, { status: 500 })));
    await expect(transferRequest("/api/backup/restore", "{}", "pt")).rejects.toThrow(transferText("pt").failed);
  });
  it("shows a stable Retry-After message and handles a host-generated non-JSON 413", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response("", { status: 429, headers: { "retry-after": "42" } })).mockResolvedValueOnce(new Response("host error", { status: 413 }));
    vi.stubGlobal("fetch", fetcher);
    await expect(transferRequest("/api/backup/inspect", "{}", "pt")).rejects.toThrow("42 segundos");
    await expect(transferRequest("/api/backup/inspect", "{}", "pt")).rejects.toThrow(transferText("pt").tooLarge);
  });
  it("returns inspection details while refusing an expired session", async () => {
    const report = { ok: false, errors: ["invalid row"], warnings: [], counts: {} };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(Response.json(report, { status: 400 })).mockResolvedValueOnce(new Response("", { status: 401 })));
    expect(await transferRequest("/api/backup/inspect", "{}", "en")).toEqual(report);
    await expect(transferRequest("/api/backup/inspect", "{}", "pt")).rejects.toThrow(transferText("pt").session);
  });
});

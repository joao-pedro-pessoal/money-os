import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ authenticated: true, limited: false, calls: 0, restore: vi.fn(), inspect: vi.fn(), completed: vi.fn(), commit: vi.fn() }));
vi.mock("@/actions/session", () => ({ hasSession: async () => state.authenticated }));
vi.mock("@/actions/workGate", () => {
  class WorkLimitedError extends Error { constructor(public retryAfter: number) { super("Too many requests."); } }
  return { WorkLimitedError, withWork: async (_kind: string, work: () => Promise<unknown>) => { state.calls++; if (state.limited) throw new WorkLimitedError(60); return work(); } };
});
vi.mock("@/actions/backupService", () => ({ prepareBackup: state.inspect, replaceBackup: state.restore, completedRestore: state.completed }));
vi.mock("@/actions/importService", () => ({ commitValidatedImport: state.commit }));
import { POST as backup } from "@/app/api/backup/[operation]/route";
import { POST as bank } from "@/app/api/import/bank/route";
import { boundedBody } from "../transferHttp";
const headers = { origin: "https://money.example", "content-type": "application/json" };
const request = (body = "{}", extra: Record<string, string> = {}) => new Request("https://money.example/api/backup/inspect", { method: "POST", headers: { ...headers, ...extra }, body });
const context = (operation = "inspect") => ({ params: Promise.resolve({ operation }) });
const originCases: Record<string, string>[] = [{ origin: "https://evil.example" }, { origin: "null" }, { "sec-fetch-site": "cross-site" }];
beforeEach(() => {
  state.authenticated = true; state.limited = false; state.calls = 0;
  state.restore.mockReset().mockResolvedValue({ ok: true, counts: {} });
  state.inspect.mockReset().mockReturnValue({ check: { ok: true, errors: [], warnings: [], counts: {} } });
  state.completed.mockReset().mockResolvedValue(undefined);
  state.commit.mockReset().mockResolvedValue({ importId: "synthetic", created: 1, net: -1, categorised: 0, duplicated: 0 });
});

describe("authenticated bounded HTTP transfer contracts", () => {
  it.each([backup, bank])("refuses anonymous callers before reading their upload", async handler => {
    state.authenticated = false;
    const input = request(); const read = vi.spyOn(input.body!, "getReader");
    const response = await handler(input, context());
    expect(response.status).toBe(401); expect(read).not.toHaveBeenCalled(); expect(state.calls).toBe(0);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
  it.each(originCases)("rejects cross-origin uploads before quota or parsing: %j", async extra => {
    const response = await backup(request("{}", extra), context());
    expect(response.status).toBe(403); expect(state.calls).toBe(0); expect(state.restore).not.toHaveBeenCalled();
  });
  it("requires JSON and explicit confirmation in the handler itself", async () => {
    expect((await backup(request("{}", { "content-type": "text/plain" }), context())).status).toBe(415);
    expect((await backup(request(), context("restore"))).status).toBe(400);
    expect(state.restore).not.toHaveBeenCalled();
  });
  it("uses the actual target Host when Next normalises a local request URL", async () => {
    const input = new Request("http://localhost:3207/api/backup/inspect", { method: "POST", headers: { host: "127.0.0.1:3207", origin: "http://127.0.0.1:3207", "content-type": "application/json" }, body: "{}" });
    expect((await backup(input, context())).status).toBe(200);
    expect((await backup(request("{}", { host: "money.example", origin: "http://money.example" }), context())).status).toBe(403);
  });
  it("returns HTTP 429 and Retry-After before consuming an expensive upload", async () => {
    state.limited = true;
    const input = request(); const read = vi.spyOn(input.body!, "getReader");
    const response = await backup(input, context());
    expect(response.status).toBe(429); expect(response.headers.get("retry-after")).toBe("60");
    expect(await response.json()).toMatchObject({ error: "rate_limited", retryAfter: 60 });
    expect(read).not.toHaveBeenCalled();
  });
  it("enforces the byte cap even with a missing or dishonest Content-Length", async () => {
    const input = request("ééé", { "content-length": "1" });
    await expect(boundedBody(input, 5)).rejects.toMatchObject({ status: 413 });
    await expect(boundedBody(request("{}", { "content-length": "999" }), 5)).rejects.toMatchObject({ status: 413 });
  });
  it("returns a structured failed inspection and never runs restore", async () => {
    state.inspect.mockReturnValue({ check: { ok: false, errors: ["invalid row"], warnings: [], counts: {} }, status: 400 });
    const response = await backup(request(), context());
    expect(response.status).toBe(400); expect(await response.json()).toMatchObject({ ok: false, errors: ["invalid row"] });
    expect(state.restore).not.toHaveBeenCalled();
  });
  it("repeats a committed restore without another quota slot or deletion", async () => {
    state.completed.mockResolvedValue({ ok: true, counts: { accounts: 1 } });
    const response = await backup(request("{}", { "x-money-confirmation": "RESTORE", "x-money-request": "00000000-0000-4000-8000-000000000001", "x-money-sha256": "a".repeat(64) }), context("restore"));
    expect(response.status).toBe(200); expect(state.calls).toBe(0); expect(state.restore).not.toHaveBeenCalled();
  });
  it("parses the actual CSV on the server and computes its own integrity metadata", async () => {
    const response = await bank(request(JSON.stringify({ accountId: "account", fileName: "synthetic.csv", text: "Date,Amount,Description\n2026-11-01,-1,Synthetic\n", mapping: '{"date":"Date","amount":"Amount","description":"Description"}', adjustBalance: false, requestId: "00000000-0000-4000-8000-000000000001" })));
    expect(response.status).toBe(200);
    expect(state.commit).toHaveBeenCalledWith("account", "synthetic.csv", [expect.objectContaining({ amount: -1, description: "Synthetic" })], expect.any(String), false, expect.objectContaining({ fileHash: expect.stringMatching(/^[a-f0-9]{64}$/), rowsInFile: 1 }), expect.any(String));
  });
  it("does not echo SQL failures or file contents", async () => {
    state.inspect.mockImplementation(() => { throw new Error("postgres://secret@example/sensitive"); });
    const response = await backup(request(), context());
    expect(response.status).toBe(500); expect(await response.text()).not.toMatch(/postgres|secret|sensitive/);
  });
});

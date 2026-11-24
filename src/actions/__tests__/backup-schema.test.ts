import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@/db/client", () => ({ db: new Proxy({}, { get() { throw new Error("Database touched during inspection"); } }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
import { prepareBackup } from "../backupService";
import { BACKUP_TABLES, type BackupTable } from "@/lib/backup";

const account = { id: "account", name: "Synthetic", institution: "Synthetic", accountType: "bank" };
const backup = (overrides: Partial<Record<BackupTable, unknown[]>> = {}) => JSON.stringify({ version: 1, data: { ...Object.fromEntries(BACKUP_TABLES.map(table => [table, []])), ...overrides } });
afterEach(() => vi.unstubAllEnvs());

describe("full personal backup schema before deleting anything", () => {
  it("allows old backups to omit new defaulted fields and tables", () => {
    expect(prepareBackup(JSON.stringify({ version: 1, data: { accounts: [account] } })).check.ok).toBe(true);
  });
  it.each(BACKUP_TABLES)("checks every %s row, even after an otherwise valid file", table => {
    expect(prepareBackup(backup({ [table]: [null] })).check.ok).toBe(false);
    expect(prepareBackup(backup({ [table]: [[]] })).check.ok).toBe(false);
  });
  it.each([
    { name: undefined }, { balance: "NaN" }, { balance: "Infinity" }, { balance: {} },
    { balance: "1.001" }, { balance: "99999999999999999" }, { archived: "false" },
    { createdAt: "2026-02-31T00:00:00Z" }, { createdAt: "today" }, { name: "nul\0text" }, { extra: 1 },
  ])("refuses invalid fields instead of deferring to PostgreSQL: %j", fields => {
    expect(prepareBackup(backup({ accounts: [{ ...account, ...fields }] })).check.ok).toBe(false);
  });
  it("drops a forged owner, revives timestamp columns and keeps exact numeric text", () => {
    const prepared = prepareBackup(backup({ accounts: [{ ...account, userId: "someone-else", balance: "100.01", createdAt: "2026-11-24T10:00:00Z" }] }));
    expect(prepared.check.ok).toBe(true);
    expect(prepared.rows?.accounts?.[0]).toMatchObject({ balance: "100.01", createdAt: new Date("2026-11-24T10:00:00Z") });
    expect(prepared.rows?.accounts?.[0]).not.toHaveProperty("userId");
  });
  it("keeps the legacy single-playlist association in a watchlist backup", () => {
    const result = prepareBackup(backup({ playlists: [{ id: "playlist", name: "Synthetic" }], watchlistItems: [{ id: "watch", symbol: "SYNTH", playlistId: "playlist" }] }));
    expect(result.check.ok).toBe(true);
    expect(result.rows?.watchlistItems?.[0]).toMatchObject({ legacyPlaylistId: "playlist", playlistIds: ["playlist"] });
  });
  it("refuses duplicate primary keys and references absent from the file", () => {
    expect(prepareBackup(backup({ accounts: [account, account] })).check.errors.join()).toMatch(/duplicate/);
    const result = prepareBackup(backup({ accounts: [account], transactions: [{ id: "tx", accountId: "foreign", type: "expense", amount: "-1", date: "2026-11-01" }] }));
    expect(result.check.errors.join()).toMatch(/References/);
  });
  it("checks whole-file row and byte limits, including ignored tables", () => {
    vi.stubEnv("BACKUP_MAX_ROWS", "1");
    expect(prepareBackup(backup({ accounts: [account, { ...account, id: "two" }] })).status).toBe(413);
    expect(prepareBackup(JSON.stringify({ version: 1, data: { ignored: [1, 2] } })).status).toBe(413);
    vi.stubEnv("BACKUP_MAX_BYTES", "10");
    expect(prepareBackup(backup()).status).toBe(413);
  });
  it("rejects malformed envelopes and deeply nested unknown data", () => {
    for (const value of [null, [], { version: -1, data: {} }, { version: 1, data: [] }, { version: 1, data: {} }]) expect(prepareBackup(JSON.stringify(value)).check.ok).toBe(false);
    expect(prepareBackup('{"version":1,"data":{},"ignored":' + "[".repeat(33) + "0" + "]".repeat(33) + "}").check.ok).toBe(false);
  });
  it("enforces the approved default of 100000 rows before checking individual cells", () => {
    const text = JSON.stringify({ version: 1, data: { accounts: [], ignored: Array(100001).fill(0) } });
    expect(prepareBackup(text)).toMatchObject({ status: 413, check: { ok: false } });
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/db/schema";
import { BACKUP_TABLES, BACKUP_VERSION } from "@/lib/backup";

type Rows = Map<unknown, unknown[]>;
const fake = vi.hoisted(() => ({ rows: new Map<unknown, unknown[]>(), failTable: null as unknown,
  afterRead: null as ((table: unknown) => void) | null, revalidate: vi.fn() }));

function store(read: () => Rows) {
  return {
    select: () => ({ from: async (table: unknown) => {
      const result = structuredClone(read().get(table) ?? []);
      fake.afterRead?.(table);
      return result;
    } }),
    delete: async (table: unknown) => { read().set(table, []); },
    insert: (table: unknown) => ({ values: async (rows: unknown[]) => {
      if (table === fake.failTable) throw new Error("synthetic insert failure");
      read().set(table, structuredClone(rows));
    } }),
  };
}
vi.mock("@/db/client", () => ({ db: {
  ...store(() => fake.rows),
  transaction: async (work: (tx: ReturnType<typeof store>) => Promise<unknown>, options?: { isolationLevel?: string; accessMode?: string }) => {
    const snapshot = new Map([...fake.rows].map(([key, value]) => [key, structuredClone(value)]));
    const result = await work(store(() => options?.accessMode === "read only" && options.isolationLevel !== "repeatable read" ? fake.rows : snapshot));
    if (options?.accessMode !== "read only") fake.rows = snapshot;
    return result;
  },
} }));
vi.mock("next/cache", () => ({ revalidatePath: fake.revalidate }));
import { exportAllData, restoreBackup } from "../export";

function restoreForm() {
  const data: Record<string, unknown[]> = Object.fromEntries(BACKUP_TABLES.map((name) => [name, []]));
  data.accounts = [{ id: "restored" }];
  const form = new FormData();
  form.set("backup", JSON.stringify({ version: BACKUP_VERSION, data }));
  form.set("confirmation", "RESTORE");
  return form;
}
beforeEach(() => {
  fake.rows = new Map([[schema.accounts, [{ id: "original", balance: "100" }]]]);
  fake.failTable = null; fake.afterRead = null; fake.revalidate.mockClear();
});
describe("personal backup safety", () => {
  it("keeps all original data when an insertion fails after the deletions", async () => {
    fake.failTable = schema.accounts;
    await expect(restoreBackup(restoreForm())).rejects.toThrow("synthetic insert failure");
    expect(fake.rows.get(schema.accounts)).toEqual([{ id: "original", balance: "100" }]);
    expect(fake.revalidate).not.toHaveBeenCalled();
  });
  it("commits the replacement after every insertion succeeds", async () => {
    await expect(restoreBackup(restoreForm())).resolves.toMatchObject({ ok: true });
    expect(fake.rows.get(schema.accounts)).toEqual([{ id: "restored" }]);
    expect(fake.revalidate).toHaveBeenCalled();
  });
  it("requires the confirmation in the server action before deleting anything", async () => {
    const form = restoreForm(); form.delete("confirmation");
    await expect(restoreBackup(form)).rejects.toThrow(/RESTORE/);
    expect(fake.rows.get(schema.accounts)).toEqual([{ id: "original", balance: "100" }]);
  });
  it("exports one snapshot when a movement is saved between table reads", async () => {
    fake.afterRead = (table) => {
      if (table === schema.accounts) {
        fake.rows.set(schema.accounts, [{ id: "original", balance: "80" }]);
        fake.rows.set(schema.transactions, [{ id: "expense", amount: "20" }]);
      }
    };
    const backup = JSON.parse(await exportAllData());
    expect(backup.data.accounts[0].balance).toBe("100");
    expect(backup.data.transactions).toEqual([]);
    expect(fake.rows.get(schema.transactions)).toHaveLength(1);
  });
});

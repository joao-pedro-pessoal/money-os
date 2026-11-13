import { describe, expect, it, vi } from "vitest";
import { getTableName } from "drizzle-orm";
vi.mock("@/actions/session", () => ({ hasSession: async () => true }));

vi.mock("@/db/client", () => ({ db: {
  select: () => ({ from: async (table: Parameters<typeof getTableName>[0]) => getTableName(table) === "account_connections" ? [{
    id: "connection-a", accountId: "account-a", platform: "bybit",
    externalId: "synthetic-api-key-do-not-send", encryptedSecret: "sealed-secret",
    encryptedPassphrase: "sealed-passphrase", encryptedSession: "sealed-bank-session",
    lastEquity: "100", lastMarginUsed: null, lastWithdrawable: null,
    lastSyncAt: null, lastSyncStatus: null,
  }] : [{ id: "account-a", name: "Broker" }] }),
} }));

describe("connection data returned by a Server Action", () => {
  it("returns only the masked identifier and excludes stored credentials", async () => {
    const { listConnections } = await import("../connections");
    const [connection] = await listConnections();
    expect(connection.externalIdMasked).toBeTruthy();
    expect(connection).not.toHaveProperty("externalId");
    expect(connection).not.toHaveProperty("encryptedSecret");
    expect(connection).not.toHaveProperty("encryptedPassphrase");
    expect(connection).not.toHaveProperty("encryptedSession");
    expect(JSON.stringify(connection)).not.toContain("synthetic-api-key-do-not-send");
  });
});

import { describe, expect, it } from "vitest";
import { closedTestPreflight } from "../preflight";

const ready = {
  OPERATOR_NAME: "Test Operator", CONTACT_EMAIL: "test@example.com", COOKIE_SECURE: "true",
  APP_SECRET: "0123456789abcdef".repeat(4), MAX_ACCOUNTS: "40", REGISTRATION_MODE: "invite",
  REGISTRATION_INVITE_CODE: "abcdef0123456789".repeat(3),
  DATABASE_URL: "postgresql://moneyos_app:test-password@db.example.com/moneyos",
};
describe("hosted closed-test configuration", () => {
  it("accepts a configured invitation test without claiming external checks passed", () => {
    expect(closedTestPreflight(ready)).toEqual([]);
    expect(closedTestPreflight({}).length).toBeGreaterThan(0);
  });
  it("refuses insecure, undersized or publicly open configurations", () => {
    for (const change of [
      { COOKIE_SECURE: "false" }, { APP_SECRET: "short" }, { MAX_ACCOUNTS: "10" },
      { REGISTRATION_MODE: "open" }, { ENCRYPTION_KEY: "private-broker-key" },
      { DATABASE_URL: "postgresql://neondb_owner:secret@db.example.com/db" },
      { DATABASE_URL: "postgresql://moneyos_app:secret@db-pooler.example.com/db" },
    ]) expect(closedTestPreflight({ ...ready, ...change }).length).toBeGreaterThan(0);
  });
  it("does not reveal environment values in diagnostics", () => {
    const messages = closedTestPreflight({ ...ready, CONTACT_EMAIL: "private-invalid", ENCRYPTION_KEY: "private-key", DATABASE_URL: "private-url" }).join(" ");
    expect(messages).not.toMatch(/private-|test-password/);
  });
});

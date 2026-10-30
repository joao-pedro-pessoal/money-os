import { describe, expect, it } from "vitest";
import { closedTestPreflight, moneyReleasePreflight } from "../preflight";

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

describe("first money release configuration",()=>{
  it("requires the money edition explicitly rather than changing the home copy",()=>{
    expect(moneyReleasePreflight({...ready,APP_EDITION:"money"})).toEqual([]);
    for(const APP_EDITION of [undefined,"full","Money"]) expect(moneyReleasePreflight({...ready,APP_EDITION})).toContain("Definir APP_EDITION=money antes de compilar a primeira versão publicada.");
  });
  it("keeps the invitation, cookie and database checks in the reduced release",()=>{
    expect(moneyReleasePreflight({...ready,APP_EDITION:"money",REGISTRATION_MODE:"open"}).length).toBeGreaterThan(0);
    expect(moneyReleasePreflight({...ready,APP_EDITION:"money",COOKIE_SECURE:"false"}).length).toBeGreaterThan(0);
  });
});

import { describe, expect, it } from "vitest";
import { normalizeEmail, ownerEmailFrom, signInRoute } from "../signInRoute";

describe("where a sign-in goes", () => {
  it("sends the owner's email to the site, whatever its case and spaces", () => {
    const ownerEmail = ownerEmailFrom("  Owner@Example.com ");
    expect(ownerEmail).toBe("owner@example.com");
    expect(signInRoute({ email: "OWNER@example.com ", ownerEmail, hasVaultAccount: false })).toBe("owner");
  });

  it("sends every other email to a vault once the owner's is set", () => {
    const ownerEmail = ownerEmailFrom("owner@example.com");
    expect(signInRoute({ email: "sister@example.com", ownerEmail, hasVaultAccount: true })).toBe("vault");
    // No account either: the vault's own answer is the same "wrong", so the
    // page never says whether an email exists.
    expect(signInRoute({ email: "stranger@example.com", ownerEmail, hasVaultAccount: false })).toBe("vault");
  });

  /** An installation that has not set APP_EMAIL must still open with its password. */
  it("without the owner's email, takes an email with no vault as the owner's", () => {
    expect(ownerEmailFrom(undefined)).toBeNull();
    expect(ownerEmailFrom("   ")).toBeNull();
    expect(signInRoute({ email: "me@example.com", ownerEmail: null, hasVaultAccount: false })).toBe("owner");
    expect(signInRoute({ email: "sister@example.com", ownerEmail: null, hasVaultAccount: true })).toBe("vault");
  });

  it("compares emails the way the vault stores them", () => {
    expect(normalizeEmail("  Ana.Silva@Mail.PT ")).toBe("ana.silva@mail.pt");
  });
});

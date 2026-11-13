import { afterEach, describe, expect, it, vi } from "vitest";
import { asUser } from "@/db/acting";

const identity = vi.hoisted(() => ({ signedIn: false, checks: 0 }));
vi.mock("../session", () => ({ hasSession: async () => { identity.checks++; return identity.signedIn; } }));
import { requireServerSession } from "../requestSession";

afterEach(() => { identity.signedIn = false; identity.checks = 0; });

describe("private server work needs an authenticated or internal identity", () => {
  it("refuses an anonymous request", async () => {
    await expect(requireServerSession()).rejects.toThrow("Sign in again.");
  });
  it("accepts an authenticated request", async () => {
    identity.signedIn = true;
    await expect(requireServerSession()).resolves.toBeUndefined();
    expect(identity.checks).toBe(1);
  });
  it("preserves trusted scheduler/sign-up work without a browser cookie", async () => {
    await asUser("internal-person", async () => {
      await expect(requireServerSession()).resolves.toBeUndefined();
    });
    expect(identity.checks).toBe(0);
    await expect(requireServerSession()).rejects.toThrow("Sign in again.");
  });
  it("does not treat an empty internal identity as authentication", async () => {
    identity.signedIn = true;
    await asUser("", async () => {
      await expect(requireServerSession()).rejects.toThrow("Sign in again.");
    });
    expect(identity.checks).toBe(0);
  });
  it("keeps internal identities isolated between concurrent jobs", async () => {
    await Promise.all([
      asUser("internal-person", async () => { await Promise.resolve(); await expect(requireServerSession()).resolves.toBeUndefined(); }),
      asUser("", async () => { await Promise.resolve(); await expect(requireServerSession()).rejects.toThrow("Sign in again."); }),
    ]);
    await expect(requireServerSession()).rejects.toThrow("Sign in again.");
  });
});

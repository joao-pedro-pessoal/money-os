import { afterEach, describe, expect, it, vi } from "vitest";
const fake = vi.hoisted(() => ({ select: vi.fn(() => { throw new Error("database must not be reached"); }) }));
vi.mock("@/db/client", () => ({ db: fake, asUser: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("../session", () => ({ currentUserId: vi.fn() }));
vi.mock("../fx", () => ({ refreshRates: vi.fn() }));
import { signUp } from "../auth";

afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
describe("the sign-up endpoint enforces invitations", () => {
  it("rejects direct calls without the code before reaching the database", async () => {
    vi.stubEnv("REGISTRATION_MODE", "invite");
    vi.stubEnv("REGISTRATION_INVITE_CODE", "0123456789abcdef".repeat(3));
    for (const inviteCode of [undefined, "wrong"]) {
      expect(await signUp({ email: "tester@example.com", signInKey: "a".repeat(64), inviteCode }))
        .toMatchObject({ kind: "refused", reason: "A valid invitation code is required to create an account." });
    }
    expect(fake.select).not.toHaveBeenCalled();
  });
});

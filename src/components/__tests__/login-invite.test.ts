import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@/components/AuthFrame", () => ({ default: () => null }));
vi.mock("@/components/LoginScreen", () => ({ default: () => null }));
import LoginPage from "@/app/login/page";

afterEach(() => vi.unstubAllEnvs());
describe("invitation configuration sent to the login screen", () => {
  it("passes only the requirement, never the configured invitation secret", async () => {
    vi.stubEnv("REGISTRATION_MODE", "invite");
    vi.stubEnv("REGISTRATION_INVITE_CODE", "private-invite-code".repeat(3));
    vi.stubEnv("MAX_ACCOUNTS", "40");
    const page = await LoginPage({ searchParams: Promise.resolve({}) });
    expect(page.props.children.props).toEqual({ signUps: true, inviteRequired: true, destination: "/", googleEnabled: false, googleFailed: false });
    expect(JSON.stringify(page)).not.toContain("private-invite-code");
  });
  it("exposes only Google availability, never its server credentials", async () => {
    vi.stubEnv("GOOGLE_LOGIN_ENABLED", "true"); vi.stubEnv("GOOGLE_AUTH_ORIGIN", "https://money.example.test");
    vi.stubEnv("GOOGLE_CLIENT_ID", "web.apps.googleusercontent.com"); vi.stubEnv("GOOGLE_CLIENT_SECRET", "synthetic-google-private-secret");
    const page = await LoginPage({ searchParams: Promise.resolve({}) });
    expect(page.props.children.props.googleEnabled).toBe(true);
    expect(JSON.stringify(page)).not.toContain("synthetic-google-private-secret");
    expect(JSON.stringify(page)).not.toContain("web.apps.googleusercontent.com");
  });
  it("hides sign-up when invitation mode has no usable secret", async () => {
    vi.stubEnv("REGISTRATION_MODE", "invite");
    vi.stubEnv("REGISTRATION_INVITE_CODE", "");
    const page = await LoginPage({ searchParams: Promise.resolve({}) });
    expect(page.props.children.props.signUps).toBe(false);
  });
});

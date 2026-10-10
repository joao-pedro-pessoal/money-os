import { describe, expect, it } from "vitest";
import { registrationAccess, registrationMode } from "../registration";

const secret = "0123456789abcdef".repeat(3);
const env = { REGISTRATION_MODE: "invite", REGISTRATION_INVITE_CODE: secret };
describe("closed-test invitation policy", () => {
  it("keeps existing installations open but refuses unknown configuration", () => {
    expect(registrationAccess({})).toBeNull();
    expect(registrationAccess({ REGISTRATION_MODE: "closed" }, secret)).not.toBeNull();
    expect(registrationMode({ REGISTRATION_MODE: "invte" })).toBe("closed");
  });
  it("requires a configured strong code and a matching invitation", () => {
    expect(registrationAccess(env, secret)).toBeNull();
    expect(registrationAccess(env, ` ${secret} `)).toBeNull();
    for (const value of [undefined, "", "wrong", "x".repeat(300)]) expect(registrationAccess(env, value)).not.toBeNull();
    expect(registrationAccess({ REGISTRATION_MODE: "invite" }, secret)).not.toBeNull();
    expect(registrationAccess({ ...env, REGISTRATION_INVITE_CODE: "short" }, "short")).not.toBeNull();
  });
  it("revokes a previous invitation when the configured code changes", () => {
    expect(registrationAccess({ ...env, REGISTRATION_INVITE_CODE: "new-code".repeat(6) }, secret)).not.toBeNull();
  });
});

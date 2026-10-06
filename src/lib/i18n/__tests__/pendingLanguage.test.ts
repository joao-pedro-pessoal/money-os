import { describe, expect, it } from "vitest";
import { pendingLanguage } from "../pendingLanguage";

describe("language reconciliation", () => {
  it("shows a choice immediately, then releases it once acknowledged", () => {
    const choice = { from: "en", value: "pt" } as const;
    expect(pendingLanguage("en", choice)).toBe(choice);
    const acknowledged = pendingLanguage("pt", choice);
    expect(acknowledged).toBeNull();
    // Another tab chooses English: the old local choice must not override it.
    expect(pendingLanguage("en", acknowledged)).toBeNull();
  });
  it("does not retain a choice identical to the server", () => {
    expect(pendingLanguage("pt", { from: "pt", value: "pt" })).toBeNull();
  });
});

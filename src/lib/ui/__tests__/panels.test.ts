import { describe, expect, it } from "vitest";
import { startsCollapsed } from "../panels";

const base = { saved: null, defaultOpen: true, phone: false, essential: false };

describe("startsCollapsed", () => {
  it("keeps a choice made on this device, whatever the screen or the page says", () => {
    for (const phone of [true, false]) {
      for (const essential of [true, false]) {
        for (const defaultOpen of [true, false]) {
          expect(startsCollapsed({ saved: "closed", defaultOpen, phone, essential })).toBe(true);
          expect(startsCollapsed({ saved: "open", defaultOpen, phone, essential })).toBe(false);
        }
      }
    }
  });

  it("follows the page on a computer, essential or not", () => {
    expect(startsCollapsed({ ...base })).toBe(false);
    expect(startsCollapsed({ ...base, essential: true })).toBe(false);
    expect(startsCollapsed({ ...base, defaultOpen: false })).toBe(true);
  });

  it("opens only the essential panels on a phone", () => {
    expect(startsCollapsed({ ...base, phone: true })).toBe(true);
    expect(startsCollapsed({ ...base, phone: true, essential: true })).toBe(false);
  });

  it("never opens on a phone a panel the page keeps closed", () => {
    expect(startsCollapsed({ ...base, phone: true, essential: true, defaultOpen: false })).toBe(true);
  });

  it("treats an unrecognised saved value as no choice at all", () => {
    expect(startsCollapsed({ ...base, saved: "maybe", phone: true })).toBe(true);
    expect(startsCollapsed({ ...base, saved: "", phone: false })).toBe(false);
  });
});

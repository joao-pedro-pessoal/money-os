import { describe, expect, it } from "vitest";
import { panelValue, startsCollapsed } from "../panels";

const base = { saved: null, defaultOpen: true, phone: false, essential: false };

describe("startsCollapsed", () => {
  it("keeps a choice made on this device, whatever the screen says", () => {
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

  /**
   * The analysis page takes each panel's `defaultOpen` from the window
   * preferences in Settings, so it changes its mind when the reader changes a
   * setting. A "closed" saved before that used to win for good: the setting
   * did nothing, and nothing said why.
   */
  it("drops a choice made when the page was saying something else", () => {
    expect(startsCollapsed({ ...base, saved: panelValue(true, false), defaultOpen: true })).toBe(false);
    expect(startsCollapsed({ ...base, saved: panelValue(false, true), defaultOpen: false })).toBe(true);
  });

  it("keeps a choice made against the page as it still is", () => {
    expect(startsCollapsed({ ...base, saved: panelValue(true, true), defaultOpen: true })).toBe(true);
    expect(startsCollapsed({ ...base, saved: panelValue(false, false), defaultOpen: false })).toBe(false);
    // And the screen still does not override a choice.
    expect(startsCollapsed({ ...base, saved: panelValue(false, true), phone: true })).toBe(false);
  });

  it("honours a value saved before any of this was recorded", () => {
    expect(startsCollapsed({ ...base, saved: "closed", defaultOpen: true })).toBe(true);
    expect(startsCollapsed({ ...base, saved: "open", defaultOpen: false })).toBe(false);
  });

  it("writes the choice with what it was based on", () => {
    expect(panelValue(true, true)).toBe("closed:open");
    expect(panelValue(false, false)).toBe("open:closed");
  });

  it("treats an unrecognised saved value as no choice at all", () => {
    expect(startsCollapsed({ ...base, saved: "maybe", phone: true })).toBe(true);
    expect(startsCollapsed({ ...base, saved: "", phone: false })).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { foldStorageKey, panelChoice, panelStorageKey, panelValue, startsCollapsed } from "../panels";

const base = { defaultOpen: true, phone: false, essential: false, saved: null };

describe("panel preference precedence", () => {
  it("recomputes defaults when the screen changes without turning them into a choice", () => {
    expect(startsCollapsed({ ...base, phone: true })).toBe(true);
    expect(startsCollapsed({ ...base, phone: false })).toBe(false);
    expect(startsCollapsed({ ...base, phone: true })).toBe(true);
  });

  it("keeps an explicit choice when the screen changes", () => {
    const saved = panelValue(false, true);
    expect(startsCollapsed({ ...base, saved, phone: true })).toBe(false);
    expect(startsCollapsed({ ...base, saved, phone: false })).toBe(false);
  });

  it("saving account settings supersedes local choices even if the open default stays the same", () => {
    const saved = panelValue(true, true, "1000");
    expect(startsCollapsed({ ...base, saved, preferenceVersion: "1000" })).toBe(true);
    expect(startsCollapsed({ ...base, saved, preferenceVersion: "2000" })).toBe(false);
    expect(startsCollapsed({ ...base, saved, preferenceVersion: "3000" })).toBe(false);
    expect(panelChoice(saved, true, "2000")).toBeNull();
  });

  it("keeps phone rules after a settings save and lets a new explicit choice override them", () => {
    const input = { ...base, phone: true, preferenceVersion: "2000", saved: panelValue(false, true, "1000") };
    expect(startsCollapsed(input)).toBe(true);
    expect(startsCollapsed({ ...input, essential: true })).toBe(false);
    expect(startsCollapsed({ ...input, saved: panelValue(false, true, "2000") })).toBe(false);
  });

  it("keeps old choices until settings are explicitly saved, including the first save", () => {
    expect(panelChoice("closed", true)).toBe("closed:open");
    expect(panelChoice("open:closed", false)).toBe("open:closed");
    expect(panelChoice("closed", true, "1000")).toBeNull();
    expect(panelChoice("open:closed", false, "1000")).toBeNull();
    expect(panelChoice("open:closed", true, "1000")).toBeNull();
    expect(panelChoice("open:open:1000", true, "1000")).toBe("open:open:1000");
  });

  it.each(["maybe", "open:garbage", "closed:open:1000:extra", "", "open:"])("ignores an invalid saved value: %s", saved => {
    expect(panelChoice(saved, true, "1000")).toBeNull();
  });

  it("separates Simple from Complex and keeps page identities distinct", () => {
    const complex = panelStorageKey("/savings", "filters", false);
    const simple = panelStorageKey("/savings", "filters", true);
    expect(complex).toBe("money-os:panel:/savings:filters:@panel");
    expect(simple).toBe(complex + ":simple");
    expect(panelStorageKey("/accounts", "filters", false)).not.toBe(complex);
    expect(foldStorageKey("/savings", "extra", true)).toBe("money-os:fold:/savings:extra:simple");
    expect(foldStorageKey("/savings", "extra", false)).toBe("money-os:fold:/savings:extra");
  });
});

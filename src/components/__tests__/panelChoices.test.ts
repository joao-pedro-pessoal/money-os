import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

class Storage {
  values = new Map<string, string>();
  writes = 0;
  get length() { return this.values.size; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.writes++; this.values.set(key, value); }
}

let storage: Storage;
let events: EventTarget;
let choices: typeof import("../panelChoices");

beforeEach(async () => {
  vi.resetModules();
  storage = new Storage();
  events = new EventTarget();
  vi.stubGlobal("localStorage", storage);
  vi.stubGlobal("window", events);
  choices = await import("../panelChoices");
});
afterEach(() => vi.unstubAllGlobals());

function changeInAnotherTab(key: string | null) {
  events.dispatchEvent(Object.assign(new Event("storage"), { key }));
}

const key = "money-os:panel:/savings:filters:@panel";
const prefix = "money-os:panel:/savings:filters:";

describe("shared local panel choices", () => {
  it("reading a fresh page never saves its computed default", () => {
    expect(choices.readPanelChoice(key, { prefix, simple: false })).toBeNull();
    expect(storage.writes).toBe(0);
  });

  it("notifies other components in the same tab after an explicit choice", () => {
    const listener = vi.fn();
    const unsubscribe = choices.subscribePanelChoices(listener);
    choices.writePanelChoice(key, "closed:open");
    expect(listener).toHaveBeenCalledTimes(1);
    expect(choices.readPanelChoice(key)).toBe("closed:open");
    unsubscribe();
  });

  it("replaces a remembered choice when another tab updates it", () => {
    const listener = vi.fn();
    const unsubscribe = choices.subscribePanelChoices(listener);
    choices.writePanelChoice(key, "closed:open");
    storage.values.set(key, "open:open");
    changeInAnotherTab(key);
    expect(choices.readPanelChoice(key)).toBe("open:open");
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
  });

  it("a storage clear forgets session memory too", () => {
    const unsubscribe = choices.subscribePanelChoices(() => {});
    choices.writePanelChoice(key, "closed:open");
    storage.values.clear();
    changeInAnotherTab(null);
    expect(choices.readPanelChoice(key)).toBeNull();
    unsubscribe();
  });

  it("keeps working when storage is blocked", () => {
    vi.spyOn(storage, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    vi.spyOn(storage, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    expect(choices.readPanelChoice(key)).toBeNull();
    choices.writePanelChoice(key, "open:open");
    expect(choices.readPanelChoice(key)).toBe("open:open");
  });

  it("preserves the one old title-based choice without writing a default", () => {
    storage.values.set(prefix + "Filters", "closed:open");
    expect(choices.readPanelChoice(key, { prefix, simple: false })).toBe("closed:open");
    expect(storage.writes).toBe(0);
    choices.writePanelChoice(key, "open:open");
    expect(choices.readPanelChoice(key, { prefix, simple: false })).toBe("open:open");
  });

  it("never imports a choice from another mode or page", () => {
    storage.values.set(prefix + "Filters:simple", "open:open");
    storage.values.set("money-os:panel:/accounts:filters:Filters", "open:open");
    expect(choices.readPanelChoice(key, { prefix, simple: false })).toBeNull();
    expect(choices.readPanelChoice(key + ":simple", { prefix, simple: true })).toBe("open:open");
  });

  it("does not guess between two old titles", () => {
    storage.values.set(prefix + "Filters", "open:open");
    storage.values.set(prefix + "Filtros", "closed:open");
    expect(choices.readPanelChoice(key, { prefix, simple: false })).toBeNull();
  });

  it("shares the same event handling with folds and ignores unrelated preferences", () => {
    const fold = "money-os:fold:/savings:extra:simple";
    const listener = vi.fn();
    const unsubscribe = choices.subscribePanelChoices(listener);
    choices.writePanelChoice(fold, "closed");
    storage.values.set(fold, "open");
    changeInAnotherTab(fold);
    expect(choices.readPanelChoice(fold)).toBe("open");
    changeInAnotherTab("moneyos_accent");
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
  });
});

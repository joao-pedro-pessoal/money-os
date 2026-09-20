import { describe, expect, it } from "vitest";
import { panelChoice, panelValue } from "../panels";

describe("what a panel opens as", () => {
  it("follows the page when nothing was ever chosen", () => {
    expect(panelChoice(null, true).collapsed).toBe(false);
    expect(panelChoice(null, false).collapsed).toBe(true);
    expect(panelChoice("", true).collapsed).toBe(false);
  });

  it("keeps a choice made against the same page", () => {
    expect(panelChoice(panelValue(true, true), true).collapsed).toBe(true);
    expect(panelChoice(panelValue(false, false), false).collapsed).toBe(false);
  });

  /**
   * The bug this exists for. Minimize "Investment returns", then set that
   * window to "visible" in Settings: the page now says open, the saved answer
   * says closed, and the setting used to lose in silence.
   */
  it("drops a choice made when the page said something else", () => {
    expect(panelChoice(panelValue(true, false), true).collapsed).toBe(false);
    expect(panelChoice(panelValue(false, true), false).collapsed).toBe(true);
  });

  /** Values saved before any of this was recorded still mean what they said. */
  it("honours a value with no record of what it was based on", () => {
    expect(panelChoice("closed", true).collapsed).toBe(true);
    expect(panelChoice("open", false).collapsed).toBe(false);
  });

  it("writes back what this reading was based on", () => {
    expect(panelChoice("closed", true).store).toBe("closed:open");
    expect(panelChoice("open", false).store).toBe("open:closed");
    expect(panelChoice(null, true).store).toBe("open:open");
  });

  it("ignores anything that is not one of the two answers", () => {
    expect(panelChoice("yes", true).collapsed).toBe(false);
    expect(panelChoice("closedish:open", false).collapsed).toBe(true);
  });
});

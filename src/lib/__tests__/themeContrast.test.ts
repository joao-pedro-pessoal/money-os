import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PAGE_BACKGROUND } from "../themeColors";

/**
 * Every light theme, measured from the stylesheet itself.
 *
 * The first light palettes were chosen by eye and read fine on the screen they
 * were chosen on. Measured, gold's links and buttons were 2.8:1 and the muted
 * grey of every label was under 4:1 in three of the four themes — text you
 * could see was there without being able to read it comfortably. The rule now
 * lives here instead of in someone's judgement of a screen.
 *
 * 4.5:1 for anything used as text (WCAG AA for body text), against each of the
 * three grounds text sits on: the page, a card and an input. 3:1 for chart
 * colours against a card, the level for graphics that carry meaning.
 */

const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");

function tokens(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`No block for ${selector}`);
  const body = css.slice(start, css.indexOf("}", start));
  return Object.fromEntries([...body.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\b/g)].map((m) => [m[1], m[2]]));
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const monoLight = tokens('[data-accent="mono"][data-mode="light"]');
const LIGHT: Record<string, Record<string, string>> = {
  gold: tokens('[data-accent="gold"][data-mode="light"]'),
  emerald: tokens('[data-accent="emerald"][data-mode="light"]'),
  indigo: tokens('[data-accent="indigo"][data-mode="light"]'),
  mono: monoLight,
  "mono with colour": { ...monoLight, ...tokens('[data-accent="mono"][data-mode="light"][data-signal="colour"]') },
};

const TEXT = ["foreground", "muted", "accent", "green", "red", "amber", "editorial"];
const GROUNDS = ["background", "surface", "surface-2"];
const CHARTS = ["chart-1", "chart-2", "chart-3", "chart-4"];

describe.each(Object.entries(LIGHT))("the %s light theme", (_name, theme) => {
  it.each(TEXT.flatMap((text) => GROUNDS.map((ground) => [text, ground])))(
    "reads %s text on %s at 4.5:1 or more",
    (text, ground) => {
      expect(contrast(theme[text], theme[ground])).toBeGreaterThanOrEqual(4.5);
    }
  );

  it("puts a button's text on the accent at 4.5:1 or more", () => {
    expect(contrast(theme["accent-contrast"], theme.accent)).toBeGreaterThanOrEqual(4.5);
  });

  it("puts the Library's button text on its gold at 4.5:1 or more", () => {
    expect(contrast(theme["editorial-contrast"], theme.editorial)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(CHARTS)("draws %s on a card at 3:1 or more", (chart) => {
    expect(contrast(theme[chart], theme.surface)).toBeGreaterThanOrEqual(3);
  });

  it("keeps a gain and a loss apart", () => {
    expect(theme.green).not.toBe(theme.red);
  });
});

// That every theme defines every token is theme-tokens.test.ts's job.
describe("every theme", () => {
  it("gives the status bar the page's own colour", () => {
    for (const [accent, modes] of Object.entries(PAGE_BACKGROUND)) {
      for (const [mode, colour] of Object.entries(modes)) {
        expect(tokens(`[data-accent="${accent}"][data-mode="${mode}"]`).background).toBe(colour);
      }
    }
  });
});

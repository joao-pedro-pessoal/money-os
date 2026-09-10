import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import path from "path";

/**
 * A token used anywhere must exist in every theme.
 *
 * `--border-strong` was defined in three of the eight themes. In the other five
 * the borders that used it fell back to `currentColor`, so a chart's baseline
 * drew in the text colour — visible only if you happened to be on one of those
 * five, which is why it survived. CLAUDE.md records the rule; this enforces it.
 *
 * Reads the real stylesheet and the real components rather than a fixture,
 * because a fixture would prove something about a fixture.
 */

const root = path.resolve(__dirname, "../../..");
const css = readFileSync(path.join(root, "src/app/globals.css"), "utf8");

interface Block {
  selector: string;
  /** How many `[data-…]` attributes the selector carries. */
  specificity: number;
  tokens: Set<string>;
}

function parseBlocks(source: string): Block[] {
  const blocks: Block[] = [];
  // Selectors that name a theme: an accent/mode pair, optionally with more.
  const pattern = /((?:^|\n)(?:[^{}\n]*\n)*?[^{}\n]*\[data-accent[^{]*)\{([^}]*)\}/g;

  for (const match of source.matchAll(pattern)) {
    const selector = match[1].trim().replace(/\s+/g, " ");
    const tokens = new Set(
      [...match[2].matchAll(/^\s*(--[a-z0-9-]+)\s*:/gm)].map((m) => m[1])
    );
    blocks.push({
      selector,
      specificity: (selector.match(/\[data-/g) ?? []).length,
      tokens,
    });
  }
  return blocks;
}

const blocks = parseBlocks(css);
/** The complete themes: one accent, one mode, every token. */
const baseThemes = blocks.filter((b) => b.specificity === 2);
/** Overrides like `data-signal`, which redefine a deliberate subset. */
const overrides = blocks.filter((b) => b.specificity > 2);

/** Every CSS variable the shipped UI reaches for. */
function usedTokens(): Map<string, string[]> {
  const found = new Map<string, string[]>();
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) {
        // Tests are not rendered, and this file mentions token names in prose.
        if (entry !== "__tests__") walk(full);
        continue;
      }
      if (!/\.(tsx?|css)$/.test(entry)) continue;
      const text = readFileSync(full, "utf8");
      for (const m of text.matchAll(/var\((--[a-z0-9-]+)/g)) {
        const rel = path.relative(root, full);
        found.set(m[1], [...(found.get(m[1]) ?? []), rel]);
      }
    }
  };
  walk(path.join(root, "src"));
  return found;
}

describe("theme tokens", () => {
  it("finds all eight themes", () => {
    // Three colour accents plus monochrome, dark and light each.
    expect(baseThemes.length).toBe(8);
  });

  /**
   * The invariant. Every complete theme must define exactly the same token
   * names — a theme missing one is a component silently falling back.
   */
  it("defines the same token set in every theme", () => {
    const reference = baseThemes[0];
    for (const theme of baseThemes) {
      const missing = [...reference.tokens].filter((t) => !theme.tokens.has(t));
      const extra = [...theme.tokens].filter((t) => !reference.tokens.has(t));

      expect(missing, `${theme.selector} is missing tokens`).toEqual([]);
      expect(extra, `${theme.selector} defines tokens no other theme has`).toEqual([]);
    }
  });

  it("defines every token the app actually uses", () => {
    const defined = baseThemes[0].tokens;
    const unknown = [...usedTokens().entries()].filter(([token]) => !defined.has(token));

    expect(
      unknown.map(([token, files]) => `${token} (used in ${files[0]})`),
      "These fall back to nothing, or to currentColor, wherever they are used."
    ).toEqual([]);
  });

  /**
   * An override may redefine fewer tokens — that is what makes it an override —
   * but never a token that does not otherwise exist. A typo there defines
   * something nothing reads, and the thing it meant to change stays unchanged.
   */
  it("only lets an override redefine tokens the themes already have", () => {
    const defined = baseThemes[0].tokens;
    for (const block of overrides) {
      const invented = [...block.tokens].filter((t) => !defined.has(t));
      expect(invented, `${block.selector} invents a token`).toEqual([]);
    }
  });

  /**
   * The point of the monochrome themes is that they have no hue. The signal
   * override is allowed to put some back — deliberately, and only on the two
   * kinds of thing that mean something — so it is the one place where a
   * monochrome selector may carry a colour.
   */
  it("keeps the monochrome themes grey unless the signal override says otherwise", () => {
    const isGrey = (hex: string) => {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
      return r === g && g === b;
    };

    const monoBase = baseThemes.filter((t) => t.selector.includes('data-accent="mono"'));
    expect(monoBase.length).toBe(2);

    for (const theme of monoBase) {
      const body = css.slice(css.indexOf(theme.selector));
      const declarations = body.slice(0, body.indexOf("}"));
      for (const m of declarations.matchAll(/(--[a-z0-9-]+):\s*(#[0-9a-fA-F]{6})/g)) {
        expect(isGrey(m[2]), `${theme.selector} ${m[1]} is ${m[2]}, which has a hue`).toBe(true);
      }
    }
  });
});

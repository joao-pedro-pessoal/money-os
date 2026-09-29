/**
 * Each theme's page colour, for the one place CSS cannot reach: the phone's
 * status bar, which reads `<meta name="theme-color">` and not the stylesheet.
 *
 * These are the `--background` values in globals.css, and
 * src/lib/__tests__/themeContrast.test.ts fails if the two ever differ. A
 * second copy is only tolerable with something checking it.
 *
 * Before this, every light theme set the bar to light gold's cream, and a
 * change of theme while the app was open left it as it was.
 */
export const PAGE_BACKGROUND = {
  gold: { dark: "#141210", light: "#faf6ee" },
  emerald: { dark: "#0e1613", light: "#f3faf6" },
  indigo: { dark: "#0b0d12", light: "#f7f7fb" },
  mono: { dark: "#000000", light: "#ffffff" },
} as const;

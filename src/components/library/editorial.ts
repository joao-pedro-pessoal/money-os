/**
 * The Library's warm gold, as the theme gives it.
 *
 * Three files kept their own copy of `#c8a45c` and its tints. On a dark theme
 * it reads; on a light page it was 2.3:1, a gold that could be seen and not
 * comfortably read. `--editorial` is defined by every theme in globals.css —
 * the same gold on the dark ones, a darker gold on the light ones, grey on the
 * monochrome ones — and the tints are mixed from it, so they follow too.
 */
export const EDITORIAL = "var(--editorial)";
export const EDITORIAL_CONTRAST = "var(--editorial-contrast)";
/** 6%, not 10%: grey text sits on this tint, and at 10% it fell to 4.3:1 on the light themes. */
export const EDITORIAL_SOFT = "color-mix(in srgb, var(--editorial) 6%, transparent)";
export const EDITORIAL_LINE = "color-mix(in srgb, var(--editorial) 35%, transparent)";

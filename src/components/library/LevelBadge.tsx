import { levelInfo, type Level } from "@/lib/library/types";

/**
 * How demanding something is, at a glance.
 *
 * Colour carries the same information as the word, never instead of it — the
 * label is always spelled out, so this still works if you can't tell the greens
 * from the ambers. Four levels, warm to cool, open to demanding.
 *
 * Each level is a theme token, not a hex value. The fixed pastels read on the
 * dark themes and nowhere else: on a white card the gold and blue labels were
 * under 2.5:1. The text is the token pulled a third of the way towards the
 * page's own text colour — darker on a light theme, lighter on a dark one —
 * which puts every label above 6:1 in all eight themes, and on the monochrome
 * ones the levels are greys like everything else there.
 */
const tint = (token: string) => ({
  fg: `color-mix(in srgb, var(${token}) 70%, var(--foreground))`,
  bg: `color-mix(in srgb, var(${token}) 10%, transparent)`,
  border: `color-mix(in srgb, var(${token}) 35%, transparent)`,
});

const COLOURS: Record<Level, { fg: string; bg: string; border: string }> = {
  EVERYONE: tint("--accent"),
  BEGINNER: tint("--green"),
  INTERMEDIATE: tint("--chart-1"),
  ADVANCED: tint("--chart-2"),
};

export default function LevelBadge({
  level,
  size = "sm",
}: {
  level: Level;
  size?: "sm" | "md";
}) {
  const info = levelInfo(level);
  const c = COLOURS[level];

  return (
    <span
      title={info.hint}
      className={`inline-block rounded whitespace-nowrap ${
        size === "md" ? "text-[11px] px-2 py-1" : "text-[10px] px-1.5 py-0.5"
      }`}
      style={{ color: c.fg, background: c.bg, border: `1px solid ${c.border}` }}
    >
      {info.label}
    </span>
  );
}

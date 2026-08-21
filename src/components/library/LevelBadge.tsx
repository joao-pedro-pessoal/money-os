import { levelInfo, type Level } from "@/lib/library/types";

/**
 * How demanding something is, at a glance.
 *
 * Colour carries the same information as the word, never instead of it — the
 * label is always spelled out, so this still works if you can't tell the greens
 * from the ambers. Four levels, warm to cool, open to demanding.
 */
const COLOURS: Record<Level, { fg: string; bg: string; border: string }> = {
  EVERYONE: { fg: "#c8a45c", bg: "rgba(200,164,92,0.10)", border: "rgba(200,164,92,0.35)" },
  BEGINNER: { fg: "#6fbf8b", bg: "rgba(111,191,139,0.10)", border: "rgba(111,191,139,0.32)" },
  INTERMEDIATE: { fg: "#7aa7d8", bg: "rgba(122,167,216,0.10)", border: "rgba(122,167,216,0.32)" },
  ADVANCED: { fg: "#c98a8a", bg: "rgba(201,138,138,0.10)", border: "rgba(201,138,138,0.32)" },
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

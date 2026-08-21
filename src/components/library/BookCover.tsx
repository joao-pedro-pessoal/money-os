import { paletteFor, coverLines, coverByline } from "@/lib/library/cover";

/**
 * A cover for something that hasn't got one.
 *
 * Drawn as SVG from the title and author, in colours derived from the slug, so
 * it costs no request, works offline, and can't show the wrong book's jacket.
 * A real `coverUrl` always wins — this is the floor, not the ceiling.
 *
 * Text is rendered as real <text>, so it scales cleanly from the 56px card
 * thumbnail to the 116px hero without a second asset.
 */
export default function BookCover({
  seed,
  title,
  creator,
  width,
  height,
}: {
  seed: string;
  title: string;
  creator: string;
  width: number;
  height: number;
}) {
  const palette = paletteFor(seed);

  // The SVG is drawn in a fixed 120×168 space and scaled by the viewBox, so
  // every size gets identical proportions and one set of numbers to reason about.
  const lines = coverLines(title, 15, 5);
  const byline = coverByline(creator);
  const gradientId = `cover-${seed.replace(/[^a-z0-9]/gi, "")}`;

  const startY = 52 - (lines.length - 1) * 7;

  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 120 168"
      role="img"
      aria-label={`${title} by ${creator}`}
      style={{ display: "block" }}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={palette.from} />
          <stop offset="100%" stopColor={palette.to} />
        </linearGradient>
      </defs>

      <rect width="120" height="168" fill={`url(#${gradientId})`} />
      {/* The binding edge: what makes it read as a book rather than a tile. */}
      <rect width="5" height="168" fill="rgba(0,0,0,0.28)" />
      <rect x="5" width="1" height="168" fill="rgba(255,255,255,0.06)" />

      {lines.map((line, i) => (
        <text
          key={i}
          x="63"
          y={startY + i * 14}
          textAnchor="middle"
          fill={palette.ink}
          fontSize="12"
          fontFamily="Georgia, 'Times New Roman', serif"
        >
          {line}
        </text>
      ))}

      <rect x="45" y={startY + lines.length * 14 - 2} width="36" height="1" fill={palette.rule} />

      <text
        x="63"
        y="150"
        textAnchor="middle"
        fill={palette.rule}
        fontSize="9"
        letterSpacing="1"
        fontFamily="Georgia, 'Times New Roman', serif"
      >
        {byline.toUpperCase().slice(0, 16)}
      </text>
    </svg>
  );
}

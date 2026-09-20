import { initial } from "@/lib/logos";

/**
 * The mark beside a company, a fund or a coin — and a letter where there is
 * none.
 *
 * The letter is deliberate. A table of 250 names needs its rows to start at
 * the same place to be scannable at all, so something has to sit there; what
 * sits there is the name's own first letter, which says nothing the row did
 * not already say and cannot be mistaken for a company's logo. The alternative
 * — a stock "no image" glyph — would be this app drawing a picture for a
 * company it has no picture of.
 *
 * `alt` is empty on purpose: the name is right beside it, and a screen reader
 * announcing "NVIDIA Corporation NVIDIA Corporation" is worse than one that
 * skips the decoration.
 */
export default function AssetLogo({
  image,
  name,
  size = 18,
}: {
  /** A data URI, from `asset_logos`. Null where none is stored. */
  image?: string | null;
  name: string;
  size?: number;
}) {
  const box = { width: size, height: size };
  if (image) {
    return (
      // No tile behind it: of the 190 marks stored here, 186 arrive as a
      // square already filled with the company's own colour, and a light patch
      // under those would draw a ring around them on a dark theme. The handful
      // that come through transparent are coloured, not black.
      //
      // `next/image` has nothing to do here: the source is a data URI already
      // in the page, at a fixed 18 pixels, so there is nothing to fetch, resize
      // or lazily load.
      // eslint-disable-next-line @next/next/no-img-element
      <img src={image} alt="" aria-hidden style={{ ...box, objectFit: "contain" }} className="shrink-0 rounded-[3px]" />
    );
  }
  return (
    <span
      aria-hidden
      style={{ ...box, fontSize: Math.round(size * 0.55) }}
      className="shrink-0 rounded-[3px] border border-[var(--border)] text-[var(--muted)] inline-flex items-center justify-center leading-none"
    >
      {initial(name)}
    </span>
  );
}

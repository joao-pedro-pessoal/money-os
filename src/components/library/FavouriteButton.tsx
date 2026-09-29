import { toggleFavourite } from "@/actions/library";
import { EDITORIAL } from "@/components/library/editorial";

/**
 * The star.
 *
 * A form rather than an onClick, so it works before JavaScript loads and needs
 * no client component. It must never be rendered *inside* the card's link —
 * a button inside an anchor is invalid HTML and browsers disagree about which
 * one you clicked — so the card positions it as a sibling.
 */
export default function FavouriteButton({
  id,
  favourite,
  size = "sm",
}: {
  id: string;
  favourite: boolean;
  size?: "sm" | "md";
}) {
  const label = favourite ? "Remove from favourites" : "Add to favourites";

  return (
    <form action={toggleFavourite}>
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        title={label}
        aria-label={label}
        aria-pressed={favourite}
        className={`leading-none rounded ${size === "md" ? "text-lg" : "text-sm"}`}
        style={{ color: favourite ? EDITORIAL : "var(--muted)" }}
      >
        {favourite ? "★" : "☆"}
      </button>
    </form>
  );
}

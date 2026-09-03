import Link from "next/link";
import type { ComponentProps } from "react";

/**
 * A link that changes the view without throwing you back to the top of it.
 *
 * Next resets scroll on every navigation, which is right when you are going
 * somewhere and wrong when you are staying put. The pages driven by search
 * params — portfolio analysis, the library — express sorting, filtering and
 * opening a row as navigation, so every one of those interactions scrolled the
 * page away from whatever the reader was looking at. Sorting a table you had
 * scrolled down to meant scrolling back down to see the result.
 *
 * Use this for a link that lands on the page it started from. A link to a
 * different page should stay a plain `<Link>`: arriving halfway down a document
 * you have never seen is its own kind of lost.
 */
export default function FilterLink(props: ComponentProps<typeof Link>) {
  return <Link {...props} scroll={false} />;
}

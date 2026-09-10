import { redirect } from "next/navigation";

/**
 * Money Map showed the same two breakdowns as Analytics — by location and by
 * purpose — drawn as bars instead of donuts. Two nav entries for one idea is
 * how a sidebar grows to fifteen items, so it now sends you to the page that
 * already had it.
 *
 * Kept as a redirect rather than deleted so an old bookmark doesn't 404.
 */
export default function MoneyMapPage() {
  redirect("/analytics");
}

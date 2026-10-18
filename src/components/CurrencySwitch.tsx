import { textForRequest } from "@/actions/pageLanguage";
import Link from "next/link";
import { isConverted } from "@/lib/fx/favourites";

/**
 * Reads the same money in another currency.
 *
 * A link per favourite rather than a dropdown: with two or three currencies a
 * select is more clicks and hides the options. Links also mean the choice
 * survives a reload and can be bookmarked, without any client state.
 *
 * Deliberately *display only*. The base currency is what totals are stored and
 * compared in; switching here converts what you see and changes nothing about
 * what the app keeps — which is why a converted view says so.
 */
export default async function CurrencySwitch({
  favourites,
  display,
  base,
  hrefFor,
}: {
  favourites: string[];
  display: string;
  base: string;
  /** Builds the URL for a currency, preserving whatever else is in the query. */
  hrefFor: (currency: string) => string;
}) {
  const uiText = await textForRequest();
  if (favourites.length < 2) return null;

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <div className="flex rounded-lg border border-[var(--border)] overflow-hidden">
        {favourites.map((c) => {
          const active = c === display;
          return (
            <Link
              key={c}
              href={hrefFor(c)}
              className="px-2.5 py-1 text-xs transition-colors"
              style={{
                background: active ? "var(--surface-2)" : "transparent",
                color: active ? "var(--foreground)" : "var(--muted)",
                fontWeight: active ? 500 : 400,
              }}
            >
              {c}
            </Link>
          );
        })}
      </div>

      {isConverted(display, base) && (
        <span className="text-[10px] text-[var(--muted)]">{uiText("converted from ")}{base}{uiText(" at today's rate")}</span>
      )}
    </div>
  );
}

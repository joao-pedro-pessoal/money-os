import Link from "next/link";
import type { LibraryResource } from "@/actions/library";
import BookCover from "@/components/library/BookCover";

/**
 * The hero slot at the top of the library.
 *
 * Deliberately restrained. The application takes a strong editorial position
 * here, and a position stated quietly reads as conviction while the same
 * position stated with gradients and glow reads as an advertisement. Warm gold,
 * a thin rule, generous space, no animation.
 *
 * Nothing in this component knows which resource it is rendering. The badge
 * text, the subtitle and the right to occupy this slot all arrive as data —
 * see src/lib/library/ranking.ts.
 */

const GOLD = "#c8a45c";
const GOLD_SOFT = "rgba(200, 164, 92, 0.10)";
const GOLD_LINE = "rgba(200, 164, 92, 0.35)";

/** "reading" for a book, "watching" for a video — the button follows the medium. */
function verbFor(type: LibraryResource["type"]): string {
  switch (type) {
    case "BOOK":
      return "reading";
    case "VIDEO":
      return "watching";
    case "PODCAST":
      return "listening";
    case "COURSE":
      return "the course";
  }
}

export default function HeroResource({ resource }: { resource: LibraryResource }) {
  const r = resource;
  const cover = r.meta.coverUrl ?? r.imageUrl;
  const started = r.progress.done > 0 || r.status === "IN_PROGRESS";

  return (
    <section
      className="rounded-xl border p-5 md:p-6"
      style={{ borderColor: GOLD_LINE, background: GOLD_SOFT }}
      aria-label="Featured resource"
    >
      <div className="flex flex-col md:flex-row gap-5">
        <div
          className="shrink-0 rounded-md overflow-hidden mx-auto md:mx-0 flex items-center justify-center"
          style={{
            width: 116,
            height: 168,
            border: `1px solid ${GOLD_LINE}`,
            background: "var(--surface-2)",
          }}
        >
          {cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={cover}
              alt=""
              className="w-full h-full object-cover"
              loading="lazy"
              referrerPolicy="no-referrer"
            />
          ) : (
            <BookCover seed={r.slug} title={r.title} creator={r.creator} width={116} height={168} />
          )}
        </div>

        <div className="min-w-0 flex-1">
          {r.specialBadge && (
            <div
              className="inline-block text-[10px] uppercase tracking-[0.12em] px-2 py-1 rounded"
              style={{ color: GOLD, border: `1px solid ${GOLD_LINE}` }}
            >
              {r.specialBadge}
            </div>
          )}

          <h2
            className="mt-3 text-2xl leading-tight"
            style={{ fontFamily: "var(--font-heading)", color: "var(--foreground)" }}
          >
            {r.title}
          </h2>
          <div className="text-xs text-[var(--muted)] mt-1">{r.creator}</div>

          {r.specialDescription && (
            <p className="text-sm mt-3 max-w-2xl leading-relaxed" style={{ color: GOLD }}>
              {r.specialDescription}
            </p>
          )}

          <p className="text-xs text-[var(--muted)] mt-2 max-w-2xl leading-relaxed line-clamp-3">
            {r.description}
          </p>

          {r.categories.length > 0 && (
            <div className="flex gap-2 flex-wrap mt-3">
              {r.categories.map((c) => (
                <Link
                  key={c.id}
                  href={`/library?category=${c.slug}`}
                  className="badge border text-[10px]"
                  style={{ borderColor: GOLD_LINE, color: GOLD }}
                >
                  {c.name}
                </Link>
              ))}
            </div>
          )}

          {/* Progress only when there is some. An empty bar under a book you
              haven't opened is a reproach, not information. */}
          {r.progress.percent !== null && r.progress.percent > 0 && (
            <div className="mt-4 max-w-sm">
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--surface-2)" }}>
                <div
                  className="h-full"
                  style={{ width: `${r.progress.percent}%`, background: GOLD }}
                />
              </div>
              <div className="text-[10px] text-[var(--muted)] mt-1">{r.progress.label}</div>
            </div>
          )}

          <div className="flex gap-2 flex-wrap mt-4">
            <Link
              href={`/library/${r.slug}`}
              className="rounded-lg px-4 py-2 text-sm font-medium"
              style={{ background: GOLD, color: "#1b1509" }}
            >
              Explore {r.title}
            </Link>
            <Link
              href={`/library/${r.slug}#progress`}
              className="rounded-lg px-4 py-2 text-sm border"
              style={{ borderColor: GOLD_LINE, color: GOLD }}
            >
              {started ? "Continue" : "Start"} {verbFor(r.type)}
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

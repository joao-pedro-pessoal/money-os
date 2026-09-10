import Link from "next/link";
import type { LibraryResource } from "@/actions/library";
import { tagLabelFor } from "@/components/library/labels";
import { sourceLabel } from "@/lib/library/links";
import FavouriteButton from "@/components/library/FavouriteButton";
import BookCover from "@/components/library/BookCover";
import LevelBadge from "@/components/library/LevelBadge";
import type { Level } from "@/lib/library/types";

const GOLD = "#c8a45c";
const GOLD_LINE = "rgba(200, 164, 92, 0.35)";

/**
 * One card, four shapes.
 *
 * The line under the title differs by medium because the useful second fact
 * differs: a book's author, a video's channel and duration, a podcast's host
 * and guest, a course's institution and lesson count. Showing the same fields
 * for all four would mean showing "—" three times out of four.
 */
export default function ResourceCard({ resource }: { resource: LibraryResource }) {
  const r = resource;
  const image = r.type === "BOOK" ? (r.meta.coverUrl ?? r.imageUrl) : r.imageUrl;

  const secondLine = (() => {
    switch (r.type) {
      case "BOOK":
        return r.creator;
      case "VIDEO":
        return [r.meta.channelName ?? r.creator, minutes(r.meta.durationMinutes)]
          .filter(Boolean)
          .join(" · ");
      case "PODCAST":
        return [r.meta.hostName ?? r.creator, r.meta.guestName, minutes(r.meta.durationMinutes)]
          .filter(Boolean)
          .join(" · ");
      case "COURSE":
        // Where it lives matters before you click: a course site with a
        // syllabus and transcripts is a different evening from a playlist.
        return [
          r.meta.instructor ?? r.creator,
          r.meta.institution,
          sourceLabel(r.externalUrl),
          lessons(r.meta.lessonCount),
        ]
          .filter(Boolean)
          .join(" · ");
    }
  })();

  const editorial = r.specialBadge !== null && r.editorialRank !== null;

  return (
    // The star is a sibling of the link, not a child: a <button> inside an <a>
    // is invalid HTML and browsers disagree about which one a click hits.
    <div className="relative">
      <div className="absolute top-2 right-2 z-10">
        <FavouriteButton id={r.id} favourite={r.favourite} />
      </div>

      <Link
        href={`/library/${r.slug}`}
        className="card p-3 flex gap-3 hover:opacity-90 transition-opacity"
        style={editorial ? { borderColor: GOLD_LINE } : undefined}
      >
        <div
        className="shrink-0 rounded overflow-hidden bg-[var(--surface-2)] flex items-center justify-center"
        style={{ width: 56, height: 76 }}
      >
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image}
            alt=""
            className="w-full h-full object-cover"
            loading="lazy"
            // Don't tell the image host which page of your own finances you
            // were looking at when you loaded it.
            referrerPolicy="no-referrer"
          />
        ) : (
          // Drawn from the title and author rather than fetched: no request,
          // no invented URL, and never another book's jacket.
          <BookCover seed={r.slug} title={r.title} creator={r.creator} width={56} height={76} />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <span className="text-sm font-medium leading-tight line-clamp-2">{r.title}</span>
          {/* Right margin leaves room for the star sitting above this corner. */}
          <span className="badge border border-[var(--border)] text-[var(--muted)] text-[10px] shrink-0 mr-5">
            {tagLabelFor(r.type)}
          </span>
        </div>

        <div className="text-xs text-[var(--muted)] mt-0.5 truncate">{secondLine}</div>

        {/* The badge is the application's own claim, stored on the row. It is
            never derived from the title, and never rendered as stars — those
            belong to the reader. */}
        {editorial && (
          <div
            className="inline-block text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded mt-1"
            style={{ color: GOLD, border: `1px solid ${GOLD_LINE}` }}
          >
            {r.specialBadge}
          </div>
        )}

        <div className="flex gap-1.5 flex-wrap items-center mt-1.5">
          <LevelBadge level={r.level as Level} />
          {r.categories.slice(0, 2).map((c) => (
            <span key={c.id} className="text-[10px] text-[var(--accent)]">
              {c.name}
            </span>
          ))}
        </div>

        {/* Progress in this resource's own unit. Pages for a book, minutes for
            a podcast — never a shared abstraction. */}
        {r.progress.percent !== null && r.progress.percent > 0 && (
          <div className="mt-2">
            <div className="h-1 rounded-full bg-[var(--surface-2)] overflow-hidden">
              <div
                className="h-full"
                style={{
                  width: `${r.progress.percent}%`,
                  background: r.progress.complete ? "var(--green)" : "var(--accent)",
                }}
              />
            </div>
            <div className="text-[10px] text-[var(--muted)] mt-0.5">{r.progress.label}</div>
          </div>
        )}
        </div>
      </Link>
    </div>
  );
}

function minutes(n: number | null): string | null {
  return n === null ? null : `${n} min`;
}

function lessons(n: number | null): string | null {
  return n === null ? null : `${n} lessons`;
}

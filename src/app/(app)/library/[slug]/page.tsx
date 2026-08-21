import { getResourceBySlug, listResources, setProgress, updateResource } from "@/actions/library";
import { isRelevant, STATUSES, PROGRESS_UNITS, type Level } from "@/lib/library/types";
import { relFor, safeUrl, displayHost, youtubeEmbedUrl, sourceLabel } from "@/lib/library/links";

const GOLD = "#c8a45c";
const GOLD_LINE = "rgba(200, 164, 92, 0.35)";
import { tagLabelFor } from "@/components/library/labels";
import ResourceCard from "@/components/library/ResourceCard";
import FavouriteButton from "@/components/library/FavouriteButton";
import BookCover from "@/components/library/BookCover";
import LevelBadge from "@/components/library/LevelBadge";
import { coverSearchUrl } from "@/lib/library/covers-import";
import Section from "@/components/Section";
import { notFound } from "next/navigation";
import Link from "next/link";

export default async function ResourceDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const r = await getResourceBySlug(slug);
  if (!r) notFound();

  const all = await listResources();

  /**
   * Related by shared category, closest first.
   *
   * Across every medium on purpose: the point of one taxonomy is that a Yale
   * lecture course can sit next to a book on the same page.
   */
  const mySlugs = new Set(r.categories.map((c) => c.slug));
  const related = all
    .filter((x) => x.id !== r.id)
    .map((x) => ({ x, shared: x.categories.filter((c) => mySlugs.has(c.slug)).length }))
    .filter((x) => x.shared > 0)
    .sort((a, b) => b.shared - a.shared)
    .slice(0, 6)
    .map((x) => x.x);

  const url = safeUrl(r.externalUrl);
  const affiliate = safeUrl(r.meta.affiliateUrl);
  // The playlist, when one on the institution's own channel was verified.
  const video = safeUrl(r.meta.videoUrl);
  const embed = r.type === "VIDEO" ? youtubeEmbedUrl(r.externalUrl) : null;
  const image = r.type === "BOOK" ? (r.meta.coverUrl ?? r.imageUrl) : r.imageUrl;

  const field = (label: string, value: string | number | null | undefined) =>
    value === null || value === undefined || value === "" ? null : (
      <div key={label}>
        <div className="text-[10px] text-[var(--muted)]">{label}</div>
        <div className="text-sm">{value}</div>
      </div>
    );

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <Link href="/library" className="text-xs text-[var(--accent)]">
          ← Library
        </Link>
        <div className="flex items-start gap-4 mt-2 flex-wrap">
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={image}
              alt=""
              loading="lazy"
              referrerPolicy="no-referrer"
              className="rounded object-cover"
              style={{ width: 96, height: 132 }}
            />
          ) : (
            <div className="rounded overflow-hidden">
              <BookCover seed={r.slug} title={r.title} creator={r.creator} width={96} height={132} />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex gap-2 flex-wrap items-center">
              <span className="badge border border-[var(--border)] text-[var(--muted)] text-[10px]">
                {tagLabelFor(r.type)}
              </span>
              {/* The application's editorial claim, read from the row. It sits
                  apart from the stars below, which are the reader's. */}
              {r.specialBadge && r.editorialRank !== null && (
                <span
                  className="badge border text-[10px] uppercase tracking-wider"
                  style={{ color: GOLD, borderColor: GOLD_LINE }}
                >
                  {r.specialBadge}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-1">
              <h1 className="text-lg font-semibold">{r.title}</h1>
              <FavouriteButton id={r.id} favourite={r.favourite} size="md" />
            </div>
            <div className="text-sm text-[var(--muted)]">{r.creator}</div>
            {r.specialDescription && (
              <p className="text-sm mt-2 max-w-xl leading-relaxed" style={{ color: GOLD }}>
                {r.specialDescription}
              </p>
            )}
            <div className="flex gap-2 flex-wrap items-center mt-2 text-xs">
              <LevelBadge level={r.level as Level} size="md" />
              <span className="text-[var(--muted)]">{tagLabelFor(r.status)}</span>
              {r.personalRating && (
                <span className="text-[var(--accent)]">· {"★".repeat(r.personalRating)}</span>
              )}
              {r.language && <span className="text-[var(--muted)]">· {r.language}</span>}
              {r.publicationYear && (
                <span className="text-[var(--muted)]">· {r.publicationYear}</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* The app hosts nothing. Every link out carries noopener and noreferrer;
          an affiliate link additionally declares itself sponsored. */}
      {(url || affiliate || video) && (
        <div className="flex gap-2 flex-wrap">
          {/* The playlist comes first: it's what you open when you sit down to
              watch, and the course site is what you open when you want the
              readings. */}
          {video && (
            <a
              href={video}
              target="_blank"
              rel={relFor("external")}
              className="btn whitespace-nowrap"
            >
              Watch on YouTube ↗
            </a>
          )}
          {url && (
            <a
              href={url}
              target="_blank"
              rel={relFor("external")}
              className={
                video
                  ? "badge border border-[var(--border)] text-[var(--muted)] text-xs px-3 py-2 whitespace-nowrap"
                  : "btn whitespace-nowrap"
              }
            >
              {video ? "Syllabus and readings" : "Open on"} {displayHost(url)} ↗
            </a>
          )}
          {affiliate && (
            <a
              href={affiliate}
              target="_blank"
              rel={relFor("affiliate")}
              className="badge border border-[var(--border)] text-[var(--muted)] text-xs px-3 py-2"
              title="This is an affiliate link — it may earn a commission."
            >
              Buy (affiliate) ↗
            </a>
          )}
        </div>
      )}

      {embed && (
        <div className="card overflow-hidden">
          <div style={{ position: "relative", paddingTop: "56.25%" }}>
            <iframe
              src={embed}
              title={r.title}
              loading="lazy"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0 }}
            />
          </div>
          <div className="text-[10px] text-[var(--muted)] p-2">
            Embedded from youtube-nocookie.com, no autoplay.
          </div>
        </div>
      )}

      {r.description && (
        <div className="card p-4">
          <div className="text-sm font-medium mb-2">About</div>
          <p className="text-sm text-[var(--muted)] whitespace-pre-line">{r.description}</p>
        </div>
      )}

      {(r.whyLearn || r.lessons || r.perspective) && (
        <div className="card p-4 space-y-3">
          {r.whyLearn && (
            <div>
              <div className="text-sm font-medium mb-1">Why learn from this</div>
              <p className="text-sm text-[var(--muted)] whitespace-pre-line">{r.whyLearn}</p>
            </div>
          )}
          {/* One line per point, rendered as a list rather than a paragraph —
              it's a summary of what the book covers, and a wall of text is the
              thing you were trying to avoid by reading a summary. */}
          {r.lessons && (
            <div>
              <div className="text-sm font-medium mb-1">What it covers</div>
              <ul className="text-sm text-[var(--muted)] space-y-1">
                {r.lessons
                  .split("\n")
                  .map((line) => line.trim())
                  .filter(Boolean)
                  .map((line, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="text-[var(--accent)] shrink-0">·</span>
                      <span>{line}</span>
                    </li>
                  ))}
              </ul>
            </div>
          )}
          {r.perspective && (
            <div>
              <div className="text-sm font-medium mb-1">Perspective</div>
              <p className="text-sm text-[var(--muted)]">{r.perspective}</p>
            </div>
          )}
        </div>
      )}

      {/* Subtags grouped under their category: "Stoicism" on its own says less
          than "Philosophy → Stoicism". */}
      {r.categories.length > 0 && (
        <div className="card p-4">
          <div className="text-sm font-medium mb-2">Categories</div>
          <div className="space-y-2">
            {r.subtagsByCategory.map((group) => (
              <div key={group.categorySlug}>
                <Link
                  href={`/library?category=${group.categorySlug}`}
                  className="text-xs text-[var(--accent)] hover:underline"
                >
                  {group.category}
                </Link>
                {group.subtags.length > 0 && (
                  <div className="flex gap-1 flex-wrap mt-1">
                    {group.subtags.map((s) => (
                      <span
                        key={s.id}
                        className="badge border border-[var(--border)] text-[var(--muted)] text-[10px]"
                      >
                        {s.name}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Only fields this medium actually has — a podcast never shows an ISBN. */}
      <div className="card p-4">
        <div className="text-sm font-medium mb-3">Details</div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {isRelevant(r.type, "isbn13") && field("ISBN-13", r.meta.isbn13)}
          {isRelevant(r.type, "pageCount") && field("Pages", r.meta.pageCount)}
          {isRelevant(r.type, "translator") && field("Translator", r.meta.translator)}
          {/* Your copy, not the work: two editions of the same book differ in
              canon, translation, publisher and page count. */}
          {isRelevant(r.type, "translation") && field("Translation", r.meta.translation)}
          {isRelevant(r.type, "edition") && field("Edition", r.meta.edition)}
          {isRelevant(r.type, "publisher") && field("Publisher", r.meta.publisher)}
          {isRelevant(r.type, "platform") && field("Platform", r.meta.platform)}
          {/* A site with a syllabus and a YouTube playlist are different evenings. */}
          {r.type !== "BOOK" && field("Watch on", sourceLabel(r.externalUrl))}
          {isRelevant(r.type, "durationMinutes") &&
            field("Duration", r.meta.durationMinutes ? `${r.meta.durationMinutes} min` : null)}
          {isRelevant(r.type, "channelName") && field("Channel", r.meta.channelName)}
          {isRelevant(r.type, "hostName") && field("Host", r.meta.hostName)}
          {isRelevant(r.type, "guestName") && field("Guest", r.meta.guestName)}
          {isRelevant(r.type, "institution") && field("Institution", r.meta.institution)}
          {isRelevant(r.type, "instructor") && field("Instructor", r.meta.instructor)}
          {isRelevant(r.type, "lessonCount") && field("Lessons", r.meta.lessonCount)}
          {isRelevant(r.type, "estimatedHours") &&
            field("Estimated", r.meta.estimatedHours ? `${r.meta.estimatedHours} h` : null)}
        </div>
      </div>

      <div className="card p-4" id="progress">
        <div className="flex items-baseline justify-between gap-3 flex-wrap mb-2">
          <div className="text-sm font-medium">Progress</div>
          <div className="text-xs text-[var(--muted)]">{r.progress.label}</div>
        </div>

        {r.progress.percent !== null && (
          <div className="h-2 rounded-full bg-[var(--surface-2)] overflow-hidden mb-3">
            <div
              className="h-full"
              style={{
                width: `${r.progress.percent}%`,
                background: r.progress.complete ? "var(--green)" : "var(--accent)",
              }}
            />
          </div>
        )}

        <form action={setProgress} className="flex gap-2 flex-wrap items-end">
          <input type="hidden" name="id" value={r.id} />
          <label className="text-xs">
            <span className="text-[var(--muted)]">
              {PROGRESS_UNITS.find((u) => u.value === r.progress.unit)?.label} done
            </span>
            <input
              name="progress"
              type="number"
              step="0.01"
              min="0"
              defaultValue={r.progress.done}
              className="input input-narrow text-xs py-1 w-24 mt-1"
            />
          </label>
          <label className="text-xs">
            <span className="text-[var(--muted)]">of</span>
            <input
              name="totalUnits"
              type="number"
              step="0.01"
              min="0"
              defaultValue={r.progress.total ?? ""}
              placeholder="total"
              className="input input-narrow text-xs py-1 w-24 mt-1"
            />
          </label>
          <select name="status" defaultValue={r.status} className="input input-narrow text-xs py-1">
            {STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          <button type="submit" className="btn text-xs py-1">
            Save
          </button>
        </form>
      </div>

      {/* One entry per work, not per translation. A Bible in the Almeida
          translation and one in the ESV are the same book with different
          copies, so the edition is recorded here instead of duplicating the
          resource — unless you deliberately add a second one. */}
      {r.type === "BOOK" && (
        <Section
          title="Your edition"
          summary="optional"
          defaultOpen={Boolean(r.meta.translation || r.meta.edition || r.meta.publisher)}
        >
          <form action={updateResource} className="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-2xl">
            <input type="hidden" name="id" value={r.id} />
            {[
              { name: "translation", label: "Translation", value: r.meta.translation },
              { name: "edition", label: "Edition", value: r.meta.edition },
              { name: "publisher", label: "Publisher", value: r.meta.publisher },
              { name: "isbn13", label: "ISBN-13", value: r.meta.isbn13 },
              { name: "language", label: "Language", value: r.language },
              { name: "coverUrl", label: "Cover image URL", value: r.meta.coverUrl },
            ].map((f) => (
              <label key={f.name} className="text-xs block">
                <span className="text-[var(--muted)]">{f.label}</span>
                <input
                  name={f.name}
                  defaultValue={f.value ?? ""}
                  className="input text-xs py-1 mt-1"
                />
              </label>
            ))}
            <div className="md:col-span-2 flex items-center gap-3 flex-wrap">
              <button type="submit" className="btn text-xs py-1">
                Save edition
              </button>
              {/* A search page, never a guessed image URL: only you know which
                  edition is on your shelf, and the artwork differs between them. */}
              <a
                href={coverSearchUrl(r.title, r.creator)}
                target="_blank"
                rel={relFor("external")}
                className="text-xs text-[var(--accent)]"
              >
                Find a cover on Open Library ↗
              </a>
            </div>
          </form>
        </Section>
      )}

      <Section title="Your notes and rating" defaultOpen={Boolean(r.notes)}>
        <form action={updateResource} className="space-y-3 max-w-2xl">
          <input type="hidden" name="taxonomy" value="1" />
          <input type="hidden" name="id" value={r.id} />
          <input type="hidden" name="creator" value={r.creator} />
          <input type="hidden" name="description" value={r.description} />
          <input type="hidden" name="externalUrl" value={r.externalUrl ?? ""} />
          <input type="hidden" name="level" value={r.level} />
          <input type="hidden" name="status" value={r.status} />
          {r.categories.map((c) => (
            <input key={c.id} type="hidden" name="categoryIds" value={c.id} />
          ))}
          {r.subtagsByCategory.flatMap((g) =>
            g.subtags.map((s) => <input key={s.id} type="hidden" name="subtagIds" value={s.id} />)
          )}

          <textarea
            name="notes"
            defaultValue={r.notes ?? ""}
            rows={5}
            placeholder="What you took from it"
            className="input"
          />
          <textarea
            name="whyLearn"
            defaultValue={r.whyLearn ?? ""}
            rows={2}
            placeholder="Why it's worth learning from"
            className="input"
          />
          <textarea
            name="lessons"
            defaultValue={r.lessons ?? ""}
            rows={3}
            placeholder="Main lessons"
            className="input"
          />
          <label className="text-xs block">
            <span className="text-[var(--muted)]">Your rating, 1 to 5</span>
            <input
              name="personalRating"
              type="number"
              min="1"
              max="5"
              defaultValue={r.personalRating ?? ""}
              className="input input-narrow text-xs py-1 w-20 mt-1"
            />
          </label>
          <button type="submit" className="btn">
            Save
          </button>
        </form>
      </Section>

      {related.length > 0 && (
        <div>
          <div className="text-sm font-medium mb-2">Related</div>
          <p className="text-xs text-[var(--muted)] mb-2">
            Sharing a category, whatever the medium.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {related.map((x) => (
              <ResourceCard key={x.id} resource={x} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

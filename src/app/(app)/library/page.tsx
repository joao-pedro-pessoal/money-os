import {
  listResources,
  listTaxonomy,
  getLibraryStats,
  seedLibrary,
  missingSeedCount,
  refreshStarterDetails,
  staleStarterCount,
} from "@/actions/library";
import { RESOURCE_TYPES, isResourceType, type ResourceType } from "@/lib/library/types";
import ResourceCard from "@/components/library/ResourceCard";
import HeroResource from "@/components/library/HeroResource";
import { heroResource } from "@/lib/library/ranking";
import { sortByFavourited, favouriteCount } from "@/lib/library/favourites";
import Section from "@/components/Section";
import Link from "next/link";

async function seedAction() {
  "use server";
  await seedLibrary();
}

async function refreshAction() {
  "use server";
  await refreshStarterDetails();
}

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; category?: string; view?: string }>;
}) {
  const sp = await searchParams;
  const activeType = sp.type && isResourceType(sp.type) ? (sp.type as ResourceType) : null;
  const activeCategory = sp.category ?? null;
  const onlyFavourites = sp.view === "favourites";

  const [all, taxonomy, stats, missing, stale] = await Promise.all([
    listResources(),
    listTaxonomy(),
    getLibraryStats(),
    missingSeedCount(),
    staleStarterCount(),
  ]);

  const visible = all.filter(
    (r) =>
      (!activeType || r.type === activeType) &&
      (!activeCategory || r.categories.some((c) => c.slug === activeCategory)) &&
      (!onlyFavourites || r.favourite)
  );

  // Yours, newest star first. Shown as its own section on the unfiltered page
  // and as the whole page when the Favourites tab is on.
  const favourites = sortByFavourited(visible);

  // The hero is chosen from everything, then shown only if the current filters
  // don't exclude it — so a category filter narrows the page without silently
  // promoting a different book into the top slot.
  const hero = heroResource(all);
  const heroVisible = hero !== null && visible.some((r) => r.id === hero.id);


  const continueLearning = visible.filter((r) => r.status === "IN_PROGRESS");
  const recent = [...visible]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 8);

  const tab = (href: string, label: string, active: boolean, count?: number) => (
    <Link
      key={label}
      href={href}
      className="badge border text-xs whitespace-nowrap"
      style={{
        borderColor: active ? "var(--accent)" : "var(--border)",
        color: active ? "var(--accent)" : "var(--muted)",
      }}
    >
      {label}
      {count !== undefined && <span className="ml-1 opacity-70">{count}</span>}
    </Link>
  );

  const qs = (over: Record<string, string | null>) => {
    const params = new URLSearchParams();
    const type = over.type === undefined ? activeType : over.type;
    const category = over.category === undefined ? activeCategory : over.category;
    const view = over.view === undefined ? (onlyFavourites ? "favourites" : null) : over.view;
    if (type) params.set("type", type);
    if (category) params.set("category", category);
    if (view) params.set("view", view);
    const s = params.toString();
    return s ? `/library?${s}` : "/library";
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-lg font-semibold">Library</h1>
          <p className="text-xs text-[var(--muted)] mt-1 max-w-2xl">
            Books, videos, podcasts and courses under one set of categories. The app stores what a
            thing is and how far through it you are — never the media itself.
          </p>
        </div>
        {/* Always available, never only on an empty library.
            Seeding is idempotent by slug: it adds what's missing and touches
            nothing you've edited. Hiding it once the first row existed meant a
            library seeded with an earlier version could never receive anything
            added later — which is exactly what happened. */}
        <div className="flex gap-2 flex-wrap">
          {missing > 0 && (
            <form action={seedAction}>
              <button type="submit" className="btn whitespace-nowrap">
                {all.length === 0
                  ? "Add the starter library"
                  : `Add ${missing} missing starter titles`}
              </button>
            </form>
          )}
          {/* Only fills empty fields. Anything you wrote yourself is left alone. */}
          {stale > 0 && (
            <form action={refreshAction}>
              <button
                type="submit"
                className="badge border border-[var(--border)] text-[var(--muted)] text-xs px-3 py-2 whitespace-nowrap"
                title="Rewrites the editorial text and shelf order for starter titles. Your progress, notes, rating and favourites are untouched."
              >
                Update text for {stale}
              </button>
            </form>
          )}
        </div>
      </div>

      {/* Four tabs plus All. Everything shares one taxonomy, so the category
          filter stays meaningful whichever tab is open. */}
      <div className="flex gap-1 flex-wrap">
        {tab(qs({ type: null }), "All", activeType === null && !onlyFavourites, all.length)}
        {/* Your own list, kept next to the type tabs because that's where you
            look for it — and it combines with them, so "favourite podcasts"
            is one click away. */}
        {tab(
          qs({ view: onlyFavourites ? null : "favourites" }),
          "★ Favourites",
          onlyFavourites,
          favouriteCount(all)
        )}
        {RESOURCE_TYPES.map((t) =>
          tab(
            qs({ type: t.value }),
            t.label,
            activeType === t.value,
            all.filter((r) => r.type === t.value).length
          )
        )}
        {activeCategory && (
          <Link
            href={qs({ category: null })}
            className="badge border border-[var(--accent)] text-[var(--accent)] text-xs"
          >
            {taxonomy.find((c) => c.slug === activeCategory)?.name ?? activeCategory} ×
          </Link>
        )}
      </div>

      {all.length === 0 ? (
        <div className="card p-8 text-center text-sm text-[var(--muted)]">
          Nothing here yet. The button above adds the shared categories, a master list of fifty
          books led by The Holy Bible, and ten university courses whose links were checked against
          each institution&apos;s own site. No page counts or lesson counts are invented — add the
          ones for your own edition as you go.
        </div>
      ) : (
        <>
          {heroVisible && hero && <HeroResource resource={hero} />}

          {onlyFavourites && visible.length === 0 && (
            <div className="card p-8 text-center text-sm text-[var(--muted)]">
              You haven&apos;t starred anything yet. The ☆ on any card adds it here — the app
              never picks your favourites for you.
            </div>
          )}

          {continueLearning.length > 0 && (
            <div>
              <div className="text-sm font-medium mb-2">Continue learning</div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {continueLearning.map((r) => (
                  <ResourceCard key={r.id} resource={r} />
                ))}
              </div>
            </div>
          )}

          {/* Not repeated when the Favourites tab is on — the whole page is
              already that list, and a section of it above itself is noise. */}
          {!onlyFavourites && favourites.length > 0 && (
            <div>
              <div className="flex items-baseline justify-between mb-2">
                <span className="text-sm font-medium">Your favourites</span>
                <Link href={qs({ view: "favourites" })} className="text-xs text-[var(--accent)]">
                  All {favourites.length} →
                </Link>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {favourites.slice(0, 3).map((r) => (
                  <ResourceCard key={r.id} resource={r} />
                ))}
              </div>
            </div>
          )}

          {/* With a type tab open, one list is the answer. On "All", the four
              lists are the answer, and repeating them under one heading would
              just be the same cards twice. */}
          {activeType ? (
            <div>
              <div className="text-sm font-medium mb-2">
                {RESOURCE_TYPES.find((t) => t.value === activeType)!.label}
              </div>
              {visible.length === 0 ? (
                <div className="card p-6 text-center text-xs text-[var(--muted)]">
                  Nothing here with these filters.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {visible.map((r) => (
                    <ResourceCard key={r.id} resource={r} />
                  ))}
                </div>
              )}
            </div>
          ) : (
            RESOURCE_TYPES.map((t) => {
              const rows = visible.filter((r) => r.type === t.value);
              if (rows.length === 0) return null;
              return (
                <div key={t.value}>
                  <div className="flex items-baseline justify-between mb-2">
                    <span className="text-sm font-medium">{t.label}</span>
                    <Link href={qs({ type: t.value })} className="text-xs text-[var(--accent)]">
                      All {rows.length} →
                    </Link>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                    {rows.slice(0, 3).map((r) => (
                      <ResourceCard key={r.id} resource={r} />
                    ))}
                  </div>
                </div>
              );
            })
          )}

          <div>
            <div className="text-sm font-medium mb-2">Browse by category</div>
            <div className="flex gap-2 flex-wrap">
              {taxonomy.map((c) => (
                <Link
                  key={c.id}
                  href={qs({ category: c.slug })}
                  className="card px-3 py-2 hover:opacity-90 transition-opacity"
                >
                  <div className="text-xs font-medium">{c.name}</div>
                  <div className="text-[10px] text-[var(--muted)]">
                    {c.count} {c.count === 1 ? "resource" : "resources"} · {c.subtags.length} subtags
                  </div>
                </Link>
              ))}
            </div>
          </div>

          {recent.length > 0 && (
            <Section title="Recently added" summary={`${recent.length}`}>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {recent.map((r) => (
                  <ResourceCard key={r.id} resource={r} />
                ))}
              </div>
            </Section>
          )}

          {/* Counts per type, never added together: pages and minutes measure
              different things and a combined figure would mean nothing. */}
          <Section title="Statistics" summary="by type and category">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {RESOURCE_TYPES.map((t) => {
                const s = stats.byType[t.value];
                return (
                  <div key={t.value} className="card p-3">
                    <div className="text-xs text-[var(--muted)]">{t.label}</div>
                    <div className="text-lg font-semibold mt-1">{s.completed} completed</div>
                    <div className="text-[10px] text-[var(--muted)] mt-1">
                      {s.unitsDone} {s.unit.toLowerCase()} · {s.inProgress} in progress
                    </div>
                  </div>
                );
              })}
            </div>

            {stats.byCategory.length > 0 && (
              <div className="mt-4">
                <div className="text-xs text-[var(--muted)] mb-2">Completed by category</div>
                <div className="space-y-1">
                  {stats.byCategory.map((c) => (
                    <div key={c.category} className="flex items-center gap-2 text-xs">
                      <span className="w-40 truncate">{c.category}</span>
                      <div className="flex-1 h-1.5 rounded-full bg-[var(--surface-2)] overflow-hidden">
                        <div
                          className="h-full bg-[var(--accent)]"
                          style={{ width: `${c.total === 0 ? 0 : (c.completed / c.total) * 100}%` }}
                        />
                      </div>
                      <span className="text-[var(--muted)] w-16 text-right">
                        {c.completed}/{c.total}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Section>
        </>
      )}

      <Section title="Add a resource" summary="book, video, podcast or course">
        <p className="text-xs text-[var(--muted)] mb-3 max-w-2xl">
          The form adapts to the type you pick — a podcast never asks for an ISBN. Videos, podcasts
          and courses need a link, because the app stores metadata and progress and hosts no media
          of its own.
        </p>
        <Link href="/library/new" className="btn inline-block">
          Open the form
        </Link>
      </Section>
    </div>
  );
}

"use server";

import { db } from "@/db/client";
import {
  learningResources,
  learningResourceMeta,
  resourceCategories,
  resourceSubtags,
  learningResourceCategories,
  learningResourceSubtags,
  auditLog,
} from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import {
  isResourceType,
  isLevel,
  isStatus,
  isProgressUnit,
  requiresUrl,
  defaultUnitFor,
  type ResourceType,
  type ProgressUnit,
  type Status,
} from "@/lib/library/types";
import { progressView, statusAfterProgress, libraryStats, slugify } from "@/lib/library/progress";
import { isSafeUrl } from "@/lib/library/links";
import { compareEditorial, planRankUpdate } from "@/lib/library/ranking";
import { toggleFavouriteState } from "@/lib/library/favourites";
import { SEED_CATEGORIES, SEED_RESOURCES, parseSubtagRef } from "@/lib/library/seed";

const num = (v: FormDataEntryValue | null): number | null => {
  const raw = String(v ?? "").trim();
  if (raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
};

const str = (v: FormDataEntryValue | null): string | null => {
  const raw = String(v ?? "").trim();
  return raw === "" ? null : raw;
};

/** Every resource with its taxonomy and type-specific fields resolved. */
export async function listResources() {
  const [rows, metas, cats, subs, resCats, resSubs] = await Promise.all([
    db.select().from(learningResources),
    db.select().from(learningResourceMeta),
    db.select().from(resourceCategories),
    db.select().from(resourceSubtags),
    db.select().from(learningResourceCategories),
    db.select().from(learningResourceSubtags),
  ]);

  const metaFor = new Map(metas.map((m) => [m.resourceId, m]));
  const catById = new Map(cats.map((c) => [c.id, c]));
  const subById = new Map(subs.map((s) => [s.id, s]));

  return rows
    .filter((r) => !r.archived)
    .map((r) => {
      const meta = metaFor.get(r.id);
      const myCats = resCats
        .filter((rc) => rc.resourceId === r.id)
        .map((rc) => catById.get(rc.categoryId))
        .filter((c): c is NonNullable<typeof c> => c !== undefined);

      const mySubs = resSubs
        .filter((rs) => rs.resourceId === r.id)
        .map((rs) => subById.get(rs.subtagId))
        .filter((s): s is NonNullable<typeof s> => s !== undefined);

      const type = r.type as ResourceType;
      const unit = r.progressUnit as ProgressUnit;

      return {
        id: r.id,
        slug: r.slug,
        type,
        title: r.title,
        creator: r.creator,
        description: r.description,
        whyLearn: r.whyLearn,
        lessons: r.lessons,
        externalUrl: r.externalUrl,
        imageUrl: r.imageUrl,
        level: r.level,
        perspective: r.perspective,
        language: r.language,
        publicationYear: r.publicationYear === null ? null : Number(r.publicationYear),
        status: r.status as Status,
        personalRating: r.personalRating === null ? null : Number(r.personalRating),
        notes: r.notes,
        featured: r.featured,
        favourite: r.favourite,
        favouritedAt: r.favouritedAt,
        // Editorial standing, kept strictly apart from personalRating above.
        editorialRank: r.editorialRank === null ? null : Number(r.editorialRank),
        heroFeatured: r.heroFeatured,
        specialBadge: r.specialBadge,
        specialDescription: r.specialDescription,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        progress: progressView({
          progress: Number(r.progress),
          totalUnits: r.totalUnits === null ? null : Number(r.totalUnits),
          progressUnit: unit,
          status: r.status as Status,
        }),
        categories: myCats.map((c) => ({ id: c.id, slug: c.slug, name: c.name })),
        // Subtags belong to a category, so they're grouped by it on the page —
        // "Stoicism" alone tells you less than "Philosophy → Stoicism".
        subtagsByCategory: myCats.map((c) => ({
          category: c.name,
          categorySlug: c.slug,
          subtags: mySubs
            .filter((s) => s.categoryId === c.id)
            .map((s) => ({ id: s.id, slug: s.slug, name: s.name })),
        })),
        meta: {
          isbn13: meta?.isbn13 ?? null,
          pageCount: meta?.pageCount === null || meta?.pageCount === undefined ? null : Number(meta.pageCount),
          coverUrl: meta?.coverUrl ?? null,
          affiliateUrl: meta?.affiliateUrl ?? null,
          translator: meta?.translator ?? null,
          translation: meta?.translation ?? null,
          edition: meta?.edition ?? null,
          publisher: meta?.publisher ?? null,
          platform: meta?.platform ?? null,
          videoUrl: meta?.videoUrl ?? null,
          durationMinutes:
            meta?.durationMinutes === null || meta?.durationMinutes === undefined
              ? null
              : Number(meta.durationMinutes),
          channelName: meta?.channelName ?? null,
          hostName: meta?.hostName ?? null,
          guestName: meta?.guestName ?? null,
          institution: meta?.institution ?? null,
          instructor: meta?.instructor ?? null,
          lessonCount:
            meta?.lessonCount === null || meta?.lessonCount === undefined ? null : Number(meta.lessonCount),
          completedLessons:
            meta?.completedLessons === null || meta?.completedLessons === undefined
              ? null
              : Number(meta.completedLessons),
          estimatedHours:
            meta?.estimatedHours === null || meta?.estimatedHours === undefined
              ? null
              : Number(meta.estimatedHours),
        },
      };
    })
    // Editorial order, not recency: a ranked resource leads every list it
    // appears in, and everything unranked falls back to most-recently-touched.
    .sort(compareEditorial);
}

export type LibraryResource = Awaited<ReturnType<typeof listResources>>[number];

export async function getResourceBySlug(slug: string) {
  const all = await listResources();
  return all.find((r) => r.slug === slug) ?? null;
}

/** The taxonomy, with counts, for the browse-by-category section. */
export async function listTaxonomy() {
  const [cats, subs, resCats] = await Promise.all([
    db.select().from(resourceCategories),
    db.select().from(resourceSubtags),
    db.select().from(learningResourceCategories),
  ]);

  return cats
    .map((c) => ({
      id: c.id,
      slug: c.slug,
      name: c.name,
      description: c.description,
      sortOrder: Number(c.sortOrder),
      count: resCats.filter((rc) => rc.categoryId === c.id).length,
      subtags: subs
        .filter((s) => s.categoryId === c.id)
        .map((s) => ({ id: s.id, slug: s.slug, name: s.name }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}

/**
 * How many starter titles aren't in the database yet.
 *
 * Counted over every row including archived ones, because seeding skips by
 * slug the same way — offering to add something you deliberately archived
 * would be the app arguing with you.
 */
export async function missingSeedCount(): Promise<number> {
  const rows = await db.select({ slug: learningResources.slug }).from(learningResources);
  const present = new Set(rows.map((r) => r.slug));
  return SEED_RESOURCES.filter((s) => !present.has(s.slug)).length;
}

export async function getLibraryStats() {
  const items = await listResources();
  return libraryStats(
    items.map((r) => ({
      type: r.type,
      status: r.status,
      progress: r.progress.done,
      totalUnits: r.progress.total,
      progressUnit: r.progress.unit,
      categories: r.categories.map((c) => c.name),
    }))
  );
}

/** A slug nobody else is using. */
async function uniqueSlug(title: string): Promise<string> {
  const base = slugify(title) || "resource";
  const existing = await db.select().from(learningResources);
  const taken = new Set(existing.map((r) => r.slug));
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

export async function createResource(formData: FormData) {
  const type = String(formData.get("type") ?? "");
  if (!isResourceType(type)) throw new Error(`Unknown resource type: ${type}`);

  const title = String(formData.get("title") ?? "").trim();
  const creator = String(formData.get("creator") ?? "").trim();
  if (!title) throw new Error("A resource needs a title.");
  if (!creator) throw new Error("A resource needs a creator — author, channel, host or professor.");

  const externalUrl = str(formData.get("externalUrl"));
  // The app hosts nothing, so a video, podcast or course without a link points
  // at nothing at all. A book you own is different.
  if (requiresUrl(type) && !externalUrl) {
    throw new Error(`A ${type.toLowerCase()} needs an external link — the app doesn't host media.`);
  }
  if (externalUrl && !isSafeUrl(externalUrl)) {
    throw new Error("That link isn't a valid http(s) URL.");
  }

  const affiliateUrl = str(formData.get("affiliateUrl"));
  if (affiliateUrl && !isSafeUrl(affiliateUrl)) {
    throw new Error("That affiliate link isn't a valid http(s) URL.");
  }

  const levelRaw = String(formData.get("level") ?? "BEGINNER");
  const unitRaw = String(formData.get("progressUnit") ?? "");

  const [created] = await db
    .insert(learningResources)
    .values({
      type,
      slug: await uniqueSlug(title),
      title,
      creator,
      description: String(formData.get("description") ?? "").trim(),
      whyLearn: str(formData.get("whyLearn")),
      lessons: str(formData.get("lessons")),
      externalUrl,
      imageUrl: str(formData.get("imageUrl")),
      level: isLevel(levelRaw) ? levelRaw : "BEGINNER",
      perspective: str(formData.get("perspective")),
      language: str(formData.get("language")),
      publicationYear: (() => {
        const y = num(formData.get("publicationYear"));
        return y === null ? null : String(Math.round(y));
      })(),
      progressUnit: isProgressUnit(unitRaw) ? unitRaw : defaultUnitFor(type),
      totalUnits: (() => {
        const t = num(formData.get("totalUnits"));
        return t === null ? null : String(t);
      })(),
    })
    .returning();

  await db.insert(learningResourceMeta).values({
    resourceId: created.id,
    isbn13: str(formData.get("isbn13")),
    pageCount: (() => {
      const n = num(formData.get("pageCount"));
      return n === null ? null : String(Math.round(n));
    })(),
    coverUrl: str(formData.get("coverUrl")),
    affiliateUrl,
    translator: str(formData.get("translator")),
    translation: str(formData.get("translation")),
    edition: str(formData.get("edition")),
    publisher: str(formData.get("publisher")),
    platform: str(formData.get("platform")),
    durationMinutes: (() => {
      const n = num(formData.get("durationMinutes"));
      return n === null ? null : String(Math.round(n));
    })(),
    channelName: str(formData.get("channelName")),
    hostName: str(formData.get("hostName")),
    guestName: str(formData.get("guestName")),
    institution: str(formData.get("institution")),
    instructor: str(formData.get("instructor")),
    lessonCount: (() => {
      const n = num(formData.get("lessonCount"));
      return n === null ? null : String(Math.round(n));
    })(),
    estimatedHours: (() => {
      const n = num(formData.get("estimatedHours"));
      return n === null ? null : String(n);
    })(),
  });

  await applyTaxonomy(created.id, formData);

  await db.insert(auditLog).values({
    entityType: "learning_resource",
    entityId: created.id,
    action: "resource_created",
    details: JSON.stringify({ type, title, creator }),
  });

  revalidatePath("/library");
}

/**
 * Categories and subtags, replaced wholesale.
 *
 * A subtag is only accepted if its category was also chosen — "Stoicism"
 * without "Philosophy" would leave a tag hanging under a category the resource
 * isn't in, and the detail page groups subtags by category.
 */
async function applyTaxonomy(resourceId: string, formData: FormData) {
  const categoryIds = formData.getAll("categoryIds").map(String).filter(Boolean);
  const subtagIds = formData.getAll("subtagIds").map(String).filter(Boolean);

  await db.delete(learningResourceCategories).where(eq(learningResourceCategories.resourceId, resourceId));
  await db.delete(learningResourceSubtags).where(eq(learningResourceSubtags.resourceId, resourceId));

  if (categoryIds.length > 0) {
    await db
      .insert(learningResourceCategories)
      .values(categoryIds.map((categoryId) => ({ resourceId, categoryId })))
      .onConflictDoNothing();
  }

  if (subtagIds.length > 0) {
    const allowed = await db.select().from(resourceSubtags);
    const kept = subtagIds.filter((id) => {
      const sub = allowed.find((s) => s.id === id);
      return sub && categoryIds.includes(sub.categoryId);
    });
    if (kept.length > 0) {
      await db
        .insert(learningResourceSubtags)
        .values(kept.map((subtagId) => ({ resourceId, subtagId })))
        .onConflictDoNothing();
    }
  }
}

export async function updateResource(formData: FormData) {
  const id = String(formData.get("id"));
  const [existing] = await db.select().from(learningResources).where(eq(learningResources.id, id));
  if (!existing) throw new Error("Resource not found");

  const externalUrl = formData.has("externalUrl") ? str(formData.get("externalUrl")) : existing.externalUrl;
  if (externalUrl && !isSafeUrl(externalUrl)) throw new Error("That link isn't a valid http(s) URL.");

  const levelRaw = String(formData.get("level") ?? existing.level);
  const statusRaw = String(formData.get("status") ?? existing.status);

  /**
   * Absent means "not edited here", not "cleared".
   *
   * The detail page has more than one form — notes and rating in one, your
   * edition in another — and without this guard saving either would blank
   * every field the other one owns.
   */
  const keep = <T,>(field: string, read: () => T, current: T): T =>
    formData.has(field) ? read() : current;

  await db
    .update(learningResources)
    .set({
      title: String(formData.get("title") ?? existing.title).trim() || existing.title,
      creator: String(formData.get("creator") ?? existing.creator).trim() || existing.creator,
      description: String(formData.get("description") ?? existing.description),
      whyLearn: keep("whyLearn", () => str(formData.get("whyLearn")), existing.whyLearn),
      lessons: keep("lessons", () => str(formData.get("lessons")), existing.lessons),
      externalUrl,
      imageUrl: keep("imageUrl", () => str(formData.get("imageUrl")), existing.imageUrl),
      level: isLevel(levelRaw) ? levelRaw : existing.level,
      language: keep("language", () => str(formData.get("language")), existing.language),
      perspective: keep("perspective", () => str(formData.get("perspective")), existing.perspective),
      status: isStatus(statusRaw) ? statusRaw : existing.status,
      // Yours, and only ever set by you. The editorial badge lives in its own
      // columns and is never written from this form.
      personalRating: keep(
        "personalRating",
        () => {
          const r = num(formData.get("personalRating"));
          if (r === null) return null;
          return String(Math.min(5, Math.max(1, Math.round(r))));
        },
        existing.personalRating
      ),
      notes: keep("notes", () => str(formData.get("notes")), existing.notes),
      updatedAt: new Date(),
    })
    .where(eq(learningResources.id, id));

  // Edition details live in the side table. Only fields the form actually sent
  // are touched, so editing a course can't blank a book's ISBN.
  const metaPatch: Record<string, string | null> = {};
  for (const field of ["translation", "edition", "publisher", "translator", "isbn13", "coverUrl"]) {
    if (formData.has(field)) metaPatch[field] = str(formData.get(field));
  }
  if (Object.keys(metaPatch).length > 0) {
    await db
      .update(learningResourceMeta)
      .set({ ...metaPatch, updatedAt: new Date() })
      .where(eq(learningResourceMeta.resourceId, id));
  }

  // Only a form that owns the taxonomy may replace it. Unchecked boxes send
  // nothing, so "no categories in the payload" can't be read as "remove them
  // all" — a form without the marker simply isn't about categories.
  if (formData.has("taxonomy")) await applyTaxonomy(id, formData);

  await db.insert(auditLog).values({
    entityType: "learning_resource",
    entityId: id,
    action: "resource_edited",
    details: JSON.stringify({ title: existing.title }),
  });

  revalidatePath("/library");
  revalidatePath(`/library/${existing.slug}`);
}

/**
 * Records progress, in whatever unit this resource uses.
 *
 * The status follows the progress but never un-abandons anything: giving up is
 * a decision, and reopening the book shouldn't quietly erase it.
 */
export async function setProgress(formData: FormData) {
  const id = String(formData.get("id"));
  const [existing] = await db.select().from(learningResources).where(eq(learningResources.id, id));
  if (!existing) throw new Error("Resource not found");

  const progress = Math.max(0, num(formData.get("progress")) ?? 0);
  const totalUnits = num(formData.get("totalUnits"));

  const unit = existing.progressUnit as ProgressUnit;
  const effectiveTotal =
    totalUnits ?? (existing.totalUnits === null ? null : Number(existing.totalUnits));

  /**
   * The status the form asked for decides the view, not the one on the row.
   *
   * Reading the old status meant choosing "Completed" computed a view that
   * still thought you were mid-way, stored that number, and left the bar where
   * it was. The status you just picked is the fact; the counter follows it.
   */
  const statusRaw = String(formData.get("status") ?? "");
  const chosen = isStatus(statusRaw) ? statusRaw : null;

  const view = progressView({
    progress,
    totalUnits: effectiveTotal,
    progressUnit: unit,
    status: chosen ?? (existing.status as Status),
  });

  const status = chosen ?? statusAfterProgress(existing.status as Status, view);

  await db
    .update(learningResources)
    .set({
      progress: String(view.done),
      totalUnits:
        totalUnits === null
          ? existing.totalUnits
          : totalUnits <= 0
            ? null
            : String(totalUnits),
      status,
      updatedAt: new Date(),
    })
    .where(eq(learningResources.id, id));

  // A course counts lessons in both places; keep them from disagreeing.
  if (existing.type === "COURSE" && unit === "LESSONS") {
    await db
      .update(learningResourceMeta)
      .set({ completedLessons: String(Math.round(view.done)), updatedAt: new Date() })
      .where(eq(learningResourceMeta.resourceId, id));
  }

  revalidatePath("/library");
  revalidatePath(`/library/${existing.slug}`);
}

/**
 * Stars or un-stars a resource.
 *
 * Revalidates the detail page as well as the list, because the star appears in
 * both and a stale one reads as a failed click.
 */
export async function toggleFavourite(formData: FormData) {
  const id = String(formData.get("id"));
  const [existing] = await db.select().from(learningResources).where(eq(learningResources.id, id));
  if (!existing) return;

  const next = toggleFavouriteState({
    favourite: existing.favourite,
    favouritedAt: existing.favouritedAt,
  });

  await db
    .update(learningResources)
    .set({ ...next, updatedAt: new Date() })
    .where(eq(learningResources.id, id));

  await db.insert(auditLog).values({
    entityType: "learning_resource",
    entityId: id,
    action: next.favourite ? "resource_favourited" : "resource_unfavourited",
    details: JSON.stringify({ title: existing.title }),
  });

  revalidatePath("/library");
  revalidatePath(`/library/${existing.slug}`);
}

export async function toggleFeatured(formData: FormData) {
  const id = String(formData.get("id"));
  const [existing] = await db.select().from(learningResources).where(eq(learningResources.id, id));
  if (!existing) return;
  await db
    .update(learningResources)
    .set({ featured: !existing.featured, updatedAt: new Date() })
    .where(eq(learningResources.id, id));
  revalidatePath("/library");
}

/** Archiving keeps the row: what you read is history worth keeping. */
export async function archiveResource(formData: FormData) {
  const id = String(formData.get("id"));
  await db
    .update(learningResources)
    .set({ archived: true, updatedAt: new Date() })
    .where(eq(learningResources.id, id));
  await db.insert(auditLog).values({
    entityType: "learning_resource",
    entityId: id,
    action: "resource_archived",
  });
  revalidatePath("/library");
}

/**
 * Brings starter rows up to date with the current editorial data.
 *
 * What it rewrites: description, why-learn, topic list, badge, subtitle,
 * editorial rank, and any category the book is missing.
 *
 * What it never touches: progress, status, notes, personal rating, favourite,
 * archived, or the fields describing your edition. Those are yours, and the
 * whole difference between an editorial refresh and a reset is that this one
 * can't lose anything you did.
 *
 * Categories are added, never removed — an extra shelf is recoverable, a
 * deleted one isn't.
 */
export async function refreshStarterDetails() {
  const bySlug = new Map(SEED_RESOURCES.map((s) => [s.slug, s]));
  const rows = await db.select().from(learningResources);
  const seeded = rows.filter((r) => bySlug.has(r.slug));

  const cats = await db.select().from(resourceCategories);
  const catId = new Map(cats.map((c) => [c.slug, c.id]));
  const links = await db.select().from(learningResourceCategories);

  /**
   * Renumbering the shelf is a permutation, so ranks are freed before any are
   * taken — see planRankUpdate. The whole refresh runs in one transaction: a
   * failure halfway through the old version left some rows renumbered, some
   * cleared and the rest untouched, which then made every retry fail too.
   */
  const plan = planRankUpdate(
    rows.map((r) => ({
      id: r.id,
      editorialRank: r.editorialRank === null ? null : Number(r.editorialRank),
    })),
    seeded.map((r) => ({ id: r.id, rank: bySlug.get(r.slug)!.editorialRank }))
  );

  let updated = 0;

  await db.transaction(async (tx) => {
    for (const id of plan.clear) {
      await tx
        .update(learningResources)
        .set({ editorialRank: null })
        .where(eq(learningResources.id, id));
    }

    const rankFor = new Map(plan.assign.map((a) => [a.id, a.rank]));

    for (const row of seeded) {
      const seed = bySlug.get(row.slug)!;
      const rank = rankFor.get(row.id);

      await tx
        .update(learningResources)
        .set({
          description: seed.description,
          whyLearn: seed.whyLearn ?? row.whyLearn,
          lessons: seed.lessons ?? row.lessons,
          level: seed.level,
          specialBadge: seed.specialBadge ?? row.specialBadge,
          specialDescription: seed.specialDescription ?? row.specialDescription,
          editorialRank: rank === undefined ? null : String(rank),
          heroFeatured: seed.heroFeatured ?? row.heroFeatured,
          updatedAt: new Date(),
        })
        .where(eq(learningResources.id, row.id));

      // The playlist and its length, for rows seeded before either was verified.
      if (seed.meta?.videoUrl || seed.meta?.lessonCount !== undefined) {
        await tx
          .update(learningResourceMeta)
          .set({
            videoUrl: seed.meta.videoUrl ?? null,
            lessonCount:
              seed.meta.lessonCount === undefined ? null : String(seed.meta.lessonCount),
            updatedAt: new Date(),
          })
          .where(eq(learningResourceMeta.resourceId, row.id));
      }

      const have = new Set(links.filter((l) => l.resourceId === row.id).map((l) => l.categoryId));
      const missing = seed.categories
        .map((slug) => catId.get(slug))
        .filter((id): id is string => id !== undefined && !have.has(id));

      if (missing.length > 0) {
        await tx
          .insert(learningResourceCategories)
          .values(missing.map((categoryId) => ({ resourceId: row.id, categoryId })))
          .onConflictDoNothing();
      }

      updated++;
    }
  });

  await db.insert(auditLog).values({
    entityType: "learning_resource",
    entityId: "seed",
    action: "starter_details_refreshed",
    details: JSON.stringify({ resourcesUpdated: updated }),
  });

  revalidatePath("/library");
  return { filled: updated };
}

/**
 * How many starter rows don't match the current editorial data.
 * Drives whether the refresh button is worth showing at all.
 */
export async function staleStarterCount(): Promise<number> {
  const bySlug = new Map(SEED_RESOURCES.map((s) => [s.slug, s]));
  const rows = await db.select().from(learningResources);
  return rows.filter((row) => {
    const seed = bySlug.get(row.slug);
    if (!seed) return false;
    const rank = row.editorialRank === null ? undefined : Number(row.editorialRank);
    return (
      row.description !== seed.description ||
      (seed.lessons !== undefined && row.lessons !== seed.lessons) ||
      (seed.whyLearn !== undefined && row.whyLearn !== seed.whyLearn) ||
      row.level !== seed.level ||
      rank !== seed.editorialRank
    );
  }).length;
}

/**
 * Seeds the taxonomy, the master book list and the verified courses.
 *
 * Idempotent by slug: running it twice adds nothing and overwrites nothing you
 * have edited. That matters because the obvious way to use it is to press the
 * button again after adding a book by hand — and because the editorial rank is
 * unique, a second insert of the same row would otherwise fail outright.
 */
export async function seedLibrary() {
  const existingCats = await db.select().from(resourceCategories);
  const catBySlug = new Map(existingCats.map((c) => [c.slug, c]));

  for (const [index, cat] of SEED_CATEGORIES.entries()) {
    let row = catBySlug.get(cat.slug);
    if (!row) {
      [row] = await db
        .insert(resourceCategories)
        .values({
          slug: cat.slug,
          name: cat.name,
          description: cat.description ?? null,
          sortOrder: String(index),
        })
        .returning();
      catBySlug.set(cat.slug, row);
    }

    const existingSubs = await db
      .select()
      .from(resourceSubtags)
      .where(eq(resourceSubtags.categoryId, row.id));
    const subSlugs = new Set(existingSubs.map((s) => s.slug));

    const missing = cat.subtags.filter((s) => !subSlugs.has(s.slug));
    if (missing.length > 0) {
      await db
        .insert(resourceSubtags)
        .values(missing.map((s) => ({ categoryId: row!.id, slug: s.slug, name: s.name })))
        .onConflictDoNothing();
    }
  }

  const allCats = await db.select().from(resourceCategories);
  const allSubs = await db.select().from(resourceSubtags);
  const catId = new Map(allCats.map((c) => [c.slug, c.id]));
  // Keyed by "category/subtag": the same subtag slug lives under two
  // categories on purpose (Free Will under both Theology and Philosophy), so
  // an unqualified lookup would attach the wrong one — or both.
  const subId = new Map<string, string>();
  for (const s of allSubs) {
    const cat = allCats.find((c) => c.id === s.categoryId);
    if (cat) subId.set(`${cat.slug}/${s.slug}`, s.id);
  }

  const existingResources = await db.select().from(learningResources);
  const bySlug = new Set(existingResources.map((r) => r.slug));
  // Rank is unique in the database. Anything already claiming a rank keeps it,
  // so re-seeding after you promoted something by hand can't collide.
  const takenRanks = new Set(
    existingResources
      .map((r) => (r.editorialRank === null ? null : Number(r.editorialRank)))
      .filter((n): n is number => n !== null)
  );

  let added = 0;
  for (const item of SEED_RESOURCES) {
    if (bySlug.has(item.slug)) continue;

    const rank = item.editorialRank !== undefined && !takenRanks.has(item.editorialRank)
      ? String(item.editorialRank)
      : null;
    if (rank !== null) takenRanks.add(item.editorialRank!);

    const [created] = await db
      .insert(learningResources)
      .values({
        type: item.type,
        slug: item.slug,
        title: item.title,
        creator: item.creator,
        description: item.description,
        whyLearn: item.whyLearn ?? null,
        lessons: item.lessons ?? null,
        externalUrl: item.externalUrl ?? null,
        level: item.level,
        language: item.language ?? null,
        progressUnit: item.progressUnit,
        featured: item.featured ?? false,
        editorialRank: rank,
        // Without a rank the hero flag would let it outrank the ranked entry.
        heroFeatured: rank === null ? false : (item.heroFeatured ?? false),
        specialBadge: item.specialBadge ?? null,
        specialDescription: item.specialDescription ?? null,
        // personalRating is deliberately left null: the badge is the app's
        // opinion, the stars are yours, and the app doesn't get to fill them in.
      })
      .returning();

    await db.insert(learningResourceMeta).values({
      resourceId: created.id,
      platform: item.meta?.platform ?? null,
      institution: item.meta?.institution ?? null,
      instructor: item.meta?.instructor ?? null,
      videoUrl: item.meta?.videoUrl ?? null,
      // Only present where a playlist was actually opened and counted.
      lessonCount: item.meta?.lessonCount === undefined ? null : String(item.meta.lessonCount),
    });

    const myCatIds = item.categories
      .map((slug) => catId.get(slug))
      .filter((id): id is string => id !== undefined);

    if (myCatIds.length > 0) {
      await db
        .insert(learningResourceCategories)
        .values(myCatIds.map((categoryId) => ({ resourceId: created.id, categoryId })))
        .onConflictDoNothing();
    }

    const mySubIds = item.subtags
      .map((ref) => {
        const parsed = parseSubtagRef(ref);
        if (!parsed) return undefined;
        // A subtag whose category the resource isn't in would hang under a
        // heading the detail page never renders.
        const owningCat = catId.get(parsed.category);
        if (!owningCat || !myCatIds.includes(owningCat)) return undefined;
        return subId.get(ref);
      })
      .filter((id): id is string => id !== undefined);

    if (mySubIds.length > 0) {
      await db
        .insert(learningResourceSubtags)
        .values(mySubIds.map((subtagId) => ({ resourceId: created.id, subtagId })))
        .onConflictDoNothing();
    }

    added++;
  }

  await db.insert(auditLog).values({
    entityType: "learning_resource",
    entityId: "seed",
    action: "library_seeded",
    details: JSON.stringify({ resourcesAdded: added, categories: SEED_CATEGORIES.length }),
  });

  revalidatePath("/library");
  return { added };
}

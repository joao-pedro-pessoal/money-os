"use server";

import { db } from "@/db/client";
import { savedViews } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import {
  serialiseView,
  parseView,
  cleanName,
  VIEW_SCOPE_ANALYSIS,
  type ViewConfig,
} from "@/lib/portfolio/savedViews";
import { GROUP_BY_OPTIONS, SORT_COLUMNS } from "@/lib/portfolio/analysis";

function allowed() {
  return {
    groupBy: GROUP_BY_OPTIONS.map((o) => o.value as string),
    sort: SORT_COLUMNS.map((c) => c.key as string),
  };
}

export async function listAnalysisViews() {
  const rows = await db.select().from(savedViews).where(eq(savedViews.scope, VIEW_SCOPE_ANALYSIS));

  return rows
    .map((r) => {
      const config = parseView(r.config, allowed());
      return {
        id: r.id,
        name: r.name,
        // Re-serialised after validation, so a view saved against an option
        // that has since been renamed opens on a working screen instead of a
        // broken one.
        query: serialiseView(config),
        config,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "pt-PT"));
}

export async function saveAnalysisView(formData: FormData) {
  const name = cleanName(String(formData.get("name") ?? ""));
  if (!name) throw new Error("Give the view a name.");

  // The view arrives as the screen's own query, filters and second grouping
  // included. A page loaded before that sends the old separate fields.
  const query = formData.get("query");
  const config: ViewConfig =
    typeof query === "string"
      ? parseView(query, allowed())
      : {
          groupBy: String(formData.get("groupBy") ?? "") || undefined,
          sort: String(formData.get("sort") ?? "") || undefined,
          dir: String(formData.get("dir") ?? "") || undefined,
          synced: String(formData.get("synced") ?? "") || undefined,
          status: String(formData.get("status") ?? "") || undefined,
        };

  const serialised = serialiseView(parseView(serialiseView(config), allowed()));

  // Saving the same name twice updates it rather than growing a second chip
  // with identical text and different behaviour.
  const [existing] = await db
    .select()
    .from(savedViews)
    .where(and(eq(savedViews.scope, VIEW_SCOPE_ANALYSIS), eq(savedViews.name, name)));

  if (existing) {
    await db.update(savedViews).set({ config: serialised }).where(eq(savedViews.id, existing.id));
  } else {
    await db.insert(savedViews).values({ name, scope: VIEW_SCOPE_ANALYSIS, config: serialised });
  }

  revalidatePath("/investments/analysis");
}

export async function deleteSavedView(formData: FormData) {
  const id = String(formData.get("id"));
  await db.delete(savedViews).where(eq(savedViews.id, id));
  revalidatePath("/investments/analysis");
}

/**
 * Saved filter combinations for the screens that filter on the client: the
 * trade history and the movements. Stored as the screen's own JSON, which the
 * screen validates when it reads it back (`parseTradeFilters`,
 * `parseTransactionFilters`), so a value removed since drops out.
 */
const FILTER_SCOPES = ["trade-history", "transactions"] as const;
type FilterScope = (typeof FILTER_SCOPES)[number];

function filterScope(scope: string): FilterScope {
  if (!(FILTER_SCOPES as readonly string[]).includes(scope)) throw new Error("Unknown screen.");
  return scope as FilterScope;
}

export async function listSavedFilters(scope: string): Promise<{ id: string; name: string; config: string }[]> {
  const rows = await db.select().from(savedViews).where(eq(savedViews.scope, filterScope(String(scope))));
  return rows
    .map((r) => ({ id: r.id, name: r.name, config: r.config }))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-PT"));
}

export async function saveFilters(scope: string, rawName: string, config: string): Promise<void> {
  // An endpoint like any server action: what arrives need not be what the types say.
  if (typeof scope !== "string" || typeof rawName !== "string" || typeof config !== "string") {
    throw new Error("Those filters could not be saved.");
  }
  const where = filterScope(scope);
  const name = cleanName(rawName);
  if (!name) throw new Error("Give the filters a name.");
  if (config.length > 8000) throw new Error("Too many filters to save at once.");
  try {
    JSON.parse(config);
  } catch {
    throw new Error("Those filters could not be saved.");
  }
  // The same name again replaces it, as for the Analysis views.
  const [existing] = await db
    .select()
    .from(savedViews)
    .where(and(eq(savedViews.scope, where), eq(savedViews.name, name)));
  if (existing) await db.update(savedViews).set({ config }).where(eq(savedViews.id, existing.id));
  else await db.insert(savedViews).values({ name, scope: where, config });
}

export async function deleteSavedFilters(id: string): Promise<void> {
  if (typeof id !== "string" || id.length > 64) throw new Error("Which filters?");
  await db.delete(savedViews).where(eq(savedViews.id, id));
}

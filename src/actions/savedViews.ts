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

  const config: ViewConfig = {
    groupBy: String(formData.get("groupBy") ?? "") || undefined,
    sort: String(formData.get("sort") ?? "") || undefined,
    dir: String(formData.get("dir") ?? "") || undefined,
    synced: String(formData.get("synced") ?? "") || undefined,
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

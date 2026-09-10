import { listTaxonomy, createResource } from "@/actions/library";
import ResourceForm from "@/components/library/ResourceForm";
import Link from "next/link";

export default async function NewResourcePage() {
  const taxonomy = await listTaxonomy();

  return (
    <div className="space-y-4 max-w-2xl">
      <div>
        <Link href="/library" className="text-xs text-[var(--accent)]">
          ← Library
        </Link>
        <h1 className="text-lg font-semibold mt-2">Add a resource</h1>
        <p className="text-xs text-[var(--muted)] mt-1">
          A single lecture is a video; a lecture series or a YouTube playlist is a course. A podcast
          episode and a whole series are both podcasts.
        </p>
      </div>

      {taxonomy.length === 0 ? (
        <div className="card p-6 text-sm text-[var(--muted)]">
          No categories yet.{" "}
          <Link href="/library" className="text-[var(--accent)]">
            Add the starter set
          </Link>{" "}
          first, so this resource has somewhere to live.
        </div>
      ) : (
        <ResourceForm
          categories={taxonomy.map((c) => ({ id: c.id, name: c.name, subtags: c.subtags }))}
          action={createResource}
        />
      )}
    </div>
  );
}

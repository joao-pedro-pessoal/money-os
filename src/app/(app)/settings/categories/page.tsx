import {
  listCategories,
  createCategory,
  deleteCategory,
  setCategoryFixed,
} from "@/actions/transactions";
import ConfirmSubmitButton from "@/components/ConfirmSubmitButton";

function CategoryColumn({
  kind,
  title,
  hint,
  items,
}: {
  kind: "income" | "expense";
  title: string;
  hint: string;
  items: { id: string; name: string; fixed: boolean }[];
}) {
  return (
    <div className="card p-4">
      <div className="text-sm font-medium">{title}</div>
      <p className="text-xs text-[var(--muted)] mt-1 mb-3">{hint}</p>

      {items.length === 0 ? (
        <div className="text-xs text-[var(--muted)] py-6 text-center border border-dashed border-[var(--border)] rounded-lg mb-3">
          None yet.
        </div>
      ) : (
        <ul className="text-sm mb-3 divide-y divide-[var(--border)]">
          {items.map((c) => (
            <li key={c.id} className="flex justify-between items-center py-2 gap-2 group">
              <span className="truncate">{c.name}</span>
              <div className="flex items-center gap-2 shrink-0">
                {/* One click to flip. A toggle beats a form here because this
                    is a judgement you'll revise as you see the numbers. */}
                <form action={setCategoryFixed}>
                  <input type="hidden" name="id" value={c.id} />
                  <input type="hidden" name="fixed" value={String(!c.fixed)} />
                  <button
                    type="submit"
                    className="badge border text-[10px]"
                    style={{
                      borderColor: c.fixed ? "var(--accent)" : "var(--border)",
                      color: c.fixed ? "var(--accent)" : "var(--muted)",
                    }}
                    title={
                      c.fixed
                        ? "Fixed — arrives or leaves whether you act or not. Click to make variable."
                        : "Variable — you decide it each month. Click to make fixed."
                    }
                  >
                    {c.fixed ? "fixed" : "variable"}
                  </button>
                </form>
                <form action={deleteCategory} className="opacity-0 group-hover:opacity-100 transition-opacity">
                  <input type="hidden" name="id" value={c.id} />
                  <ConfirmSubmitButton
                    label="Remove"
                    confirmMessage={`Remove category "${c.name}"? Existing transactions keep their amount, they just lose this category.`}
                  />
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}

      <form action={createCategory} className="space-y-2">
        <input type="hidden" name="kind" value={kind} />
        <div className="flex gap-2">
          <input name="name" placeholder={`New ${kind} category`} className="input" required />
          <button type="submit" className="btn whitespace-nowrap">
            Add
          </button>
        </div>
        <label className="flex items-center gap-1.5 text-xs text-[var(--muted)]">
          <input type="checkbox" name="fixed" />
          <span>Fixed — {kind === "income" ? "arrives" : "leaves"} whether you act or not</span>
        </label>
      </form>
    </div>
  );
}

export default async function SettingsCategoriesPage() {
  const categories = await listCategories();
  const income = categories.filter((c) => c.kind === "income");
  const expense = categories.filter((c) => c.kind === "expense");

  return (
    <>
      <p className="text-xs text-[var(--muted)] max-w-2xl">
        Categories are what budgets are set against, so keeping this list short and unambiguous matters
        more than covering every case. A CSV import never creates one: a suggestion that doesn&apos;t
        match something here is left blank rather than growing a near-duplicate.
      </p>

      <p className="text-xs text-[var(--muted)] max-w-2xl">
        <span className="text-[var(--foreground)]">Fixed or variable</span> decides what counts as the
        floor under your month. Because the label sits on the category, a mixed one — a
        &quot;Transport&quot; holding both a monthly pass and the odd taxi — lands entirely on one
        side. Splitting it into two categories is the fix.
      </p>

      <div className="grid grid-cols-2 gap-6">
        <CategoryColumn
          kind="income"
          title="Income"
          hint="Money coming in — salary, freelance, dividends."
          items={income}
        />
        <CategoryColumn
          kind="expense"
          title="Expense"
          hint="Money going out. These are the ones you can set a budget on."
          items={expense}
        />
      </div>
    </>
  );
}

import { getTransaction, updateTransaction, listCategories } from "@/actions/transactions";
import { notFound, redirect } from "next/navigation";

export default async function EditTransactionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tx = await getTransaction(id);
  if (!tx) notFound();
  if (tx.type === "transfer") redirect("/transactions");

  const categories = await listCategories();
  const relevantCategories = categories.filter((c) => c.kind === (tx.type === "income" ? "income" : "expense"));

  return (
    <div className="space-y-6 max-w-md">
      <h1 className="text-lg font-semibold">Edit transaction</h1>

      <div className="card p-4">
        <form action={updateTransaction} className="space-y-3">
          <input type="hidden" name="id" value={tx.id} />
          <div className="text-xs text-[var(--muted)]">Type: {tx.type} (can&apos;t be changed here)</div>
          <select name="categoryId" defaultValue={tx.categoryId ?? ""} className="input">
            <option value="">No category</option>
            {relevantCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <input
            name="amount"
            type="number"
            step="0.01"
            defaultValue={Math.abs(Number(tx.amount))}
            className="input"
            required
          />
          <input
            name="date"
            type="date"
            defaultValue={new Date(tx.date).toISOString().slice(0, 10)}
            className="input"
            required
          />
          <input name="description" defaultValue={tx.description ?? ""} placeholder="Description" className="input" />
          <button type="submit" className="btn w-full">
            Save
          </button>
        </form>
      </div>
    </div>
  );
}

import { db } from "@/db/client";
import { interestPayments, accounts } from "@/db/schema";
import { eq, desc, gte } from "drizzle-orm";
import { createInterestPayment } from "@/actions/transactions";
import { listAccountsWithState } from "@/actions/accounts";
import { Money } from "@/components/PrivacyContext";

export default async function InterestPage() {
  const payments = await db
    .select({
      id: interestPayments.id,
      amount: interestPayments.amount,
      date: interestPayments.date,
      accountName: accounts.name,
    })
    .from(interestPayments)
    .leftJoin(accounts, eq(interestPayments.accountId, accounts.id))
    .orderBy(desc(interestPayments.date));

  const accountList = await listAccountsWithState();
  const today = new Date().toISOString().slice(0, 10);

  const yearStart = new Date(new Date().getFullYear(), 0, 1);
  const ytd = payments.filter((p) => new Date(p.date) >= yearStart).reduce((s, p) => s + Number(p.amount), 0);
  const total = payments.reduce((s, p) => s + Number(p.amount), 0);

  const byAccount = new Map<string, number>();
  for (const p of payments) {
    byAccount.set(p.accountName ?? "?", (byAccount.get(p.accountName ?? "?") ?? 0) + Number(p.amount));
  }

  return (
    <div className="space-y-8">
      <h1 className="text-lg font-semibold">Interest</h1>

      <div className="grid grid-cols-3 gap-4">
        <div className="card p-4">
          <div className="text-xs text-[var(--muted)] mb-1">This year</div>
          <div className="text-xl font-semibold">
            <Money value={ytd} />
          </div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-[var(--muted)] mb-1">All time</div>
          <div className="text-xl font-semibold">
            <Money value={total} />
          </div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-[var(--muted)] mb-1">By platform</div>
          <div className="space-y-1 text-sm">
            {[...byAccount.entries()].map(([name, amt]) => (
              <div key={name} className="flex justify-between">
                <span className="text-[var(--muted)]">{name}</span>
                <Money value={amt} />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card p-4 max-w-md">
        <div className="text-sm font-medium mb-3">Record interest payment</div>
        <form action={createInterestPayment} className="space-y-3">
          <select name="accountId" className="input" required>
            {accountList.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <input name="amount" type="number" step="0.01" placeholder="Amount" className="input" required />
          <input name="date" type="date" defaultValue={today} className="input" required />
          <button type="submit" className="btn w-full">
            Add
          </button>
        </form>
      </div>

      <div className="card p-4">
        <table className="data-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Account</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            {payments.map((p) => (
              <tr key={p.id}>
                <td>{new Date(p.date).toLocaleDateString("pt-PT")}</td>
                <td>{p.accountName}</td>
                <td>
                  <Money value={Number(p.amount)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

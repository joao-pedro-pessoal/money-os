"use client";

import { useMemo, useState } from "react";
import {
  addAccount,
  addCategory,
  addMovement,
  addTransfer,
  removeMovement,
  totalIn,
  type VaultDocument,
} from "@/lib/vault/document";
import { budgetLines, monthOf, monthReport, monthsWithMovements } from "@/lib/vault/report";

const today = () => new Date().toISOString().slice(0, 10);
const newId = () => crypto.randomUUID();
const amountOf = (value: string) => value.trim().replace(",", ".");

function Money({ value, currency }: { value: string; currency: string }) {
  const number = Number(value);
  return (
    <span>
      {new Intl.NumberFormat("pt-PT", { style: "currency", currency }).format(Number.isFinite(number) ? number : 0)}
    </span>
  );
}

/**
 * The day-to-day of a vault: what you have, what you recorded, and where the
 * month went.
 *
 * Every change is made here, on the document in the page, and handed back to be
 * sealed and stored. Nothing on this screen reaches the server in the clear —
 * which is also why the arithmetic is the vault's own (lib/vault/report), not a
 * server action.
 */
export default function VaultLedger({
  document: doc,
  onChange,
  saving,
}: {
  document: VaultDocument;
  onChange: (next: VaultDocument, what: string) => void;
  saving: string | null;
}) {
  const [error, setError] = useState<string | null>(null);
  const months = useMemo(() => {
    const list = monthsWithMovements(doc);
    const now = monthOf(today());
    return list.includes(now) ? list : [now, ...list];
  }, [doc]);
  const [month, setMonth] = useState(months[0]);
  const report = useMemo(() => monthReport(doc, months.includes(month) ? month : months[0]), [doc, month, months]);
  const budgets = useMemo(() => budgetLines(doc, months.includes(month) ? month : months[0]), [doc, month, months]);
  const base = doc.baseCurrency;
  const totals = totalIn(doc, base);

  const change = (make: () => VaultDocument, what: string) => {
    try {
      setError(null);
      onChange(make(), what);
    } catch (e) {
      setError(e instanceof Error ? e.message : "That could not be recorded.");
    }
  };

  return (
    <div className="space-y-6">
      {error && (
        <p role="alert" className="card p-3 text-sm text-[var(--red)]">
          {error}
        </p>
      )}

      <section className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="card p-4">
          <div className="text-xs text-[var(--muted)]">What you have</div>
          <div className="text-2xl font-semibold mt-1">
            <Money value={totals.total} currency={base} />
          </div>
          {totals.leftOut.length > 0 && (
            <div className="text-[11px] text-[var(--muted)] mt-1">
              Accounts in {totals.leftOut.join(", ")} are left out: adding them would need an exchange rate.
            </div>
          )}
        </div>
        <div className="card p-4">
          <div className="text-xs text-[var(--muted)]">In this month</div>
          <div className="text-2xl font-semibold mt-1 text-[var(--green)]">
            <Money value={report.income} currency={base} />
          </div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-[var(--muted)]">Out this month</div>
          <div className="text-2xl font-semibold mt-1 text-[var(--red)]">
            <Money value={report.spent} currency={base} />
          </div>
          <div className="text-[11px] text-[var(--muted)] mt-1">
            Left: <Money value={report.net} currency={base} />
            {Number(report.transferred) > 0 && (
              <>
                {" · "}
                <Money value={report.transferred} currency={base} /> moved between your accounts, which is not spending
              </>
            )}
          </div>
        </div>
      </section>

      <section className="card p-4 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="text-sm font-medium">Where the month went</div>
          <label className="text-xs">
            Month{" "}
            <select className="input mt-1" value={month} onChange={(e) => setMonth(e.target.value)}>
              {months.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
        </div>
        {report.byCategory.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">Nothing recorded in this month yet.</p>
        ) : (
          <div className="space-y-2">
            {report.byCategory.map((line) => (
              <div key={line.name}>
                <div className="flex justify-between text-sm">
                  <span className={line.name === "Uncategorised" ? "text-[var(--muted)]" : undefined}>{line.name}</span>
                  <span className="text-[var(--muted)]">
                    <Money value={line.amount} currency={base} /> · {line.percent.toFixed(0)}%
                  </span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-[var(--surface-2)] overflow-hidden mt-1">
                  <div
                    className="h-full"
                    style={{
                      width: `${Math.min(100, line.percent)}%`,
                      background: line.name === "Uncategorised" ? "var(--muted)" : "var(--accent)",
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
        {budgets.length > 0 && (
          <div className="pt-2 space-y-1">
            <div className="text-sm font-medium">Budgets</div>
            {budgets.map((b) => (
              <div key={b.categoryId + b.limit} className="flex justify-between text-xs">
                <span>
                  {b.name} <span className="text-[var(--muted)]">({b.period})</span>
                </span>
                <span
                  style={{
                    color: b.status === "over" ? "var(--red)" : b.status === "close" ? "var(--amber)" : "var(--muted)",
                  }}
                >
                  <Money value={b.spent} currency={base} /> of <Money value={b.limit} currency={base} /> ·{" "}
                  {b.percent.toFixed(0)}%
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Accounts doc={doc} onChange={change} saving={saving} />
        <Record doc={doc} onChange={change} />
      </section>

      <Movements doc={doc} onChange={change} />
    </div>
  );
}

function Accounts({
  doc,
  onChange,
  saving,
}: {
  doc: VaultDocument;
  onChange: (make: () => VaultDocument, what: string) => void;
  saving: string | null;
}) {
  const [name, setName] = useState("");
  const [balance, setBalance] = useState("");
  const [currency, setCurrency] = useState(doc.baseCurrency);
  const [kind, setKind] = useState<"bank" | "cash" | "broker" | "exchange" | "other">("bank");

  return (
    <div className="card p-4 space-y-3">
      <div className="text-sm font-medium">Your accounts {saving && <span className="text-xs text-[var(--muted)]">· {saving}</span>}</div>
      {doc.accounts.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">None yet. Add the account you use every day.</p>
      ) : (
        <ul className="space-y-1">
          {doc.accounts.map((a) => (
            <li key={a.id} className="flex justify-between text-sm">
              <span>
                {a.name} <span className="text-[var(--muted)] text-xs">{a.kind}</span>
              </span>
              <Money value={a.balance} currency={a.currency} />
            </li>
          ))}
        </ul>
      )}
      <div className="grid grid-cols-2 gap-2">
        <input className="input" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <input
          className="input"
          inputMode="decimal"
          placeholder="Balance today"
          value={balance}
          onChange={(e) => setBalance(e.target.value)}
        />
        <select className="input" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
          {(["bank", "cash", "broker", "exchange", "other"] as const).map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
        <input
          className="input"
          placeholder="Currency"
          value={currency}
          onChange={(e) => setCurrency(e.target.value.toUpperCase())}
        />
      </div>
      <button
        type="button"
        className="btn"
        onClick={() => {
          onChange(
            () =>
              addAccount(doc, {
                id: newId(),
                name: name.trim(),
                kind,
                currency: currency.trim().toUpperCase(),
                balance: amountOf(balance || "0"),
                createdAt: today(),
              }),
            "account added"
          );
          setName("");
          setBalance("");
        }}
      >
        Add account
      </button>
    </div>
  );
}

function Record({ doc, onChange }: { doc: VaultDocument; onChange: (make: () => VaultDocument, what: string) => void }) {
  const [type, setType] = useState<"expense" | "income" | "transfer">("expense");
  const [accountId, setAccountId] = useState("");
  const [toId, setToId] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(today());
  const [categoryId, setCategoryId] = useState("");
  const [description, setDescription] = useState("");
  const [newCategory, setNewCategory] = useState("");

  const account = doc.accounts.find((a) => a.id === accountId) ?? doc.accounts[0];
  const categories = doc.categories.filter((c) => c.kind === (type === "income" ? "income" : "expense"));

  return (
    <div className="card p-4 space-y-3">
      <div className="text-sm font-medium">Record something</div>
      {doc.accounts.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">Add an account first.</p>
      ) : (
        <>
          <div className="flex gap-2">
            {(["expense", "income", "transfer"] as const).map((t) => (
              <button
                key={t}
                type="button"
                className="btn"
                aria-pressed={type === t}
                style={{
                  background: "var(--surface)",
                  border: `1px solid ${type === t ? "var(--accent)" : "var(--border)"}`,
                  color: type === t ? "var(--accent)" : "var(--muted)",
                }}
                onClick={() => setType(t)}
              >
                {t}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <select className="input" value={account?.id ?? ""} onChange={(e) => setAccountId(e.target.value)}>
              {doc.accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {type === "transfer" ? `From ${a.name}` : a.name}
                </option>
              ))}
            </select>
            {type === "transfer" ? (
              <select className="input" value={toId} onChange={(e) => setToId(e.target.value)}>
                <option value="">To…</option>
                {doc.accounts
                  .filter((a) => a.id !== account?.id)
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      To {a.name}
                    </option>
                  ))}
              </select>
            ) : (
              <select className="input" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                <option value="">Category — none</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}
            <input
              className="input"
              inputMode="decimal"
              placeholder={`Amount (${account?.currency ?? doc.baseCurrency})`}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <input
            className="input w-full"
            placeholder={type === "expense" ? "Where (optional)" : "What (optional)"}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <button
            type="button"
            className="btn"
            onClick={() => {
              onChange(() => {
                if (type === "transfer") {
                  return addTransfer(doc, {
                    fromId: account!.id,
                    toId,
                    amount: amountOf(amount),
                    date,
                    description: description.trim() || undefined,
                    outId: newId(),
                    inId: newId(),
                  });
                }
                return addMovement(doc, {
                  id: newId(),
                  accountId: account!.id,
                  type,
                  amount: amountOf(amount),
                  currency: account!.currency,
                  date,
                  categoryId: categoryId || null,
                  merchant: type === "expense" ? description.trim() || null : null,
                  description: description.trim(),
                  transferId: null,
                  transferOut: null,
                });
              }, "recorded");
              setAmount("");
              setDescription("");
            }}
          >
            Record
          </button>

          <div className="pt-2 border-t border-[var(--border)] space-y-2">
            <div className="text-xs text-[var(--muted)]">
              Categories are what turns a list of movements into a month you can read.
            </div>
            <div className="flex gap-2">
              <input
                className="input"
                placeholder="New category"
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
              />
              <button
                type="button"
                className="btn whitespace-nowrap"
                onClick={() => {
                  onChange(
                    () =>
                      addCategory(doc, {
                        id: newId(),
                        name: newCategory.trim(),
                        kind: type === "income" ? "income" : "expense",
                      }),
                    "category added"
                  );
                  setNewCategory("");
                }}
              >
                Add {type === "income" ? "income" : "expense"} category
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Movements({ doc, onChange }: { doc: VaultDocument; onChange: (make: () => VaultDocument, what: string) => void }) {
  const rows = [...doc.movements].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 50);
  const accountName = new Map(doc.accounts.map((a) => [a.id, a.name]));
  const categoryName = new Map(doc.categories.map((c) => [c.id, c.name]));
  if (rows.length === 0) return null;

  return (
    <section className="card p-4 space-y-2">
      <div className="text-sm font-medium">What you recorded</div>
      <ul className="divide-y divide-[var(--border)]">
        {rows.map((m) => (
          <li key={m.id} className="py-2 flex items-center justify-between gap-3 text-sm">
            <div className="min-w-0">
              <div className="truncate">
                {m.description || categoryName.get(m.categoryId ?? "") || m.type}
                {m.type === "transfer" && <span className="text-[var(--muted)]"> · transfer</span>}
              </div>
              <div className="text-[11px] text-[var(--muted)]">
                {m.date} · {accountName.get(m.accountId) ?? "—"}
                {m.categoryId && ` · ${categoryName.get(m.categoryId) ?? ""}`}
              </div>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <span
                style={{
                  color:
                    m.type === "income" ? "var(--green)" : m.type === "expense" ? "var(--red)" : "var(--muted)",
                }}
              >
                {m.type === "income" ? "+" : m.type === "expense" ? "−" : ""}
                <Money value={m.amount} currency={m.currency} />
              </span>
              <button
                type="button"
                className="text-xs text-[var(--muted)] hover:underline"
                onClick={() => onChange(() => removeMovement(doc, m.id), "removed")}
              >
                Remove
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

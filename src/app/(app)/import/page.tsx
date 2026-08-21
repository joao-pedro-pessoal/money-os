import { listCategories } from "@/actions/transactions";
import { listAccountsWithState } from "@/actions/accounts";
import { getBaseCurrency } from "@/actions/settings";
import { listImports, undoImport } from "@/actions/imports";
import StatementPrompt from "@/components/StatementPrompt";
import CsvImportForm from "@/components/CsvImportForm";
import ConfirmSubmitButton from "@/components/ConfirmSubmitButton";
import Section from "@/components/Section";
import BrokerStatementForm from "@/components/BrokerStatementForm";
import { importBrokerStatement, getImportedStatements } from "@/actions/brokerImport";

function Step({
  n,
  title,
  subtitle,
  children,
}: {
  n: number;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex gap-4">
      <div className="shrink-0 flex flex-col items-center">
        <div
          className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold"
          style={{ background: "var(--accent)", color: "var(--accent-contrast)" }}
        >
          {n}
        </div>
        {/* The line makes the three steps read as one sequence rather than
            three unrelated cards. */}
        <div className="w-px flex-1 mt-2" style={{ background: "var(--border)" }} />
      </div>
      <div className="flex-1 pb-8 min-w-0">
        <h2 className="text-sm font-semibold">{title}</h2>
        {subtitle && <p className="text-xs text-[var(--muted)] mt-1 max-w-2xl">{subtitle}</p>}
        <div className="mt-3">{children}</div>
      </div>
    </section>
  );
}

/** A form action may not return a value, so the result is dropped here. */
async function importStatementAction(formData: FormData) {
  "use server";
  await importBrokerStatement(formData);
}

export default async function ImportPage() {
  const [categories, accounts, baseCurrency, importHistory, imported] = await Promise.all([
    listCategories(),
    listAccountsWithState(),
    getBaseCurrency(),
    listImports(),
    getImportedStatements(),
  ]);

  return (
    <div className="space-y-2 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-lg font-semibold">Import a statement</h1>
        <p className="text-xs text-[var(--muted)] mt-1 max-w-2xl">
          Every bank writes a different file, and reading them directly needs an Open Banking licence.
          So instead of chasing formats, the app states one format and hands you an instruction that
          converts anything into it — your bank&apos;s CSV, text copied out of a PDF, even a table off
          the screen.
        </p>
      </div>

      {/* A broker export is a different animal: it has trades, dividends,
          interest and — crucially — deposits, which the bank importer would
          flatten into anonymous income. It gets its own path. */}
      <Section
        title="Investment account? Import the broker statement instead"
        summary="trades, dividends, interest and deposits"
      >
        <p className="text-xs text-[var(--muted)] mb-3 max-w-2xl">
          The steps below are for a bank statement, where every row is money in or out. A broker
          export also says what you bought, what was paid to you, and how much you deposited — and
          that last one is what makes it possible to tell a gain from a top-up. Nothing here is
          flattened into &quot;income&quot;.
        </p>
        <BrokerStatementForm
          action={importStatementAction}
          accounts={accounts.map((a) => ({
            id: a.id,
            name: a.name,
            institution: a.institution,
          }))}
        />

        {/* Proof of what landed where.
            "I imported it and nothing happened" was impossible to diagnose from
            a screen that showed only a result — and the commonest cause is a
            broker export sent through the bank importer below, which stores
            transactions and no instruments at all. */}
        {imported.length > 0 ? (
          <div className="mt-4 pt-4 border-t border-[var(--border)]">
            <div className="text-xs font-medium mb-2">Statements already imported</div>
            <table className="w-full text-xs">
              <tbody>
                {imported.map((s) => (
                  <tr key={s.accountId} className="border-t border-[var(--border)] first:border-0">
                    <td className="py-1.5">{s.accountName}</td>
                    <td className="py-1.5 text-[var(--muted)]">
                      {s.from} → {s.to}
                    </td>
                    <td className="py-1.5 text-right tabular-nums">{s.rows} rows</td>
                    <td className="py-1.5 text-right tabular-nums">
                      {s.instruments === 0 ? (
                        <span style={{ color: "var(--amber)" }}>no instruments</span>
                      ) : (
                        `${s.instruments} instrument${s.instruments === 1 ? "" : "s"}`
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-[10px] text-[var(--muted)] mt-2 leading-snug">
              An account missing from this list has no broker statement, whatever else was imported
              for it. A statement with no instruments has no positions to rebuild — usually a cash
              or card export rather than the transaction one.
            </p>
          </div>
        ) : (
          <p className="text-[10px] text-[var(--muted)] mt-3">
            No broker statement has been imported yet.
          </p>
        )}
      </Section>

      <Step
        n={1}
        title="Copy the instruction"
        subtitle="It already knows your categories and your currency, so you don't have to explain anything."
      >
        <StatementPrompt
          categories={categories.map((c) => c.name)}
          currency={baseCurrency}
          defaultOpen
        />
      </Step>

      <Step
        n={2}
        title="Paste it into any AI, along with your statement"
        subtitle="Then save the answer as a .csv file. If it came wrapped in ``` fences, delete those two lines."
      >
        <div className="card p-4 text-xs text-[var(--muted)] space-y-2">
          <p>
            Nothing is sent anywhere by this app — you do the copying. But it is still your bank data
            going to a third party, so decide that deliberately.{" "}
            <span className="text-[var(--amber)]">Removing account numbers first costs nothing.</span>
          </p>
          <p>
            If you&apos;d rather not, skip this step entirely: upload your bank&apos;s own CSV below and
            map the columns by hand.
          </p>
        </div>
      </Step>

      <Step
        n={3}
        title="Upload it"
        subtitle="You'll see every row and what will happen to it before anything is written."
      >
        <div className="card p-4">
          <CsvImportForm accounts={accounts.map((a) => ({ id: a.id, name: a.name }))} />
        </div>
      </Step>

      {importHistory.length > 0 && (
        <div className="card p-4 ml-11">
          <div className="text-sm font-medium mb-1">Past imports</div>
          <p className="text-xs text-[var(--muted)] mb-3">
            Undo removes every transaction that came from that file. This is why the import is recorded
            at all — a bad mapping shouldn&apos;t mean deleting rows by hand.
          </p>
          <div className="overflow-x-auto">
            <table className="data-table whitespace-nowrap text-xs">
              <thead>
                <tr>
                  <th>When</th>
                  <th>File</th>
                  <th>Account</th>
                  <th className="text-right">Rows</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {importHistory.map((i) => (
                  <tr key={i.id}>
                    <td>{new Date(i.createdAt).toLocaleString("pt-PT")}</td>
                    <td className="max-w-[14rem] truncate">{i.fileName}</td>
                    <td>{i.accountName}</td>
                    <td className="text-right">{i.rowsImported}</td>
                    <td className="text-right">
                      <form action={undoImport}>
                        <input type="hidden" name="importId" value={i.id} />
                        <ConfirmSubmitButton
                          label="Undo"
                          confirmMessage={`Remove the ${i.rowsImported} transactions imported from "${i.fileName}"?`}
                        />
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

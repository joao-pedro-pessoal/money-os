import "dotenv/config";
import { db } from "../src/db/client";
import { accounts, transactions, interestPayments, buckets, bucketAllocations } from "../src/db/schema";
import { createAccount, updateAccountBalance, listAccountsWithState, archiveAccount, unarchiveAccount, listArchivedAccounts, updateAccount } from "../src/actions/accounts";
import { createBucket, updateBucket, deleteBucket, setAllocation, listBucketsWithTotals } from "../src/actions/buckets";
import { createTransaction, createTransfer, deleteTransaction, updateTransaction, listTransactions } from "../src/actions/transactions";
import { eq } from "drizzle-orm";

function assert(cond: boolean, msg: string) {
  console.log(cond ? "PASS" : "FAIL", "-", msg);
  if (!cond) process.exitCode = 1;
}

async function main() {
  // 1. Create account
  const fd1 = new FormData();
  fd1.set("institution", "Trade Republic");
  fd1.set("name", "TR Cash");
  fd1.set("accountType", "broker");
  fd1.set("currency", "EUR");
  fd1.set("balance", "1000");
  await createAccount(fd1);

  let accs = await listAccountsWithState();
  const acc = accs.find((a) => a.name === "TR Cash")!;
  assert(acc.balance === 1000, "account created with balance 1000");

  // 2. Reconciliation: interest +50
  const fd2 = new FormData();
  fd2.set("accountId", acc.id);
  fd2.set("newBalance", "1050");
  fd2.set("classification", "interest");
  await updateAccountBalance(fd2);

  accs = await listAccountsWithState();
  const accAfterInterest = accs.find((a) => a.id === acc.id)!;
  assert(accAfterInterest.balance === 1050, "balance updated to 1050 after interest reconciliation");

  const ip = await db.select().from(interestPayments).where(eq(interestPayments.accountId, acc.id));
  assert(ip.length === 1 && Number(ip[0].amount) === 50, "InterestPayment of 50 created");

  const txsAfterInterest = await db.select().from(transactions).where(eq(transactions.accountId, acc.id));
  assert(txsAfterInterest.some((t) => t.type === "income" && Number(t.amount) === 50), "income transaction of +50 created for interest");

  // 3. Reconciliation: expense -50 (back to 1000)
  const fd3 = new FormData();
  fd3.set("accountId", acc.id);
  fd3.set("newBalance", "1000");
  fd3.set("classification", "expense");
  await updateAccountBalance(fd3);

  accs = await listAccountsWithState();
  assert(accs.find((a) => a.id === acc.id)!.balance === 1000, "balance back to 1000 after expense reconciliation");
  const txsAfterExpense = await db.select().from(transactions).where(eq(transactions.accountId, acc.id));
  assert(txsAfterExpense.some((t) => t.type === "expense" && Number(t.amount) === -50), "expense transaction of -50 created");

  // 4. Reconciliation: correction -100 (no transaction should be created)
  const txCountBefore = txsAfterExpense.length;
  const fd4 = new FormData();
  fd4.set("accountId", acc.id);
  fd4.set("newBalance", "900");
  fd4.set("classification", "correction");
  await updateAccountBalance(fd4);

  accs = await listAccountsWithState();
  assert(accs.find((a) => a.id === acc.id)!.balance === 900, "balance corrected to 900");
  const txsAfterCorrection = await db.select().from(transactions).where(eq(transactions.accountId, acc.id));
  assert(txsAfterCorrection.length === txCountBefore, "correction created NO new transaction (silent balance fix)");

  // 5. updateAccount edits descriptive fields
  const fd5 = new FormData();
  fd5.set("id", acc.id);
  fd5.set("institution", "Trade Republic");
  fd5.set("name", "TR Cash Renamed");
  fd5.set("accountType", "broker");
  fd5.set("currency", "EUR");
  fd5.set("notes", "test note");
  await updateAccount(fd5);
  accs = await listAccountsWithState();
  assert(accs.find((a) => a.id === acc.id)!.name === "TR Cash Renamed", "account name updated via updateAccount");

  // 6. archive / unarchive
  const fd6 = new FormData();
  fd6.set("id", acc.id);
  await archiveAccount(fd6);
  accs = await listAccountsWithState();
  assert(!accs.some((a) => a.id === acc.id), "archived account no longer in active list");
  const archived = await listArchivedAccounts();
  assert(archived.some((a) => a.id === acc.id), "archived account appears in archived list");

  const fd7 = new FormData();
  fd7.set("id", acc.id);
  await unarchiveAccount(fd7);
  accs = await listAccountsWithState();
  assert(accs.some((a) => a.id === acc.id), "unarchived account back in active list");

  // 7. Create a second account + transfer, then delete transfer and check balances reversed
  const fd8 = new FormData();
  fd8.set("institution", "Millennium");
  fd8.set("name", "MB Conta");
  fd8.set("accountType", "bank");
  fd8.set("currency", "EUR");
  fd8.set("balance", "500");
  await createAccount(fd8);
  accs = await listAccountsWithState();
  const acc2 = accs.find((a) => a.name === "MB Conta")!;

  const fdT = new FormData();
  fdT.set("fromAccountId", acc.id);
  fdT.set("toAccountId", acc2.id);
  fdT.set("amount", "200");
  fdT.set("date", new Date().toISOString().slice(0, 10));
  fdT.set("description", "test transfer");
  await createTransfer(fdT);

  accs = await listAccountsWithState();
  assert(accs.find((a) => a.id === acc.id)!.balance === 700, "source account balance -200 after transfer (900->700)");
  assert(accs.find((a) => a.id === acc2.id)!.balance === 700, "dest account balance +200 after transfer (500->700)");

  const allTxs = await listTransactions(50);
  const transferTx = allTxs.find((t) => t.type === "transfer" && t.accountName === "TR Cash Renamed")!;

  const fdDel = new FormData();
  fdDel.set("id", transferTx.id);
  await deleteTransaction(fdDel);

  accs = await listAccountsWithState();
  assert(accs.find((a) => a.id === acc.id)!.balance === 900, "source account balance reversed to 900 after deleting transfer");
  assert(accs.find((a) => a.id === acc2.id)!.balance === 500, "dest account balance reversed to 500 after deleting transfer");

  // 8. Create income transaction, edit it, then delete it, verify balance each step
  const fdInc = new FormData();
  fdInc.set("accountId", acc2.id);
  fdInc.set("type", "income");
  fdInc.set("amount", "100");
  fdInc.set("date", new Date().toISOString().slice(0, 10));
  fdInc.set("description", "test income");
  await createTransaction(fdInc);
  accs = await listAccountsWithState();
  assert(accs.find((a) => a.id === acc2.id)!.balance === 600, "balance +100 after income transaction (500->600)");

  const txsAcc2 = await listTransactions(50);
  const incomeTx = txsAcc2.find((t) => t.accountName === "MB Conta" && t.type === "income")!;

  const fdEdit = new FormData();
  fdEdit.set("id", incomeTx.id);
  fdEdit.set("amount", "150");
  fdEdit.set("date", new Date().toISOString().slice(0, 10));
  fdEdit.set("description", "test income edited");
  await updateTransaction(fdEdit);
  accs = await listAccountsWithState();
  assert(accs.find((a) => a.id === acc2.id)!.balance === 650, "balance adjusted to 650 after editing income 100->150");

  const fdDelInc = new FormData();
  fdDelInc.set("id", incomeTx.id);
  await deleteTransaction(fdDelInc);
  accs = await listAccountsWithState();
  assert(accs.find((a) => a.id === acc2.id)!.balance === 500, "balance reversed to 500 after deleting edited income transaction");

  // 9. Bucket create/edit/allocate/delete
  const fdB = new FormData();
  fdB.set("name", "Emergency Fund");
  await createBucket(fdB);
  let bks = await listBucketsWithTotals();
  const bucket = bks.find((b) => b.name === "Emergency Fund")!;

  const fdAlloc = new FormData();
  fdAlloc.set("accountId", acc2.id);
  fdAlloc.set("bucketId", bucket.id);
  fdAlloc.set("amount", "300");
  await setAllocation(fdAlloc);
  bks = await listBucketsWithTotals();
  assert(bks.find((b) => b.id === bucket.id)!.total === 300, "bucket total 300 after allocation");

  // allocation amount=0 removes it
  const fdAlloc0 = new FormData();
  fdAlloc0.set("accountId", acc2.id);
  fdAlloc0.set("bucketId", bucket.id);
  fdAlloc0.set("amount", "0");
  await setAllocation(fdAlloc0);
  bks = await listBucketsWithTotals();
  assert(bks.find((b) => b.id === bucket.id)!.total === 0, "allocation removed when amount set to 0");

  const fdBDel = new FormData();
  fdBDel.set("id", bucket.id);
  await deleteBucket(fdBDel);
  bks = await listBucketsWithTotals();
  assert(!bks.some((b) => b.id === bucket.id), "bucket deleted");

  console.log("\nDone.");
  process.exit(process.exitCode ?? 0);
}

main().catch((e) => { console.error(e); process.exit(1); });

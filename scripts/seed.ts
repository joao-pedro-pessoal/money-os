import "dotenv/config";
import { db } from "../src/db/client";
import { categories } from "../src/db/schema";

const INCOME = ["Salary", "Freelance", "Business", "Sale", "Interest", "Dividend", "Cashback", "Refund", "Gift", "Other Income"];
const EXPENSE = ["Food", "Restaurants", "Transport", "Fuel", "Subscriptions", "Shopping", "Travel", "Education", "Health", "Entertainment", "Taxes", "Fees", "Long-Term Investment Contribution", "Other"];

async function main() {
  for (const name of INCOME) {
    await db.insert(categories).values({ name, kind: "income" }).onConflictDoNothing();
  }
  for (const name of EXPENSE) {
    await db.insert(categories).values({ name, kind: "expense" }).onConflictDoNothing();
  }
  console.log(`Seeded ${INCOME.length + EXPENSE.length} categories.`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });

import "dotenv/config";
import { db } from "../src/db/client";
import { categories } from "../src/db/schema";
import { DEFAULT_EXPENSE_CATEGORIES as EXPENSE, DEFAULT_INCOME_CATEGORIES as INCOME } from "../src/db/defaultCategories";

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

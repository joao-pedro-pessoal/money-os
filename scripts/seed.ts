import "dotenv/config";
import { asUser, db } from "../src/db/client";
import { categories, OWNER_USER_ID } from "../src/db/schema";
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

// As one account: the owner's, or AS_USER's. Each person's rows are theirs alone (src/db/client.ts).
asUser(process.env.AS_USER ?? OWNER_USER_ID, main)
  .then(() => process.exit(0))
  .catch((e) => { console.error(e); process.exit(1); });

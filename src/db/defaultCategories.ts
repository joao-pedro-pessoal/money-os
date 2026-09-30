/**
 * The categories a new installation starts with, used by `npm run db:seed` and
 * by `npm run new-person` for each person's own copy. One list, so the two
 * cannot drift apart.
 */
export const DEFAULT_INCOME_CATEGORIES = [
  "Salary", "Freelance", "Business", "Sale", "Interest", "Dividend", "Cashback", "Refund", "Gift", "Other Income",
];

export const DEFAULT_EXPENSE_CATEGORIES = [
  "Food", "Restaurants", "Transport", "Fuel", "Subscriptions", "Shopping", "Travel", "Education", "Health",
  "Entertainment", "Taxes", "Fees", "Long-Term Investment Contribution", "Other",
];

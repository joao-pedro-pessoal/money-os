import { sqliteTable, integer, text } from 'drizzle-orm/sqlite-core';
// One versioned document is a deliberate transactional boundary: restore can
// never leave half of the personal ledger replaced. Split into indexed tables
// only with a measured need, preserving this atomic repository contract.
export const vaultState = sqliteTable('vault_state', {
  id: integer('id').primaryKey(),
  payload: text('payload').notNull(),
});

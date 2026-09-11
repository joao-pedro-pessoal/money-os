import { sqliteTable, integer, text } from 'drizzle-orm/sqlite-core';
// One versioned document is a deliberate transactional boundary: restore can
// never leave half of the personal ledger replaced. Split into indexed tables
// only with a measured need, preserving this atomic repository contract.
export const vaultState = sqliteTable('vault_state', {
  id: integer('id').primaryKey(),
  payload: text('payload').notNull(),
});
/**
 * The vault as it stood at the last sync, and that version's number.
 *
 * A second row rather than a field inside the vault: the vault is validated
 * strictly and would otherwise carry a copy of itself. Written in the same
 * transaction as `vault_state` whenever a sync is applied, because a crash between
 * the two would leave a base that no longer matches the state, and the next merge
 * would read the difference as edits nobody made.
 */
export const syncBase = sqliteTable('sync_base', {
  id: integer('id').primaryKey(),
  version: integer('version').notNull(),
  payload: text('payload').notNull(),
});

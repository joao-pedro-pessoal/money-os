// Generated from Drizzle SQL. Run npm run db:generate; never edit by hand.
export const migrations: readonly string[] = [
  "CREATE TABLE `vault_state` (\n\t`id` integer PRIMARY KEY NOT NULL,\n\t`payload` text NOT NULL\n);\n",
  "CREATE TABLE `sync_base` (\n\t`id` integer PRIMARY KEY NOT NULL,\n\t`version` integer NOT NULL,\n\t`payload` text NOT NULL\n);\n"
];

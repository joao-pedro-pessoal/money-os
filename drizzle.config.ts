import type { Config } from "drizzle-kit";

export default {
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    // The owner's login: the app's own may read and write rows, not change tables.
    url: (process.env.DATABASE_ADMIN_URL ?? process.env.DATABASE_URL)!,
  },
} satisfies Config;

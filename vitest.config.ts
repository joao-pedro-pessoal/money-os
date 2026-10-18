import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
    // Several tests read every source file (15 languages of catalogs) or run the
    // real password hash; on a busy machine 5 s was not enough and a different
    // one timed out each run. A real hang still fails, just later.
    testTimeout: 15_000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});

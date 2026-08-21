import { defineConfig } from "drizzle-kit";

// Only used to *generate* SQL migration files (`drizzle-kit generate`).
// Applying them is done via `wrangler d1 migrations apply`, which reads the
// same `drizzle/migrations` directory declared in wrangler.jsonc — this
// config never opens a DB connection itself, so no D1 credentials are needed
// here, not even for local development.
export default defineConfig({
  dialect: "sqlite",
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle/migrations",
});

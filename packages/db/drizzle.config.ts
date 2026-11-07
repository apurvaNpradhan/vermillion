import { defineConfig } from "drizzle-kit";

// Tables live next to the code that owns them: each vertical in the API has a
// `tables.ts`. Better Auth's generated tables live in `src/schema`.
export default defineConfig({
  schema: ["./src/schema/index.ts", "../api/src/*/tables.ts", "../api/src/platform/sync/tables.ts"],
  out: "./src/migrations",
  dialect: "postgresql",
  schemaFilter: ["public"],
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
});

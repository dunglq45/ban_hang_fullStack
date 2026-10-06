import { defineConfig } from "drizzle-kit";

// Chỉ dùng để sinh SQL migration; áp dụng migration bằng `wrangler d1 migrations apply`.
export default defineConfig({
  dialect: "sqlite",
  schema: "./src/worker/db/schema.ts",
  out: "./migrations",
});

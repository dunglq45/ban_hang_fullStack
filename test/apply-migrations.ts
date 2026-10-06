import { applyD1Migrations, env } from "cloudflare:test";

// Chạy ngoài storage cô lập của từng test, nên migration chỉ áp dụng một lần.
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);

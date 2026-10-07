// Chuẩn bị D1 local riêng cho E2E (`.wrangler/e2e`): xóa thư mục cũ, áp dụng migration, nạp seed.
// Chạy trong lệnh webServer của Playwright, TRƯỚC khi Vite khởi động (tránh khóa file SQLite).
import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
import { resolve } from "node:path";

const stateDir = resolve(process.env.WRANGLER_STATE_DIR ?? ".wrangler/e2e");
const env = { ...process.env, WRANGLER_STATE_DIR: stateDir };

rmSync(stateDir, { recursive: true, force: true });

function run(command: string) {
  const result = spawnSync(command, { stdio: "inherit", shell: true, env });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run(
  `pnpm exec wrangler d1 migrations apply store-app-db --local -c wrangler.jsonc --persist-to="${stateDir}"`,
);
run("pnpm exec tsx scripts/seed.ts");

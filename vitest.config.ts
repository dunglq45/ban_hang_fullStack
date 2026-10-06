import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        // Test API chạy trong workerd, có D1/R2 local (mỗi test có storage riêng).
        plugins: [
          cloudflareTest(async () => ({
            wrangler: { configPath: "./wrangler.jsonc" },
            miniflare: {
              bindings: {
                TEST_MIGRATIONS: await readD1Migrations("./migrations"),
              },
            },
          })),
        ],
        test: {
          name: "worker",
          include: ["test/**/*.test.ts"],
          setupFiles: ["./test/apply-migrations.ts"],
        },
      },
      {
        // Test giao diện React trong jsdom.
        plugins: [react()],
        test: {
          name: "web",
          environment: "jsdom",
          include: ["src/react-app/**/*.test.{ts,tsx}"],
          setupFiles: ["./src/react-app/test/setup.ts"],
        },
      },
    ],
  },
});

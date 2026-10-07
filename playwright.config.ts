import { defineConfig, devices } from "@playwright/test";

// E2E chạy trên server dev riêng (cổng 5180) với D1 local riêng `.wrangler/e2e`, nạp lại seed
// "Tạp hóa Minh Anh" mỗi lần chạy. Dùng Chrome cài sẵn trên máy (channel "chrome").
const PORT = 5180;
const STATE_DIR = ".wrangler/e2e";

export default defineConfig({
  testDir: "./e2e",
  // Các kịch bản dùng chung một cửa hàng seed và bộ đếm mã chứng từ: chạy tuần tự.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    locale: "vi-VN",
    timezoneId: "Asia/Ho_Chi_Minh",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chrome", use: { ...devices["Desktop Chrome"], channel: "chrome" } }],
  webServer: {
    command: `pnpm exec tsx e2e/prepare-db.ts && pnpm exec vite dev --port ${PORT} --host 127.0.0.1 --strictPort`,
    url: `http://127.0.0.1:${PORT}/api/health`,
    env: { WRANGLER_STATE_DIR: STATE_DIR },
    reuseExistingServer: false,
    timeout: 180_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});

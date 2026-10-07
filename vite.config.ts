import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// WRANGLER_STATE_DIR: thư mục lưu D1/R2 local thay cho `.wrangler/state` (E2E dùng `.wrangler/e2e`
// để không đụng dữ liệu của `pnpm dev`).
const stateDir = process.env.WRANGLER_STATE_DIR;

export default defineConfig(({ mode }) => {
  // `vite build --mode preview` (pnpm build:preview) build cho môi trường "preview" của
  // wrangler.jsonc. Đặt qua mode thay vì biến môi trường để lệnh chạy được cả trên Windows.
  if (mode === "preview") process.env.CLOUDFLARE_ENV ??= "preview";
  return {
    plugins: [
      react(),
      tailwindcss(),
      cloudflare({ persistState: stateDir ? { path: stateDir } : true }),
    ],
  };
});

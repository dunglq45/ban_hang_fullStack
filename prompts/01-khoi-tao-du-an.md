# Prompt 01 – Khởi tạo dự án

Đọc kỹ `CLAUDE.md`, `docs/ARCHITECTURE.md`, `docs/DATABASE.md`, `docs/API.md`. Chưa viết code nghiệp vụ ở bước này.

Nhiệm vụ: dựng khung dự án full-stack trên Cloudflare theo `docs/ARCHITECTURE.md`.

Yêu cầu:
1. Kiểm tra docs Cloudflare hiện hành, rồi tạo dự án React + Vite + Worker dùng `@cloudflare/vite-plugin` (một Worker phục vụ `/api/*` bằng Hono và static assets của SPA, có SPA fallback). Dùng pnpm, TypeScript strict.
2. Tạo cấu trúc thư mục đúng như tài liệu (`src/shared`, `src/worker`, `src/react-app`, `test`, `migrations`).
3. `wrangler.jsonc`: binding D1 tên `DB` (database `store-app-db`), R2 tên `IMAGES`, `compatibility_date` mới nhất, bật `nodejs_compat` nếu thư viện cần. Hướng dẫn tôi chạy lệnh `wrangler d1 create` và `wrangler r2 bucket create` (đừng tự chạy lệnh cần đăng nhập tài khoản).
4. Cài: hono, drizzle-orm, drizzle-kit, zod, @tanstack/react-query, react-router, react-hook-form, @hookform/resolvers, tailwindcss, vitest, @cloudflare/vitest-pool-workers, @testing-library/react, eslint, prettier. Chọn phiên bản ổn định mới nhất, tương thích nhau.
5. Tailwind: khai báo design tokens trong `CLAUDE.md` (màu, bo góc, font Be Vietnam Pro qua Google Fonts, tabular-nums).
6. Scripts trong package.json: `dev`, `build`, `test`, `typecheck`, `lint`, `format`, `db:generate`, `db:migrate:local`, `db:migrate:remote`, `deploy`, `cf-typegen`.
7. Route `GET /api/health` trả `{ ok: true }` và một trang React "Hello" gọi được API đó qua Hono RPC client (`hc<AppType>`).
8. Cấu hình vitest-pool-workers với D1 local, có 1 test cho `/api/health`.
9. Cập nhật mục "Lệnh thường dùng" trong `CLAUDE.md` cho đúng thực tế.

Hoàn thành khi: `pnpm dev` chạy được và trang gọi API thành công; `pnpm typecheck`, `pnpm lint`, `pnpm test` đều qua. Báo cáo lại cấu trúc thư mục và các lệnh tôi cần tự chạy.

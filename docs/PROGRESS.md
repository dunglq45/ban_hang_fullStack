# Tiến độ dự án

Cập nhật sau mỗi giai đoạn bằng lệnh /phase. Phiên mới đọc file này để biết trạng thái.

| Giai đoạn | Trạng thái | Ghi chú |
|---|---|---|
| 00 Cài đặt môi trường | Xong | Node 22.15.1, pnpm 10.34.6, jq 1.8.2; các hook đã kiểm tra đạt |
| 01 Khởi tạo dự án | Xong | Vite 8 + @cloudflare/vite-plugin, Hono, React 19, Tailwind 4, Vitest 4.1 + pool-workers; /api/health + trang Hello qua hc<AppType> |
| 02 Database | Chưa làm | |
| 03 API nền tảng, auth | Chưa làm | |
| 04 API hàng hóa, danh bạ | Chưa làm | |
| 05 API bán hàng | Chưa làm | |
| 06 API nhập hàng, kiểm kho | Chưa làm | |
| 07 API công nợ, báo cáo | Chưa làm | |
| 08 Frontend nền tảng | Chưa làm | |
| 09 Bán hàng (POS) | Chưa làm | |
| 10 Hàng hóa | Chưa làm | |
| 11 Nhập hàng, kiểm kho | Chưa làm | |
| 12 Sổ nợ | Chưa làm | |
| 13 Tổng quan, cài đặt | Chưa làm | |
| 14 In hóa đơn, responsive | Chưa làm | |
| 15 Kiểm thử, deploy | Chưa làm | |

## Quyết định quan trọng

- Hook gọi qua `bash "${CLAUDE_PROJECT_DIR}/..."` (có ngoặc kép) để chạy đúng trên Windows/Git Bash với đường dẫn chứa `\`.
- `.gitattributes` ép `*.sh` dùng LF vì máy dev bật `core.autocrlf=true`.
- Dùng pnpm 10, không dùng 12: corepack đi kèm Node 22.15 chưa chạy được pnpm 12 (bản viết bằng Rust).
- Shim pnpm và `jq.exe` đặt ở `%LOCALAPPDATA%\bin` (đã thêm vào PATH người dùng), vì thư mục Node của nvm chỉ Admin ghi được.

- Giai đoạn 01: `compatibility_date` = 2026-08-22 vì workerd trong pool-workers 0.22 chỉ hỗ trợ tới ngày này.
- Giai đoạn 01: Vitest 4.1.x (pool-workers chưa hỗ trợ 5), TypeScript 6.0.x (typescript-eslint yêu cầu < 6.1).
- Giai đoạn 01: client lấy `AppType` qua project references (`tsconfig.worker.json` sinh .d.ts), tránh trộn runtime types của Workers với DOM.
- Giai đoạn 01: Tailwind v4 cấu hình bằng `@theme` trong `src/react-app/styles/index.css`: màu `ink`, `ink-muted`, `ink-body`, `ink-soft`, `line`, `line-input`, `page`, `table-head`, `primary`, `primary-soft`, `warn(-dot)`, `danger(-dot)`, `success(-dot)`; bo góc `rounded-small/control/card`; `h-touch`=44px; utility `num` (tabular-nums + căn phải).
- Không bật `nodejs_compat` (chưa thư viện nào cần).

## Việc còn nợ

- Người dùng tự chạy `wrangler login`, `wrangler d1 create store-app-db`, `wrangler r2 bucket create store-app-images` rồi thay `database_id` trong `wrangler.jsonc` (đang là UUID toàn số 0).
- Nâng `compatibility_date` khi `@cloudflare/vitest-pool-workers` có bản đi kèm workerd mới hơn 2026-08-22.

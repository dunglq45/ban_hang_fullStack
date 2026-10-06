# Tiến độ dự án

Cập nhật sau mỗi giai đoạn bằng lệnh /phase. Phiên mới đọc file này để biết trạng thái.

| Giai đoạn | Trạng thái | Ghi chú |
|---|---|---|
| 00 Cài đặt môi trường | Xong | Node 22.15.1, pnpm 10.34.6, jq 1.8.2; các hook đã kiểm tra đạt |
| 01 Khởi tạo dự án | Xong | Vite 8 + @cloudflare/vite-plugin, Hono, React 19, Tailwind 4, Vitest 4.1 + pool-workers; /api/health + trang Hello qua hc<AppType> |
| 02 Database | Xong | Schema Drizzle 14 bảng + migration `0000_init.sql`; helper qty/money/text/codes/uuid/password; `getDb(env, storeId)`; seed `pnpm db:seed:local`; 40 test |
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

- Giai đoạn 02: Drizzle biểu diễn được mọi CHECK (kể cả CHECK nhiều cột `stock >= 0 OR allow_negative = 1`), nên migration `0000_init.sql` là bản sinh nguyên, không sửa tay. CHECK được đặt tên (`products_stock_check`, `payments_amount_check`...); UNIQUE sinh thành UNIQUE INDEX (`*_store_code_unique`, `*_store_idempotency_unique`).
- Giai đoạn 02: cờ 0/1 khai báo `integer({ mode: "boolean" })`; cột enum dùng `text({ enum })`, các hằng `DOCUMENT_TYPES`, `COUNTER_KINDS`... export từ `schema.ts`.
- Giai đoạn 02: Drizzle bọc lỗi D1 thành "Failed query" và để lỗi gốc ở `cause`. Dùng `isConstraintError(err, "CHECK", "products_stock_check")` (`src/worker/lib/db-errors.ts`) để nhận ra hết hàng, trùng idempotency key...
- Giai đoạn 02: `getDb(env, storeId)` trả về repository gắn storeId qua closure (`storeId`, `batch`, `codes.next(kind)`, `categories`). `createDatabase` (Drizzle thô) chỉ dùng cho test/việc toàn hệ thống; ESLint chặn import nó và `drizzle-orm/d1` trong `src/worker/routes|services`.
- Giai đoạn 02: sinh mã: `codes.next(kind)` trả `{ bump, code }`; `bump` phải đứng trước câu dùng `code` trong cùng batch. Batch lỗi thì bộ đếm không tăng (đã test). `formatCode` (6 chữ số) ở `src/shared/codes.ts`.
- Giai đoạn 02: `uuidv7` đơn điệu trong một isolate (12 bit bộ đếm trong cùng ms), cần vì Workers đóng băng `Date.now()` trong một request.
- Giai đoạn 02: `parseVnd` trả `null` khi có ký tự lạ (dấu phẩy thập phân, "1,5tr", chữ) thay vì đoán; `formatQty` dùng dấu phẩy thập phân vi-VN.
- Giai đoạn 02: `lib/password.ts` (PBKDF2 100k vòng, từ chối chuỗi lưu < 10k vòng) viết sớm vì seed cần; giai đoạn 03 dùng lại.
- Giai đoạn 02: seed chạy bằng `tsx` (devDependency), sinh `.wrangler/seed/seed.sql` rồi `wrangler d1 execute --local`. Seed XÓA SẠCH D1 local rồi nạp: cửa hàng "Tạp hóa Minh Anh", chủ 0900000001 / nhân viên 0900000002 (mật khẩu `123456`), 6 nhóm, 32 mặt hàng (mã SP theo design, ví dụ SP000052), 6 khách (KH), 2 NCC. Tồn đầu kỳ ghi qua phiếu kiểm kho KK000001 (stock_movements `adjust`), nợ cũ ghi qua debt_entries, để sổ cái khớp số dư. Bộ đếm: SP=127, KH=6, NCC=2, KK=1.

## Việc còn nợ

- Người dùng tự chạy `wrangler login`, `wrangler d1 create store-app-db`, `wrangler r2 bucket create store-app-images` rồi thay `database_id` trong `wrangler.jsonc` (đang là UUID toàn số 0).
- Seed: thêm hóa đơn bán và phiếu nhập mẫu qua service sau giai đoạn 05–06.
- CLAUDE.md mục "Lệnh thường dùng" chưa có `pnpm db:seed:local` (xóa sạch D1 local) và tài khoản mẫu; người dùng quyết định có thêm không.
- Cân nhắc index `categories (store_id, sort_order)` nếu cần (DATABASE.md không yêu cầu, bảng nhỏ).
- `toBaseQty` chưa kiểm tra factor nguyên dương; `toMilli` chính xác tới ~1e9 đơn vị. Chặn bằng Zod (factor int > 1, qty max) ở giai đoạn 04–05.
- Nâng `compatibility_date` khi `@cloudflare/vitest-pool-workers` có bản đi kèm workerd mới hơn 2026-08-22.

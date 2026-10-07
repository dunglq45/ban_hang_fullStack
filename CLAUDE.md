# CLAUDE.md – Ứng dụng quản lý cửa hàng bán lẻ

## Sản phẩm
Web app SaaS cho cửa hàng bán lẻ nhỏ ở Việt Nam (tạp hóa, VLXD, quần áo, nhà thuốc…).
Chức năng MVP: bán hàng (POS), hàng hóa và tồn kho, nhập hàng, kiểm kho, sổ nợ khách hàng và nhà cung cấp, báo cáo tổng quan.
Người dùng không rành công nghệ, nên giao diện phải rõ ràng, ít bước, dùng từ ngữ đời thường.
Toàn bộ chữ trên giao diện là tiếng Việt.

## Tài liệu bắt buộc đọc trước khi code
- `docs/ARCHITECTURE.md`: kiến trúc, cấu trúc thư mục, quy ước.
- `docs/DATABASE.md`: schema D1 và các quy tắc nghiệp vụ (tồn kho, giá vốn, công nợ).
- `docs/API.md`: danh sách endpoint.
- `design/*.dc.html`: thiết kế giao diện tham chiếu (xem mục "Thiết kế" bên dưới).

## Stack
- Cloudflare Workers + Hono (API, chạy dưới `/api/*`).
- Cloudflare D1 (SQLite) + Drizzle ORM + drizzle-kit migrations.
- R2 cho ảnh hàng hóa.
- React + Vite + TypeScript (strict), dùng chung một Worker qua `@cloudflare/vite-plugin` (Worker phục vụ cả API lẫn static assets của SPA).
- React Router, TanStack Query, react-hook-form, Zod, Tailwind CSS.
- Kiểm thử: Vitest + `@cloudflare/vitest-pool-workers` cho API; Vitest + Testing Library cho frontend.
- Quản lý gói: pnpm.

## Lệnh thường dùng
- `pnpm dev`: chạy local tại http://localhost:5173 (Vite + Worker + D1/R2 local, dữ liệu lưu trong `.wrangler/`).
- Tài liệu API kiểu Swagger (chỉ khi `pnpm dev`): http://localhost:5173/api/docs (spec: `/api/docs/openapi.json`). Bảng endpoint ở `src/worker/dev/openapi.ts`; thêm route mới thì thêm vào bảng (test `test/api/docs.test.ts` báo thiếu).
- `pnpm build`: build Worker và SPA vào `dist/`. `pnpm preview`: build rồi chạy bản build.
- `pnpm test`: chạy toàn bộ test một lần (`vitest run`), gồm 2 project: `worker` (test/, chạy trong workerd qua `@cloudflare/vitest-pool-workers`, tự áp dụng migration vào D1 test) và `web` (`src/react-app/**/*.test.tsx`, jsdom). Chạy riêng: `pnpm test --project worker`. Chế độ watch: `pnpm test:watch`.
- `pnpm typecheck`: `tsc -b` (project references: worker → app, node, test).
- `pnpm lint`, `pnpm format` (prettier, bỏ qua `docs/`, `prompts/`, `design/`).
- `pnpm db:generate`: sinh SQL migration vào `migrations/` từ `src/worker/db/schema.ts`.
- `pnpm db:migrate:local`: áp dụng migration vào D1 local. Chạy lại sau mỗi lần `db:generate`.
- `pnpm db:seed:local`: XÓA SẠCH D1 local rồi nạp dữ liệu mẫu "Tạp hóa Minh Anh". Tài khoản: chủ `0900000001`, nhân viên `0900000002`, mật khẩu `123456`.
- `pnpm test:e2e`: E2E Playwright (`e2e/`), tự chạy `vite dev` cổng 5180 với D1 local riêng `.wrangler/e2e` (nạp lại seed mỗi lần), dùng Chrome cài trên máy. Không nằm trong `pnpm test`.
- `pnpm build:preview`: build cho môi trường `preview` (`env.preview` trong `wrangler.jsonc`, D1/R2 riêng).
- `pnpm db:migrate:remote`, `pnpm db:migrate:preview`, `pnpm run deploy`, `pnpm run deploy:preview`: CHỈ người dùng tự chạy, Claude không bao giờ chạy. Lưu ý: hook `guard.sh` chỉ bắt `db:migrate:remote` (và `pnpm deploy`, `--remote`, `wrangler deploy` khi gõ thẳng trong lệnh); `db:migrate:preview`, `pnpm run deploy`, `pnpm run deploy:preview` KHÔNG bị hook chặn vì cờ `--remote`/`wrangler deploy` nằm trong package.json. Người dùng gõ `pnpm run deploy` (không phải `pnpm deploy`, đó là lệnh có sẵn của pnpm). Hướng dẫn deploy, sao lưu, log, migration: `docs/VAN-HANH.md`.
- `pnpm cf-typegen`: sinh lại `worker-configuration.d.ts` (type `Env` + runtime). Chạy sau khi sửa `wrangler.jsonc`.

Lưu ý môi trường:
- `compatibility_date` bị giới hạn bởi workerd đi kèm `@cloudflare/vitest-pool-workers` (đang là 2026-08-22). Không nâng quá ngày đó, nếu không test sẽ không khởi động được.
- Vitest giữ ở 4.1.x (pool-workers chưa hỗ trợ Vitest 5); TypeScript giữ ở 6.0.x (typescript-eslint chưa hỗ trợ TS 7).
- Type `AppType` cho Hono RPC: client import từ `src/worker/index.ts`; `tsc -b` lấy type qua `.d.ts` của project worker. Route phải khai báo theo chuỗi `.get().post()...` để type suy ra được.

## Quy tắc bất di bất dịch
1. **Đa cửa hàng (multi-tenant):** mọi bảng nghiệp vụ có `store_id`. `store_id` luôn lấy từ session trên server, KHÔNG BAO GIỜ nhận từ request body/query. Mọi query phải lọc theo `store_id`; dùng các hàm repository có sẵn tham số `storeId`, không viết query trần ở route.
2. **Tiền** là số nguyên VND (INTEGER). Không dùng số thực cho tiền.
3. **Số lượng** lưu dạng số nguyên "milli" (×1000) của đơn vị tính. 1,5 kg = 1500. Dùng helper trong `src/shared/qty.ts`; không tự nhân chia rải rác.
4. **Chứng từ đã hoàn thành không được sửa hay xóa.** Muốn sửa thì hủy (sinh bút toán đảo) rồi tạo chứng từ mới.
5. **Mọi thao tác ghi gồm nhiều bảng phải nằm trong MỘT `db.batch()`**. D1 không có interactive transaction; batch là đơn vị nguyên tử. Không đọc-rồi-ghi qua nhiều lượt gọi cho tồn kho hay công nợ; dùng `UPDATE ... SET x = x + ?` và subquery.
6. **Idempotency:** mọi request tạo chứng từ hoặc phiếu thu/chi có `idempotencyKey` (UUIDv7 do client sinh). Trùng key thì trả lại kết quả cũ, không ghi lần hai.
7. **ID** là UUIDv7 dạng TEXT. Thời gian lưu dạng INTEGER (epoch milliseconds).
8. **Phân quyền:** `owner` thấy mọi thứ. `staff` chỉ bán hàng, xem hàng hóa, thu nợ; API phải loại bỏ giá vốn, lợi nhuận và báo cáo khỏi response của staff.
9. Validate mọi input bằng Zod (schema đặt trong `src/shared/schemas`, dùng chung cho client và server).

## Quy ước code
- TypeScript strict, không dùng `any`.
- Logic nghiệp vụ nằm ở `src/worker/services/*`, route chỉ parse input, gọi service và trả output.
- Lỗi nghiệp vụ ném `AppError(code, message, status)`; middleware chuyển thành JSON `{ error: { code, message } }`. Message hiển thị cho người dùng viết bằng tiếng Việt.
- Viết test cho mọi service có ghi dữ liệu (bán, nhập, hủy, thu nợ, kiểm kho) TRƯỚC khi làm giao diện tương ứng.
- Mỗi giai đoạn xong: chạy `pnpm typecheck && pnpm test`, sửa hết lỗi rồi mới báo hoàn thành.
- Commit nhỏ, message rõ ràng (tiếng Anh, conventional commits).

## Thiết kế
- Các file `design/*.dc.html` là mockup xuất từ công cụ thiết kế. Chúng chứa cú pháp template riêng (`<x-dc>`, `<sc-for>`, `{{...}}`, class `DCLogic`), KHÔNG copy nguyên văn. Chỉ đọc để lấy bố cục, khoảng cách, màu, cỡ chữ, nội dung chữ và dữ liệu mẫu.
- Tương ứng màn hình ↔ file:
  - Bán hàng: `Main.dc.html`
  - Danh sách hàng hóa: `HangHoa.dc.html`
  - Thêm/sửa hàng: `ThemHang.dc.html`
  - Chi tiết hàng hóa: `ChiTietHang.dc.html`
  - Nhập hàng: `NhapHang.dc.html`
  - Kiểm kho: `KiemKho.dc.html`
  - Sổ nợ: `SoNo.dc.html`
  - Hộp thoại thu nợ: `ThuNo.dc.html`
  - Tổng quan: `TongQuan.dc.html`
  - Đăng nhập: `DangNhap.dc.html`
  - Bán hàng và thanh toán trên điện thoại: `BanHangMobile.dc.html`, `ThanhToanMobile.dc.html`
  - Hóa đơn in 80mm: `HoaDon.dc.html`
- Design tokens:
  - Màu chữ `#101828`, chữ phụ `#5B6474`, chữ thân `#344054`/`#475467`.
  - Viền `#E4E7EC`, viền input `#D0D5DD`.
  - Nền trang `#F6F7F9`, nền header bảng `#F9FAFB`.
  - Màu chính `#1849A9` (nền nhạt: màu chính với alpha 8%).
  - Màu nợ và sắp hết `#B54708` (chấm `#F79009`), hết hàng `#B42318` (chấm `#F04438`), tăng hoặc đã trả `#067647` (chấm `#12B76A`).
  - Bo góc: 6px (nút nhỏ), 8px (input, nút), 10px (card).
  - Font: Be Vietnam Pro; số dùng `font-variant-numeric: tabular-nums`, căn phải trong bảng.
  - Vùng bấm tối thiểu 44px.

## Tự động hóa (thư mục .claude/)
- Hook `guard.sh` chặn lệnh `--remote`, `db:migrate:remote`, `pnpm deploy`, `wrangler deploy|delete`, `rm -rf`, `push --force`. Không tìm cách né hook; hãy yêu cầu người dùng tự chạy lệnh đó.
- Hook `format.sh` tự chạy prettier cho file vừa sửa; hook `verify.sh` chạy `pnpm typecheck` và `pnpm test` khi kết thúc lượt nếu có thay đổi chưa commit.
- Script `test` trong package.json phải chạy một lần rồi thoát (ví dụ `vitest run`), không dùng chế độ watch.
- Subagent `reviewer` dùng để rà diff trước khi commit; lệnh `/phase NN` chạy một giai đoạn trong `prompts/`.
- Cập nhật `docs/PROGRESS.md` sau mỗi giai đoạn.

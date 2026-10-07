# Rà soát bảo mật (giai đoạn 15)

Ngày rà: 07/10/2026. Phạm vi: toàn bộ `src/worker` (route, middleware, service, repository), cấu hình
`wrangler.jsonc`, bản build production. Cách làm: đọc code, grep, và test tự động mới (ghi rõ ở từng mục).

Kết luận: **không phát hiện lỗ hổng nghiêm trọng**. Đã bổ sung header bảo mật và hai bộ test khóa
các quy tắc lại (phân quyền mọi route, kế hoạch truy vấn). Các rủi ro còn lại ở cuối báo cáo đều đã
biết và được chấp nhận cho MVP.

## 1. Mọi truy vấn đều lọc `store_id`

| Kiểm tra | Kết quả |
|---|---|
| Route/service có gọi Drizzle trực tiếp (`createDatabase`, `drizzle-orm/d1`) không? | Không. ESLint `no-restricted-imports` chặn ở `src/worker/routes/**`, `src/worker/services/**`. |
| Grep `.select(`, `.insert(`, `.update(`, `.delete(`, `sql\``, `.prepare(` trong routes/services/middleware/lib | Chỉ gọi qua repository (`db.products.insert`…) hoặc `lib/codes.ts`, `lib/guard.ts` (nhận `storeId` từ `createRepositories`). |
| Repository: mọi `where`, subquery, `UPDATE`, `INSERT` | Đều có `store_id = storeId` (closure trong `createRepositories(db, storeId)`, code gọi không truyền được storeId khác). Kể cả subquery SQL thô (`currentStock`, `currentCost`, `keepsAnOwner`, `deleteSessions`), join `contacts`/`users`/`products` (điều kiện join có `store_id`). |
| Ngoại lệ có chủ đích | `repositories/auth.ts` (tìm user theo SĐT khi đăng nhập, phiên, `login_attempts`) và cron dọn dữ liệu: chạy trước khi biết cửa hàng, khóa theo SĐT (duy nhất toàn hệ thống) hoặc id phiên (hash của token ngẫu nhiên). |
| `store_id` từ request? | Không có. `storeId` chỉ lấy từ phiên (`middleware/session.ts`). |
| Ảnh R2 | Key dạng `{storeId}/products/...`; `GET /api/images/:key` từ chối key không bắt đầu bằng `storeId/` của người đang đăng nhập hoặc chứa `..` (404). |
| Test | `test/api/isolation.test.ts` (2 cửa hàng, có từ giai đoạn 03–07) đọc/sửa chéo đều 404. |

## 2. Xác thực và phân quyền mọi route

Bảng quyền khai báo cho từng route nằm ở `src/worker/dev/openapi.ts` (`access`: public / user / owner).
Test mới **`test/api/access-matrix.test.ts`** đi qua **mọi** route của `app.routes`:

- route chưa khai báo quyền → test hỏng (cùng với `docs.test.ts`, route mới bắt buộc vào bảng);
- chưa đăng nhập → mọi route không public trả **401** (public chỉ có `GET /health`, `POST /auth/register`, `POST /auth/login`);
- nhân viên gọi 23 route chỉ dành cho chủ → **403** (đã thử gỡ `requireOwner` khỏi `/reports` → test hỏng đúng 4 route).

Quyền của nhân viên (staff) sau rà soát, khớp quy tắc 8 trong `CLAUDE.md`:

| Nhóm | Staff được | Staff bị chặn |
|---|---|---|
| Bán hàng | `POST /sales`, xem hóa đơn bán (`/documents` bị ép `type=sale`) | Hủy hóa đơn; xem phiếu nhập/kiểm kho/trả hàng (403) |
| Hàng hóa | Xem danh sách, chi tiết, lịch sử kho, tra mã vạch, POS | Thêm/sửa/nhập Excel/ảnh, nhóm hàng (403) |
| Kiểm kho | Xem phiếu, ghi số, quét | Tạo, hoàn thành phiếu (403) |
| Công nợ | Thu nợ khách (`receipt`), xem phiếu thu, sổ nợ, danh bạ, thêm/sửa đối tác | Phiếu chi trả NCC (403 khi tạo và khi xem), hủy phiếu; đặt hạn mức nợ/ngừng giao dịch (service bỏ qua giá trị staff gửi) |
| Cửa hàng | — | `/store`, `/users`, `/reports/*`, `/purchases/*` (403) |

## 3. Không lộ giá vốn cho nhân viên

- Service tách theo vai trò: `serialize.ts` (hàng hóa), `documents.ts` (dòng chứng từ bỏ `costPrice`),
  `stock-counts.ts` (bỏ `diffValue`, giá trị chênh lệch), báo cáo chỉ chủ.
- Test mới (`access-matrix.test.ts`) tạo dữ liệu thật (hàng có đơn vị quy đổi, hóa đơn ghi nợ, phiếu thu,
  phiếu kiểm đã ghi số) rồi gọi **mọi route GET mà staff được phép** bằng tài khoản staff, duyệt toàn
  bộ JSON (mọi độ sâu) tìm tên trường chứa `cost`, `profit`, `margin`, `value`: không có. Route GET mới
  cho staff mà chưa có dữ liệu mẫu trong test → test hỏng, buộc bổ sung. Đã thử cho `getDocument` trả
  `costPrice` cho mọi vai trò → test hỏng đúng chỗ.
- E2E `e2e/staff.spec.ts`: giao diện chi tiết hàng không có chữ "giá vốn"/"lợi nhuận", menu không có
  Tổng quan, mở thẳng `/tong-quan` bị đưa về Bán hàng.
- Đã biết: staff có thể dò giá vốn qua lỗi `PRICE_BELOW_COST` khi bán dưới giá vốn (hệ quả của quy tắc
  "không bán dưới giá vốn", ghi ở PROGRESS từ giai đoạn 05).

## 4. Cookie, CSRF, đăng nhập, upload

| Mục | Hiện trạng | Đánh giá |
|---|---|---|
| Cookie `sid` | `HttpOnly; Secure; SameSite=Lax; Path=/`; "ghi nhớ" 30 ngày, không ghi nhớ thì cookie phiên + server chỉ giữ 1 ngày từ lần dùng cuối | Đạt |
| Token phiên | 32 byte ngẫu nhiên (base64url), DB chỉ lưu SHA-256 | Đạt: lộ DB không đăng nhập được |
| Đăng xuất / đổi mật khẩu / khóa nhân viên | Xóa phiên (đổi mật khẩu: xóa phiên các máy khác) | Đạt |
| CSRF | Mọi POST/PUT/PATCH/DELETE bắt buộc `X-Requested-With: fetch`; có body thì phải `Content-Type: application/json` (riêng upload ảnh: multipart nhưng vẫn cần header). Kết hợp SameSite=Lax | Đạt (form HTML không đặt được header; fetch khác domain phải qua preflight, Worker không trả CORS) |
| Đăng nhập sai | Tối đa 5 lần / 15 phút / SĐT, ghi lần thử **trước** khi kiểm tra (request song song không vượt được); SĐT không tồn tại vẫn chạy PBKDF2 giả để thời gian phản hồi như nhau | Đạt |
| Giới hạn theo IP | Binding Rate Limiting: đăng nhập 20/phút, đăng ký 5/phút theo `CF-Connecting-IP` (local không có header thì bỏ qua) | Đạt; **cần xác nhận binding hoạt động trên tài khoản thật** sau deploy (xem VAN-HANH.md) |
| Mật khẩu | PBKDF2-SHA256 100k vòng, salt 16 byte | Đạt |
| Upload ảnh | Chỉ chủ; chặn sớm theo `Content-Length` (> 2MB + 64KB, hoặc thiếu header/chunked → từ chối trước khi đọc body); kiểm tra lại kích thước file; nhận diện JPG/PNG/WEBP theo magic bytes (không tin `Content-Type`/đuôi file); trả ảnh kèm `nosniff`, `Cache-Control: private` | Đạt |
| Kích thước input JSON | Zod giới hạn độ dài chuỗi, ≤ 200 dòng/chứng từ, ≤ 500 dòng/lần import | Đạt |
| Lỗi | Middleware trả `{ error: { code, message } }`, không lộ stack; log server che mật khẩu/token (`redact`) | Đạt |
| Trang tài liệu API `/api/docs` | Chỉ gắn khi `import.meta.env.DEV`; bản build production không có route (chỉ còn một hằng chuỗi URL CDN, vô hại) | Đạt |

## 5. Đã sửa/bổ sung trong giai đoạn này

1. **Header bảo mật** (trước đây không có):
   - `/api/*`: `secureHeaders()` của Hono (`X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`,
     `Strict-Transport-Security`, `Referrer-Policy: no-referrer`, `Cross-Origin-Resource-Policy: same-origin`...),
     có test trong `test/api/middleware.test.ts`.
   - Trang SPA: `public/_headers` (`nosniff`, `X-Frame-Options: DENY` chống clickjacking,
     `Referrer-Policy`, `Permissions-Policy` chỉ cho camera cùng nguồn — dành cho quét mã bằng camera sau này).
2. Test ma trận phân quyền + rò giá vốn cho mọi route (mục 2, 3), có cả dữ liệu nhập hàng/nợ NCC.
3. CI/CD (`.github/workflows/`): `permissions: contents: read`; token Cloudflare chỉ đưa vào bước
   migrate/deploy/export (không lộ cho `pnpm install`/test chạy code bên thứ ba); production chỉ
   deploy từ `main`; deploy/backup tắt cho tới khi đặt biến `DEPLOY_ENABLED`.

Chưa làm (gợi ý): pin GitHub Actions theo commit SHA thay vì tag `@v4`.

## 6. Rủi ro còn lại / khuyến nghị

| Mức | Rủi ro | Khuyến nghị |
|---|---|---|
| Trung bình | `PUT /api/auth/password` chưa giới hạn tần suất: ai chiếm được phiên có thể dò mật khẩu hiện tại (mỗi lần thử tốn một lượt PBKDF2) | Thêm binding Rate Limiting theo user (nợ từ giai đoạn 13) |
| Thấp | Người khác cố tình nhập sai 5 lần để khóa đăng nhập một SĐT trong 15 phút | Chấp nhận cho MVP; nếu bị lạm dụng thì chỉ khóa theo cặp SĐT + IP |
| Thấp | Chưa có Content-Security-Policy cho trang SPA (dùng Google Fonts và thuộc tính `style` inline của React) | Thêm CSP `default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: blob:` vào `public/_headers` sau khi thử kỹ trên bản preview |
| Trung bình | Staff xem được danh sách NCC, số nợ NCC và sổ nợ NCC (`/contacts?type=supplier`, `/contacts/:id/debt-entries` của NCC, `/debts/summary` có `payable`). Không có trường giá vốn, nhưng số tiền bút toán "phiếu nhập" là tổng tiền phiếu nhập; phiếu chỉ một mặt hàng thì suy ra được giá nhập | **Chủ cửa hàng quyết định**: nếu cần giấu, chặn `type=supplier` và sổ nợ NCC với staff (403), bỏ `payable` khỏi `/debts/summary` của staff, ẩn tab Nhà cung cấp ở Sổ nợ |
| Thấp | Staff dò được giá vốn qua lỗi `PRICE_BELOW_COST` | Đã biết, chấp nhận (mục 3) |
| Thông tin | Rate Limiting của Cloudflare đếm gần đúng, theo từng location | Lớp chính vẫn là giới hạn theo SĐT trong DB |

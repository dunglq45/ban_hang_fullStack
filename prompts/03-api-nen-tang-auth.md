# Prompt 03 – Nền tảng API và xác thực

Nhiệm vụ: xây phần nền cho mọi route, theo mục Bảo mật trong `docs/ARCHITECTURE.md`.

1. `AppError(code, message, status, details?)` và middleware lỗi: AppError → JSON chuẩn; ZodError → 400 `VALIDATION_ERROR` kèm danh sách trường lỗi; lỗi khác → 500 `INTERNAL_ERROR`, message chung chung, log chi tiết bằng console.error.
2. `lib/password.ts`: PBKDF2-SHA256 qua WebCrypto (100.000 vòng, salt 16 byte), so sánh constant-time.
3. Session: token 32 byte ngẫu nhiên (base64url) trong cookie `sid` (HttpOnly, Secure, SameSite=Lax, Path=/; 30 ngày nếu remember, không thì session cookie). DB lưu sha256(token). Middleware `session` gắn `c.var.user`, `c.var.storeId`, `c.var.db` (từ `getDb`). Gia hạn khi còn < 7 ngày.
4. Middleware `requireAuth`, `requireOwner`. Middleware chống CSRF cho request ghi: bắt buộc `Content-Type: application/json` (trừ upload ảnh) và header `X-Requested-With: fetch`.
5. Routes theo `docs/API.md` mục Auth, Cửa hàng và nhân viên:
   - register: tạo store + owner + counters + nhóm hàng mặc định trong MỘT batch; SĐT trùng → `PHONE_TAKEN`.
   - login: giới hạn 5 lần sai / 15 phút / SĐT → `TOO_MANY_ATTEMPTS`; sai → `INVALID_CREDENTIALS` ("Số điện thoại hoặc mật khẩu không đúng"); tài khoản khóa → `ACCOUNT_DISABLED`.
   - logout, me, store GET/PUT, users CRUD (owner không tự khóa hay hạ quyền chính mình).
6. Zod schema đặt trong `src/shared/schemas/auth.ts` và `store.ts`. SĐT Việt Nam: 10 số, bắt đầu bằng 0.
7. Export `AppType` từ `src/worker/index.ts` để client dùng.
8. Test (vitest-pool-workers): register → login → me; login sai 6 lần bị khóa; staff gọi route owner bị 403; **user cửa hàng A không đọc được dữ liệu cửa hàng B** (viết sẵn helper test tạo 2 cửa hàng, dùng lại cho các prompt sau).

Hoàn thành khi toàn bộ test qua. Liệt kê các mã lỗi đã định nghĩa.

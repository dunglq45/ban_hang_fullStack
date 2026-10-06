# Kiến trúc

## Tổng quan

```
Trình duyệt (React SPA)
   │  fetch /api/*  (cookie session, JSON)
   ▼
Cloudflare Worker (một Worker duy nhất)
   ├─ /api/*  → Hono app
   │     ├─ middleware: error handler → session → requireRole
   │     ├─ routes/*    (parse + validate bằng Zod)
   │     └─ services/*  (nghiệp vụ, build D1 batch)
   │            └─ repositories/* (query có storeId)
   ├─ static assets → SPA build (fallback index.html)
   ├─ D1  (binding: DB)
   └─ R2  (binding: IMAGES)
```

Dùng một Worker phục vụ cả API và frontend: một lần deploy, cùng domain (không cần CORS), cookie đơn giản.
Scaffold bằng template React + Worker của Cloudflare (`@cloudflare/vite-plugin`). Kiểm tra docs Cloudflare hiện hành cho lệnh tạo dự án và cấu hình `wrangler.jsonc` mới nhất.

## Cấu trúc thư mục

```
/
├─ CLAUDE.md
├─ docs/
├─ design/                     # mockup tham chiếu, không import
├─ migrations/                 # SQL do drizzle-kit sinh
├─ src/
│  ├─ shared/                  # dùng chung client và server
│  │  ├─ schemas/              # Zod: product, contact, sale, purchase, payment, stockCount, auth
│  │  ├─ qty.ts                # helper số lượng milli
│  │  ├─ money.ts              # format VND, parse input "100.000"
│  │  ├─ text.ts               # removeDiacritics (đ→d), toSearch
│  │  └─ types.ts
│  ├─ worker/
│  │  ├─ index.ts              # Hono app, export type AppType
│  │  ├─ db/schema.ts          # Drizzle schema
│  │  ├─ db/client.ts
│  │  ├─ middleware/           # error, session, role
│  │  ├─ lib/                  # AppError, uuidv7, password (PBKDF2), cookies, codes
│  │  ├─ repositories/
│  │  ├─ services/             # auth, product, sale, purchase, stockCount, debt, report
│  │  └─ routes/
│  └─ react-app/
│     ├─ main.tsx, router.tsx
│     ├─ api/                  # hono/client (hc<AppType>) + TanStack Query hooks
│     ├─ components/ui/        # Button, Input, Select, Table, Tabs, Dialog, Badge, StatusDot, KpiStrip, Pagination, MoneyInput, QtyStepper
│     ├─ components/layout/    # AppShell (Sidebar + Header), MobileTabBar
│     ├─ features/             # auth, pos, products, purchases, stock-count, debts, dashboard, settings
│     └─ styles/
└─ test/                       # test API với vitest-pool-workers
```

## Quyết định chính

| Vấn đề | Lựa chọn | Lý do |
|---|---|---|
| Đa cửa hàng | Một D1 dùng chung, cột `store_id` | Đơn giản, đủ cho giai đoạn đầu. Mọi truy cập DB đi qua `getDb(env, storeId)` để sau này shard được. |
| Xác thực | Session token ngẫu nhiên trong cookie HttpOnly, lưu SHA-256 của token trong bảng `sessions` | Thu hồi được, không cần thư viện JWT. |
| Mật khẩu | PBKDF2-SHA256 qua WebCrypto (100k vòng, salt 16 byte) | Chạy native trên Workers. |
| Giao dịch | `db.batch([...])` | D1 không hỗ trợ BEGIN/COMMIT giữa các lượt gọi. |
| Mã chứng từ | Bảng `counters`, tăng trong cùng batch, dùng subquery để lấy giá trị | Không trùng số, không cần đọc trước. |
| Type-safe API | Hono RPC (`hc<AppType>`) | Client tự có type từ server. |
| Tìm kiếm tiếng Việt | Cột `name_search` = tên bỏ dấu, chữ thường; `LIKE '%q%'` | Gõ "nuoc mam" vẫn ra "Nước mắm". |
| Giá vốn | Bình quân gia quyền di động | Phổ biến ở cửa hàng VN, tính được bằng một câu UPDATE. |
| Offline | Chưa làm trong MVP; dùng sẵn idempotencyKey và UUID do client sinh để sau này thêm hàng đợi offline | |

## Bảo mật
- Cookie `sid`: HttpOnly, Secure, SameSite=Lax, Path=/, hết hạn sau 30 ngày (gia hạn khi dùng).
- Với mọi request ghi (POST/PUT/PATCH/DELETE), yêu cầu header `Content-Type: application/json` và header `X-Requested-With: fetch` để chặn CSRF dạng form.
- Giới hạn đăng nhập sai: tối đa 5 lần / 15 phút / số điện thoại (bảng `login_attempts`).
- Không log mật khẩu, token.

## Hiệu năng D1
- Mọi index bắt đầu bằng `store_id`.
- Danh sách luôn phân trang (mặc định 20, tối đa 100).
- Báo cáo MVP query trực tiếp trên `documents`/`document_lines`. Khi dữ liệu lớn, thêm bảng chốt số liệu theo ngày (ngoài phạm vi MVP).
- Kiểm tra giới hạn hiện hành của D1 (dung lượng mỗi database, số câu lệnh mỗi batch, thời gian query) trong docs Cloudflare. Giới hạn số dòng mỗi phiếu là 200 và mỗi lần import là 500 dòng để batch không quá dài.

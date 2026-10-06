# Trạng thái backend (sau giai đoạn 07)

Đối chiếu với `docs/API.md`. Toàn bộ test: `pnpm test` (worker + web), 205 test qua; `pnpm typecheck`, `pnpm lint` sạch.
Mọi endpoint dưới đây đã có test tích hợp (gọi qua `hc<AppType>` như frontend), kể cả ca cô lập hai cửa hàng (`test/api/isolation.test.ts`).

🔒 = cần đăng nhập, 👑 = chỉ owner.

## Endpoint đã xong

| Nhóm | Endpoint | Ghi chú |
|---|---|---|
| Hệ thống | GET /api/health | |
| Tài liệu (chỉ dev) | GET /api/docs (Swagger UI), GET /api/docs/openapi.json | Không có trong bản build |
| Auth | POST /api/auth/register, POST /api/auth/login, POST /api/auth/logout 🔒, GET /api/auth/me 🔒 | Giới hạn theo IP (Rate Limiting) và theo SĐT (5 lần / 15 phút); Cron dọn phiên hết hạn |
| Cửa hàng | GET/PUT /api/store 🔒👑 | |
| Nhân viên | GET/POST /api/users 🔒👑, PATCH /api/users/:id 🔒👑 | Không bao giờ hết chủ (LAST_OWNER) |
| Nhóm hàng | GET /api/categories 🔒, POST 👑, PATCH/DELETE /api/categories/:id 👑 | |
| Hàng hóa | GET /api/products, /lookup, /pos, /:id, /:id/movements 🔒; POST /api/products, PUT /:id, POST /import, POST /:id/image 👑 | Staff không nhận giá vốn |
| Ảnh | GET /api/images/:key 🔒 | |
| Danh bạ | GET /api/contacts, GET /:id (kèm `lastPayment`), GET /:id/debt-entries, POST, PUT /:id 🔒 | Staff không đặt hạn mức nợ / ngừng giao dịch |
| Sổ nợ | GET /api/debts/summary 🔒 | |
| Bán hàng | POST /api/sales 🔒 | idempotency, hạn mức nợ, hết hàng, staff không bán dưới giá vốn |
| Nhập hàng | POST /api/purchases, PUT /:id (nháp), POST /:id/complete 🔒👑 | Giá vốn bình quân gia quyền |
| Chứng từ | GET /api/documents, GET /:id 🔒 (staff chỉ hóa đơn bán); POST /:id/cancel 🔒👑 | Hủy hóa đơn bán, phiếu nhập, phiếu kiểm nháp |
| Thu chi | POST /api/payments 🔒 (phiếu chi 👑), GET /api/payments/:id 🔒, POST /:id/cancel 🔒👑 | `GET /:id` thêm so với API.md, dùng để in phiếu thu |
| Kiểm kho | POST /api/stock-counts 👑, GET /:id, PATCH /:id/lines, POST /:id/scan 🔒, POST /:id/complete 👑 | |
| Báo cáo | GET /api/reports/overview, /revenue-daily, /top-products, /restock 🔒👑 | Ngày theo giờ VN |

## Còn thiếu hoặc chưa làm so với tài liệu

- **Trả hàng (`sale_return`, `purchase_return`)**: schema, ràng buộc và báo cáo đã chừa chỗ (doanh thu trừ `sale_return`), nhưng chưa có endpoint tạo phiếu trả hàng. API.md cũng chưa liệt kê; ngoài phạm vi MVP.
- **Danh sách phiếu thu/chi** (`GET /api/payments`): API.md không có. Hiện xem qua sổ chi tiết công nợ từng đối tác; thêm khi giao diện cần.
- **Xuất báo cáo / Xuất Excel** (nút trên design Tổng quan, Sổ nợ): chưa có endpoint; có thể làm ở client từ dữ liệu JSON sẵn có.
- **"Ngày thu" trên hộp thoại Thu nợ** (design ThuNo): server luôn ghi thời điểm hiện tại, không cho chọn ngày lùi.
- **Hủy phiếu thu/chi không lưu người hủy**: bảng `payments` không có cột `cancelled_by`.
- **`debt_since` không tính lại** khi khách trả các khoản nợ cũ nhất (xem PROGRESS.md, "Việc còn nợ").

## Cần kiểm tra khi deploy (giai đoạn 15)

- Giới hạn số câu lệnh mỗi lần chạy của D1/Workers với hóa đơn, phiếu nhập, phiếu kiểm nhiều dòng (≈ 3–4 câu/dòng trong một batch).
- Binding Rate Limiting (`namespace_id` 1001, 1002) và Cron Trigger trên tài khoản Cloudflare thật.
- `database_id` trong `wrangler.jsonc` (đang là UUID toàn số 0), bucket R2.

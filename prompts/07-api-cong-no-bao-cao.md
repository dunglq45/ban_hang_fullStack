# Prompt 07 – Thu chi, công nợ và báo cáo

1. `paymentService`: phiếu thu (thu nợ khách, mã PT) và phiếu chi (trả nợ NCC, mã PC, chỉ owner); `amount` phải ≤ nợ hiện tại (`AMOUNT_EXCEEDS_DEBT`); idempotency; hủy phiếu đảo lại công nợ. Một batch cho mỗi thao tác.
2. `GET /api/contacts/:id/debt-entries`: sổ chi tiết công nợ, mỗi dòng có ngày, mã chứng từ hoặc mã phiếu (join documents/payments), diễn giải ("Bán hàng, trả thiếu", "Thu nợ tiền mặt"…), phát sinh nợ, đã trả, dư nợ (balance_after). Phân trang, mới nhất trước.
3. `GET /api/debts/summary`: tổng phải thu và số khách nợ, tổng nợ quá 30 ngày và số khách, đã thu trong tháng (theo giờ VN), tổng phải trả NCC và số NCC.
4. Báo cáo (owner) theo `docs/API.md`:
   - overview: doanh thu = SUM(total) của sale completed trong kỳ (trừ đi sale_return nếu có); số đơn; TB/đơn; lợi nhuận gộp = SUM(line_total) − SUM(base_qty/1000 × cost_price) có tính phần chiết khấu đơn; biên LN; phải thu; số hàng cần nhập (sắp hết + hết).
   - revenue-daily: đủ N ngày, ngày không bán ra 0; nhóm theo ngày giờ VN (UTC+7).
   - top-products, restock.
   - Viết hàm tiện ích khoảng thời gian `period → [from, to)` theo giờ VN, có test cho ranh giới nửa đêm.
5. Hoàn thiện seed dev: tạo khoảng 40 hóa đơn trong 7 ngày qua, 3 phiếu nhập, vài khoản nợ quá hạn, vài lần thu nợ, 1 phiếu kiểm kho, bằng chính các service (không insert tay). Dữ liệu nên gần với ví dụ trong `design/`.
6. Test: thu một phần nợ, thu hết (debt_since = NULL), thu quá nợ → lỗi, hủy phiếu thu; overview và revenue-daily đúng trên dữ liệu kiểm soát được; đơn lúc 23:30 giờ VN được tính vào đúng ngày.

Sau prompt này, backend MVP hoàn chỉnh. Chạy toàn bộ test, rồi viết `docs/BACKEND-STATUS.md` liệt kê endpoint đã xong và những gì còn thiếu so với `docs/API.md`.

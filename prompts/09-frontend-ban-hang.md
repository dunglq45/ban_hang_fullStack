# Prompt 09 – Màn hình Bán hàng (POS)

Thiết kế: `design/Main.dc.html` (desktop), `design/BanHangMobile.dc.html` và `design/ThanhToanMobile.dc.html` (điện thoại). Đây là màn dùng nhiều nhất, ưu tiên tốc độ thao tác.

1. Tải danh sách hàng POS một lần (cache bằng TanStack Query, staleTime 5 phút) và tìm kiếm phía client bằng `toSearch`, để gõ là ra ngay.
2. Ô tìm kiếm luôn được focus. Phím tắt: F3 focus ô tìm, F9 thanh toán, Esc xóa ô tìm. Nhập hoặc quét mã vạch rồi Enter: khớp barcode (sản phẩm hoặc đơn vị) thì thêm vào đơn ngay. Hỗ trợ máy quét mã vạch USB (máy quét gõ phím rất nhanh rồi Enter).
3. Tab nhóm hàng, lưới ô hàng (mã, tên, giá, tồn; tồn thấp hiển thị màu cam).
4. Nhiều hóa đơn song song (tab "Hóa đơn 1", "Hóa đơn 2", nút +), lưu trạng thái giỏ trong state + localStorage để tải lại trang không mất đơn.
5. Giỏ hàng: chọn đơn vị (nếu hàng có units), QtyStepper, sửa đơn giá (staff không được nhập thấp hơn giá vốn; lỗi do server kiểm tra), xóa dòng.
6. Chọn khách: combobox tìm theo tên hoặc SĐT, hiện nợ cũ, có nút tạo khách nhanh (tên + SĐT) ngay trong dialog.
7. Thanh toán: tổng tiền hàng, giảm giá, khách cần trả, ô khách thanh toán (MoneyInput) và nút nhanh (Vừa đủ, các mệnh giá làm tròn lên hợp lý), tiền thừa trả khách hoặc phần "Còn thiếu · ghi nợ" kèm dư nợ sau đơn; tiền mặt hoặc chuyển khoản; checkbox in hóa đơn.
8. Gửi `POST /api/sales` với idempotencyKey sinh khi mở đơn (không sinh lại khi retry). Thành công: toast "Đã bán HD000231", làm trống đơn, mở trang in nếu có chọn in. Lỗi OUT_OF_STOCK: tô đỏ dòng thiếu hàng kèm số tồn còn lại. DEBT_LIMIT_EXCEEDED: hỏi owner có muốn vượt hạn mức không.
9. Sau khi bán, invalidate các query: hàng POS, tồn kho, contacts, reports.
10. Màn hình điện thoại (< 768px): dạng danh sách + thanh giỏ hàng cố định → trang thanh toán, theo 2 file thiết kế mobile.

Viết test cho logic giỏ hàng (tính tiền, quy đổi đơn vị, ghi nợ, tiền thừa) dưới dạng hàm thuần trong `features/pos/cart.ts`.

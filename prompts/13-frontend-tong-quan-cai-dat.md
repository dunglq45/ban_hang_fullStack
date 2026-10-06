# Prompt 13 – Tổng quan và Cài đặt

Thiết kế: `design/TongQuan.dc.html`.

1. `/tong-quan` (chỉ owner): SegmentedControl Hôm nay / 7 ngày / Tháng này / Tùy chọn (chọn khoảng ngày); KpiStrip 4 ô (doanh thu + số đơn + TB/đơn, lợi nhuận gộp + biên, phải thu + số khách quá hạn, hàng cần nhập + số đã hết); biểu đồ cột doanh thu 7 ngày tự vẽ bằng div hoặc SVG (cột hôm nay màu chính, các ngày khác màu chính nhạt, nhãn "3,2tr"), có tooltip số chính xác; bảng "Cần nhập thêm" (nút Tạo phiếu nhập điền sẵn các mặt hàng này) và bảng "Bán chạy".
2. `/cai-dat`:
   - Cửa hàng: tên, SĐT, địa chỉ, dòng cuối hóa đơn.
   - Nhân viên: danh sách, thêm (tên, SĐT, mật khẩu tạm, vai trò), khóa/mở, đặt lại mật khẩu.
   - Tài khoản của tôi: đổi mật khẩu.
   - Bán hàng: mặc định in hóa đơn sau khi bán (lưu localStorage).
3. Trang danh sách hóa đơn đã bán (`/hoa-don`, thêm vào sidebar dưới Bán hàng): lọc thời gian, khách, trạng thái; xem chi tiết; owner hủy; in lại.

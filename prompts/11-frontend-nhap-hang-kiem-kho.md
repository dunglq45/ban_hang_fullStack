# Prompt 11 – Màn hình Nhập hàng và Kiểm kho

Thiết kế: `design/NhapHang.dc.html`, `design/KiemKho.dc.html`.

1. Phiếu nhập `/nhap-hang/moi` và `/nhap-hang/:id`:
   - tìm hoặc quét để thêm hàng (quét trùng thì cộng số lượng);
   - bảng dòng: mã, tên + ghi chú tồn hiện tại và quy đổi, đơn vị (select), số lượng, giá nhập (mặc định = giá vốn hiện tại × factor), thành tiền, xóa;
   - panel phải: nhà cung cấp (combobox + tạo nhanh, hiển thị đang nợ), mã phiếu (tự sinh), ngày, ghi chú, tổng tiền, chiết khấu, cần trả, đã trả, còn nợ NCC, tổng nợ NCC sau phiếu;
   - Lưu nháp và Hoàn thành; phiếu đã hoàn thành chỉ xem, owner có nút Hủy phiếu (dialog xác nhận, hiển thị lỗi nếu hàng đã bán);
   - danh sách phiếu nhập (`/nhap-hang`): bảng đơn giản có lọc trạng thái và thời gian.
2. Kiểm kho:
   - tạo phiếu từ trang Hàng hóa (dialog chọn nhóm hoặc "các mặt hàng đang chọn");
   - `/kiem-kho/:id`: thanh tiến độ "Đã đếm x/y", tabs (Tất cả, Bị lệch, Chưa đếm), ô quét (mỗi lần quét +1 và cuộn tới dòng đó, highlight 1 giây), bảng (tồn hệ thống, ô thực tế, chênh lệch màu xanh/đỏ, giá trị lệch, lý do chỉ hiện khi lệch);
   - tự lưu (debounce 800ms) qua PATCH lines, hiển thị trạng thái "Đã lưu";
   - panel tổng hợp và nút "Hoàn thành và cân bằng kho" (dialog xác nhận, hiển thị cảnh báo tồn thay đổi từ server).

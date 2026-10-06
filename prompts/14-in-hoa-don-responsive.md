# Prompt 14 – In hóa đơn và hoàn thiện giao diện điện thoại

Thiết kế: `design/HoaDon.dc.html`.

1. Trang `/in/hoa-don/:id` render hóa đơn khổ 80mm theo thiết kế (tên cửa hàng, địa chỉ, SĐT, số HĐ, ngày giờ, thu ngân, khách, dòng hàng "SL x đơn giá" và thành tiền, tổng, khách trả, ghi nợ đơn này, tổng nợ hiện tại, dòng cảm ơn/footer). CSS `@media print` với `@page { size: 80mm auto; margin: 0 }`, chữ đen, không có giao diện app. Tự gọi `window.print()` khi mở từ POS (query `?auto=1`), đóng tab sau khi in.
2. Thêm khổ 58mm (cài đặt chọn khổ giấy) và khổ A5 cho phiếu nhập. Phiếu thu in tương tự.
3. Rà toàn bộ màn hình ở 375px, 768px, 1280px: không cuộn ngang trang (bảng cuộn trong khung riêng), menu chuyển sang tab bar dưới, dialog thành full-screen trên điện thoại, nút chính cố định đáy màn hình ở các form dài.
4. Accessibility: tab qua được mọi thao tác, focus ring rõ ràng, label đầy đủ, độ tương phản chữ ≥ 4.5:1. Sửa những chỗ chưa đạt.
5. Trạng thái loading (skeleton cho bảng), empty state có hướng dẫn (ví dụ: "Chưa có hàng hóa nào. Thêm hàng hoặc nhập từ Excel"), trang lỗi chung.

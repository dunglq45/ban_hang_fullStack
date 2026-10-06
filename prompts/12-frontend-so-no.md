# Prompt 12 – Màn hình Sổ nợ và Thu nợ

Thiết kế: `design/SoNo.dc.html`, `design/ThuNo.dc.html`.

1. `/so-no`: KpiStrip (tổng phải thu, quá 30 ngày, đã thu tháng này), tabs "Phải thu khách hàng" / "Phải trả nhà cung cấp" có đếm, bố cục 2 cột: danh sách (tìm, sắp xếp Dư nợ cao nhất / Nợ lâu nhất, mỗi dòng: tên, SĐT, số nợ, số ngày nợ; quá 30 ngày tô cam) và chi tiết của dòng đang chọn (`/so-no/:contactId`, trên điện thoại thì thành trang riêng).
2. Chi tiết: tên, mã, SĐT, địa chỉ; nút Gọi (`tel:`), Ghi nợ (mở POS với khách này), Thu nợ (với NCC: "Trả nợ"); ô số liệu: dư nợ, nợ từ ngày, hạn mức (còn lại), lần trả gần nhất; bảng sổ chi tiết công nợ (ngày, chứng từ bấm được, diễn giải, phát sinh nợ, đã trả, dư nợ), phân trang; nút Xuất Excel (sinh ở client).
3. Dialog Thu nợ theo thiết kế: dư nợ hiện tại, ô số tiền (mặc định = toàn bộ nợ), nút nhanh (Thu hết, các mức tròn), hình thức tiền mặt/chuyển khoản, ngày, ghi chú, dư nợ sau khi thu (về 0 hiển thị "Hết nợ" màu xanh), in phiếu thu. Idempotency key sinh khi mở dialog. Thành công → toast, cập nhật danh sách và chi tiết.
4. Sửa thông tin khách / NCC và hạn mức nợ (dialog).
5. Badge số khách đang nợ trên sidebar lấy từ debts/summary.

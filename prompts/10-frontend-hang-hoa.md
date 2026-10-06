# Prompt 10 – Màn hình Hàng hóa

Thiết kế: `design/HangHoa.dc.html`, `design/ThemHang.dc.html`, `design/ChiTietHang.dc.html`.

1. Danh sách `/hang-hoa`: tabs có đếm (Tất cả, Sắp hết, Hết hàng, Ngừng bán), tìm kiếm (debounce 300ms, đồng bộ lên URL query), lọc nhóm, sắp xếp, bảng (ô chọn, mã, tên, nhóm, đơn vị, giá vốn chỉ owner thấy, giá bán, tồn, trạng thái, menu thao tác), phân trang, dòng "Giá trị tồn kho" (owner). Bấm vào dòng mở chi tiết. Nút: Nhập từ Excel, Kiểm kho, Nhập hàng, Thêm hàng hóa.
2. Thêm/sửa `/hang-hoa/moi`, `/hang-hoa/:id/sua`: các phần Thông tin chung, Giá (tự tính lãi và %), Đơn vị tính (bảng quy đổi, thêm/xóa dòng), Tồn kho (tồn ban đầu chỉ có khi tạo mới), cột phải: ảnh (upload, xem trước), trạng thái, ghi chú. Nút "Lưu và thêm tiếp". Cảnh báo khi rời trang mà chưa lưu. Ô mã vạch hỗ trợ quét.
3. Chi tiết `/hang-hoa/:id`: KpiStrip (tồn, giá vốn BQ, giá bán và lãi, đã bán 30 ngày), tab Lịch sử kho (bảng movements có lọc loại và thời gian, mã chứng từ bấm được), tab Đơn vị và giá, tab Thông tin khác. Nút Ngừng bán/Bán lại, Sửa, Nhập thêm hàng (mở phiếu nhập có sẵn mặt hàng này).
4. Nhập từ Excel: dialog tải file mẫu (.xlsx sinh ở client bằng SheetJS), chọn file, xem trước 20 dòng đầu và báo lỗi từng dòng phía client bằng Zod, gửi theo lô 500 dòng, hiển thị kết quả (thành công / lỗi kèm lý do) và cho tải danh sách dòng lỗi.
5. Quản lý nhóm hàng đơn giản (dialog thêm, sửa, xóa) từ bộ lọc nhóm.

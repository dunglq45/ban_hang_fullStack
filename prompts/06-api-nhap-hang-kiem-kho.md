# Prompt 06 – Nhập hàng và kiểm kho

Đọc lại các mục "Nhập hàng", "Hủy chứng từ", "Kiểm kho" trong `docs/DATABASE.md`. Tái sử dụng hàm dựng batch đã viết ở prompt 05; nếu cần thì refactor phần chung (counter, lines, movements, debt) thành các builder dùng chung, nhưng không làm hỏng test cũ.

1. `purchaseService`: tạo phiếu (draft hoặc completed), hoàn thành phiếu nháp, hủy phiếu. Giá vốn bình quân tính trong câu UPDATE như tài liệu; phân bổ chiết khấu phiếu theo tỷ lệ thành tiền dòng. Phần chưa trả cộng nợ NCC. Phiếu nháp không ảnh hưởng tồn và nợ.
2. Hủy phiếu nhập: nếu làm tồn âm (hàng đã bán) và allow_negative = 0 thì báo `CANNOT_CANCEL_STOCK_USED` kèm danh sách mặt hàng. Giá vốn tính ngược như tài liệu.
3. `stockCountService`: tạo phiếu nháp (theo nhóm hoặc danh sách id), cập nhật dòng hàng loạt, scan barcode (+1 đơn vị hoặc +factor nếu là mã vạch thùng), hoàn thành (chênh lệch tính theo tồn hiện tại, dòng lệch bắt buộc có reason → `REASON_REQUIRED`), trả về cảnh báo những dòng mà tồn đã thay đổi kể từ lúc tạo phiếu.
4. Routes theo `docs/API.md`.
5. Test:
   - nhập 10 chai giá 30.000 khi tồn 10 chai giá vốn 20.000 → giá vốn 25.000;
   - nhập khi tồn âm (allow_negative) → công thức dùng MAX(stock, 0);
   - nhập theo thùng, phân bổ chiết khấu;
   - trả thiếu NCC → nợ NCC tăng;
   - hủy phiếu nhập khi hàng chưa bán → tồn, giá vốn, nợ trở về đúng; khi hàng đã bán hết → lỗi;
   - kiểm kho: đếm lệch +2, −1, khớp, chưa đếm → tồn sau hoàn thành đúng, movements `adjust` có note lý do; bán 1 món giữa lúc kiểm → chênh lệch tính theo tồn mới và có cảnh báo.

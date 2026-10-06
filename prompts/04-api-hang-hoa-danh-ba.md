# Prompt 04 – API hàng hóa, nhóm hàng, khách hàng và nhà cung cấp

Làm các route trong `docs/API.md` mục Nhóm hàng, Hàng hóa, Khách hàng và nhà cung cấp (trừ debt-entries và debts/summary, để prompt 07).

Yêu cầu:
1. Service `productService`:
   - create: mã tự sinh SP000001 nếu bỏ trống (dùng counters); mã trùng → `CODE_TAKEN`; barcode trùng trong cửa hàng (kể cả barcode của unit) → `BARCODE_TAKEN`; units `factor > 1`, tên unit không trùng nhau và không trùng base_unit; tồn đầu kỳ > 0 thì ghi thêm document type `stock_count` mã KK, completed, kèm stock_movements `adjust` note "Tồn đầu kỳ". Tất cả trong một batch.
   - update: không cho sửa stock và cost_price; cập nhật units theo kiểu thay thế toàn bộ (xóa cũ, thêm mới trong batch); luôn cập nhật `name_search`.
   - list: lọc `q` (qua toSearch), categoryId, status (`low`, `out`, `inactive`), sắp xếp, phân trang. Kèm `counts` cho các tab: all, low, out, inactive. Kèm `stockValue` = SUM(stock * cost_price) / 1000 (chỉ owner).
   - lookup barcode, danh sách POS (gọn: id, code, name, sale_price, stock, base_unit, units, category_id).
   - movements: phân trang, lọc type và thời gian, join documents để có mã chứng từ, join contacts để có tên đối tác.
   - import: nhận tối đa 500 dòng `{ code?, name, category, unit, costPrice, salePrice, stock, minStock, barcode? }`; tạo nhóm hàng nếu chưa có; dòng lỗi không làm hỏng dòng đúng (chia batch theo nhóm nhỏ); trả về kết quả từng dòng.
   - Ảnh: upload lên R2 key `${storeId}/products/${productId}-${uuid}.webp|jpg|png`, kiểm tra MIME và kích thước ≤ 2MB; route GET ảnh kiểm tra key thuộc storeId.
2. **Staff không nhận được `cost_price`, `stockValue`.** Viết một hàm serialize theo role, dùng ở mọi route trả product.
3. Contacts: CRUD, mã KH000001 / NCC000001, tìm theo tên/SĐT không dấu, sort `debt_desc`, `debt_since_asc`, lọc `hasDebt`, `overdueDays` (nợ từ trước N ngày).
4. Categories: CRUD, không xóa được khi còn hàng (`CATEGORY_IN_USE`).
5. Test: tạo hàng có units; tìm "nuoc mam" ra "Nước mắm 500ml"; lọc low/out đúng; staff không thấy cost_price; import 3 dòng (1 dòng lỗi) → 2 thành công; cô lập dữ liệu giữa 2 cửa hàng.

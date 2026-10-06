# Prompt 05 – Bán hàng và hủy hóa đơn (lõi quan trọng nhất)

Đọc lại kỹ mục "Bán hàng", "Hủy chứng từ" và "Sinh mã chứng từ trong batch" trong `docs/DATABASE.md`. Trước khi code, trình bày ngắn kế hoạch: danh sách câu lệnh trong batch theo đúng thứ tự, rồi mới làm.

Nhiệm vụ: `saleService.create` và `documentService.cancel` (phần bán), route `POST /api/sales`, `GET /api/documents`, `GET /api/documents/:id`, `POST /api/documents/:id/cancel`.

Yêu cầu:
1. Toàn bộ ghi trong MỘT `db.batch()`: counter, documents, document_lines (cost_price snapshot qua subquery), UPDATE products stock, stock_movements (stock_after qua subquery), contacts debt và debt_entries (balance_after qua subquery) nếu ghi nợ.
2. Idempotency theo `docs/DATABASE.md`; xử lý cả trường hợp 2 request cùng key gần như đồng thời (bắt lỗi UNIQUE rồi trả document đã có).
3. Lỗi: `OUT_OF_STOCK` (kèm details: productId, tên, tồn hiện tại, số yêu cầu), `DEBT_REQUIRES_CUSTOMER`, `DEBT_LIMIT_EXCEEDED` (owner gửi `force: true` để vượt), `PRODUCT_INACTIVE`, tối đa 200 dòng.
4. Giá bán do client gửi lên được chấp nhận (cho phép bán giá khác), nhưng staff không được bán thấp hơn giá vốn (`PRICE_BELOW_COST`, chỉ owner được phép).
5. Hủy hóa đơn bán: đảo tồn kho (movement type `cancel`), đảo công nợ, cập nhật `debt_since` đúng. Hủy lần 2 → `ALREADY_CANCELLED`.
6. GET document chi tiết trả đủ dữ liệu để in hóa đơn: thông tin cửa hàng, khách, dòng hàng (tên, đơn vị, số lượng, đơn giá, thành tiền), tổng, đã trả, ghi nợ, tổng nợ hiện tại của khách.
7. Test (bắt buộc, đầy đủ):
   - bán 3 món trả đủ: tồn giảm đúng, movement đúng stock_after, cost_price snapshot đúng, mã HD000001;
   - bán trả thiếu cho khách: debt tăng, debt_entries balance_after đúng, debt_since được set;
   - trả thiếu không chọn khách → lỗi; vượt hạn mức → lỗi; owner force → được;
   - bán vượt tồn (allow_negative = 0) → OUT_OF_STOCK và KHÔNG có bất kỳ thay đổi nào trong DB (kiểm tra counters, documents, products);
   - allow_negative = 1 → cho phép âm;
   - bán theo đơn vị Thùng (factor 24) trừ đúng 24 đơn vị cơ bản; bán 0,5 kg;
   - cùng idempotencyKey gửi 2 lần → 1 hóa đơn;
   - hủy → tồn và nợ trở về như trước; hủy 2 lần → lỗi.

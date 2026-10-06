# Prompt 15 – Kiểm thử đầu cuối, rà soát và deploy

1. Cài Playwright, viết E2E cho các luồng chính trên dữ liệu seed:
   - đăng ký cửa hàng mới → thêm 2 hàng → nhập hàng → bán trả đủ → bán ghi nợ → thu nợ → kiểm tra Tổng quan;
   - quét mã vạch (giả lập gõ nhanh + Enter) thêm hàng vào đơn;
   - staff không thấy giá vốn, không vào được Tổng quan;
   - hủy hóa đơn, kiểm tra tồn và nợ trở lại.
2. Rà soát bảo mật và để lại báo cáo `docs/SECURITY-REVIEW.md`:
   - mọi route đều lọc store_id (grep tìm query không qua repository);
   - mọi route ghi đều có requireAuth và đúng phân quyền;
   - không lộ cost_price cho staff ở bất kỳ response nào;
   - cookie flags, CSRF header, giới hạn đăng nhập, kích thước upload.
3. Rà hiệu năng: EXPLAIN QUERY PLAN các query danh sách và báo cáo, đảm bảo dùng index; thêm index nếu thiếu.
4. Deploy:
   - hướng dẫn tôi từng lệnh: tạo D1 và R2 production, điền database_id vào wrangler config, `db:migrate:remote`, `deploy`, gắn custom domain;
   - thiết lập môi trường `preview` riêng (D1 riêng) trong wrangler config;
   - viết GitHub Actions: chạy typecheck, lint, test khi có PR; deploy production khi merge vào main (dùng secret CLOUDFLARE_API_TOKEN, chạy migrate remote trước deploy).
5. Viết `docs/VAN-HANH.md`: backup D1 (export định kỳ, khôi phục bằng Time Travel), xem log, quy trình thêm migration an toàn.

# Prompt 02 – Database schema, migration, seed

Đọc lại `docs/DATABASE.md`.

Nhiệm vụ:
1. Viết `src/worker/db/schema.ts` bằng Drizzle cho TẤT CẢ các bảng, index, ràng buộc UNIQUE và CHECK trong `docs/DATABASE.md`. Nếu Drizzle không biểu diễn được một ràng buộc (ví dụ CHECK nhiều cột), sửa tay file migration SQL sinh ra và ghi chú lại.
2. Sinh migration đầu tiên bằng drizzle-kit, áp dụng vào D1 local. Đảm bảo vitest-pool-workers tự áp migration trước khi chạy test.
3. Viết helper trong `src/shared`:
   - `qty.ts`: `toMilli(n: number)`, `fromMilli(m: number)`, `formatQty(milli, unit)`. Làm tròn an toàn, test với 0.5, 1.25, 1000.
   - `money.ts`: `formatVnd(n)` theo `vi-VN` (100.000), `parseVnd("100.000") → 100000`.
   - `text.ts`: `removeDiacritics`, `toSearch` (đ→d, lowercase, gộp khoảng trắng).
   - `src/worker/lib/uuid.ts`: uuidv7.
   - `src/worker/lib/codes.ts`: hàm trả về 2 câu lệnh D1 (tăng counter + subquery lấy mã) như mô tả "Sinh mã chứng từ trong batch".
4. `src/worker/db/client.ts`: `getDb(env, storeId)` trả về object repository có gắn sẵn storeId (để sau này shard). Repository không nhận storeId từ bên ngoài sau khi tạo.
5. Script seed cho môi trường dev (`pnpm db:seed:local`): 1 cửa hàng "Tạp hóa Minh Anh", owner SĐT 0900000001 / mật khẩu `123456`, 1 staff, 6 nhóm hàng, khoảng 30 mặt hàng (lấy tên và giá từ các file trong `design/`), 6 khách hàng, 2 nhà cung cấp, vài hóa đơn và phiếu nhập mẫu tạo qua service khi service đã có (tạm thời chỉ seed danh mục).
6. Test đơn vị cho `qty`, `money`, `text`, `codes` (codes: chạy 2 batch liên tiếp ra HD000001, HD000002; 2 cửa hàng có bộ đếm riêng).

Hoàn thành khi migration chạy sạch trên DB mới, test qua, typecheck qua.

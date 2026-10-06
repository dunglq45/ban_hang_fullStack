# Database (D1) và quy tắc nghiệp vụ

Schema dưới đây là bản thiết kế logic. Viết lại bằng Drizzle trong `src/worker/db/schema.ts` và sinh migration bằng drizzle-kit.
Quy ước: `id` TEXT (UUIDv7), thời gian INTEGER (epoch ms), tiền INTEGER (VND), số lượng INTEGER (milli).

## Bảng

```sql
CREATE TABLE stores (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT,
  address TEXT,
  receipt_footer TEXT,              -- dòng cuối hóa đơn in
  created_at INTEGER NOT NULL
);

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id),
  phone TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,      -- "pbkdf2$100000$<salt b64>$<hash b64>"
  role TEXT NOT NULL CHECK (role IN ('owner','staff')),
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,              -- sha256(token) dạng hex
  user_id TEXT NOT NULL REFERENCES users(id),
  store_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  remember INTEGER NOT NULL DEFAULT 0, -- 1: cookie 30 ngày; 0: cookie phiên
  created_at INTEGER NOT NULL
);

CREATE TABLE login_attempts (
  phone TEXT NOT NULL,
  at INTEGER NOT NULL
);
CREATE INDEX idx_login_attempts ON login_attempts (phone, at);

CREATE TABLE counters (             -- sinh mã chứng từ
  store_id TEXT NOT NULL,
  kind TEXT NOT NULL,               -- 'HD','PN','PT','PC','KK','SP','KH','NCC'
  value INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (store_id, kind)
);

CREATE TABLE categories (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE products (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL,
  code TEXT NOT NULL,               -- SP000001, tự sinh nếu bỏ trống
  barcode TEXT,
  name TEXT NOT NULL,
  name_search TEXT NOT NULL,        -- bỏ dấu + lowercase + code + barcode
  category_id TEXT,
  base_unit TEXT NOT NULL,          -- 'Chai', 'Gói', 'Kg'
  cost_price INTEGER NOT NULL DEFAULT 0,   -- giá vốn bình quân / 1 đơn vị cơ bản
  sale_price INTEGER NOT NULL DEFAULT 0,   -- giá bán / 1 đơn vị cơ bản
  stock INTEGER NOT NULL DEFAULT 0,        -- milli đơn vị cơ bản
  min_stock INTEGER NOT NULL DEFAULT 0,    -- milli
  allow_negative INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  show_in_pos INTEGER NOT NULL DEFAULT 1,
  image_key TEXT,
  note TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  CHECK (stock >= 0 OR allow_negative = 1),
  UNIQUE (store_id, code)
);
CREATE INDEX idx_products_search ON products (store_id, is_active, name_search);
CREATE INDEX idx_products_barcode ON products (store_id, barcode);

CREATE TABLE product_units (        -- đơn vị quy đổi (Thùng = 24 Chai)
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL,
  product_id TEXT NOT NULL REFERENCES products(id),
  name TEXT NOT NULL,
  factor INTEGER NOT NULL CHECK (factor > 1),  -- số đơn vị cơ bản (nguyên)
  sale_price INTEGER,
  barcode TEXT
);
CREATE INDEX idx_units_product ON product_units (store_id, product_id);
CREATE INDEX idx_units_barcode ON product_units (store_id, barcode);

CREATE TABLE contacts (             -- khách hàng và nhà cung cấp
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('customer','supplier')),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  name_search TEXT NOT NULL,
  phone TEXT,
  address TEXT,
  note TEXT,
  debt INTEGER NOT NULL DEFAULT 0,  -- customer: khách nợ mình; supplier: mình nợ NCC
  debt_limit INTEGER,               -- NULL = không giới hạn
  debt_since INTEGER,               -- thời điểm bắt đầu có nợ (NULL khi debt = 0)
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (store_id, code)
);
CREATE INDEX idx_contacts_search ON contacts (store_id, type, name_search);
CREATE INDEX idx_contacts_debt ON contacts (store_id, type, debt);

CREATE TABLE documents (            -- hóa đơn bán, phiếu nhập, trả hàng, kiểm kho
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('sale','purchase','sale_return','purchase_return','stock_count')),
  code TEXT NOT NULL,               -- HD000231, PN000058, KK000013
  contact_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('draft','completed','cancelled')),
  subtotal INTEGER NOT NULL DEFAULT 0,
  discount INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL DEFAULT 0,
  paid INTEGER NOT NULL DEFAULT 0,
  debt_amount INTEGER NOT NULL DEFAULT 0,  -- = total - paid (ghi nợ)
  payment_method TEXT CHECK (payment_method IN ('cash','transfer')),
  note TEXT,
  idempotency_key TEXT,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  completed_at INTEGER,
  cancelled_at INTEGER,
  cancelled_by TEXT,
  UNIQUE (store_id, code),
  UNIQUE (store_id, idempotency_key)
);
CREATE INDEX idx_documents_list ON documents (store_id, type, status, created_at);
CREATE INDEX idx_documents_contact ON documents (store_id, contact_id, created_at);

CREATE TABLE document_lines (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL,
  document_id TEXT NOT NULL REFERENCES documents(id),
  product_id TEXT NOT NULL,
  unit_name TEXT NOT NULL,
  factor INTEGER NOT NULL DEFAULT 1,
  qty INTEGER NOT NULL,             -- milli, theo đơn vị đã chọn
  base_qty INTEGER NOT NULL,        -- milli đơn vị cơ bản = qty * factor
  unit_price INTEGER NOT NULL,      -- giá theo đơn vị đã chọn
  line_total INTEGER NOT NULL,
  cost_price INTEGER NOT NULL DEFAULT 0,  -- giá vốn / đơn vị cơ bản tại thời điểm ghi
  system_qty INTEGER,               -- kiểm kho: tồn hệ thống (milli)
  actual_qty INTEGER,               -- kiểm kho: thực tế (milli), NULL = chưa đếm
  reason TEXT                       -- kiểm kho: lý do lệch
);
CREATE INDEX idx_lines_doc ON document_lines (store_id, document_id);
CREATE INDEX idx_lines_product ON document_lines (store_id, product_id);

CREATE TABLE stock_movements (      -- sổ cái kho, chỉ INSERT
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  document_id TEXT NOT NULL,
  type TEXT NOT NULL,               -- sale, purchase, sale_return, purchase_return, adjust, cancel
  qty_change INTEGER NOT NULL,      -- milli, + nhập / - xuất
  stock_after INTEGER NOT NULL,     -- milli
  unit_cost INTEGER NOT NULL,
  note TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_movements_product ON stock_movements (store_id, product_id, created_at);

CREATE TABLE payments (             -- phiếu thu (thu nợ khách) / phiếu chi (trả nợ NCC)
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('receipt','disbursement')),
  code TEXT NOT NULL,               -- PT000045 / PC000012
  contact_id TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK (amount > 0),
  method TEXT NOT NULL CHECK (method IN ('cash','transfer')),
  note TEXT,
  status TEXT NOT NULL CHECK (status IN ('completed','cancelled')),
  idempotency_key TEXT,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  cancelled_at INTEGER,
  UNIQUE (store_id, code),
  UNIQUE (store_id, idempotency_key)
);

CREATE TABLE debt_entries (         -- sổ cái công nợ, chỉ INSERT
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL,
  contact_id TEXT NOT NULL,
  document_id TEXT,
  payment_id TEXT,
  amount INTEGER NOT NULL,          -- + tăng nợ / - giảm nợ
  balance_after INTEGER NOT NULL,
  note TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_debt_contact ON debt_entries (store_id, contact_id, created_at);
```

## Quy tắc nghiệp vụ

### Sinh mã chứng từ trong batch
Câu đầu tiên của batch tăng bộ đếm; các câu sau lấy mã bằng subquery (batch chạy tuần tự nên thấy giá trị mới):
```sql
INSERT INTO counters (store_id, kind, value) VALUES (?1, 'HD', 1)
  ON CONFLICT (store_id, kind) DO UPDATE SET value = value + 1;

INSERT INTO documents (id, store_id, code, ...)
VALUES (?, ?1, (SELECT 'HD' || printf('%06d', value) FROM counters WHERE store_id = ?1 AND kind = 'HD'), ...);
```
Sau batch, đọc lại document để trả về mã.

### Bán hàng (`sale`)
Input: lines (productId, unitName/factor, qty, unitPrice), contactId?, discount, paid, paymentMethod, idempotencyKey.
1. Kiểm tra idempotencyKey; nếu đã tồn tại thì trả document cũ.
2. Đọc products liên quan (để lấy giá vốn hiện tại và validate). Đây là lượt đọc duy nhất trước batch, chỉ dùng để tính toán, KHÔNG dùng để quyết định tồn kho.
3. Tính `subtotal`, `total = subtotal - discount`, `debt_amount = max(total - paid, 0)`. Nếu `debt_amount > 0` thì bắt buộc có contactId (khách lẻ không được ghi nợ). Nếu khách có debt_limit và `debt + debt_amount > debt_limit` thì báo lỗi `DEBT_LIMIT_EXCEEDED` (owner được phép ghi đè bằng cờ `force`).
4. Batch:
   - tăng counter HD, INSERT documents (status completed)
   - với mỗi line: INSERT document_lines (cost_price = products.cost_price qua subquery);
     `UPDATE products SET stock = stock - ?base_qty, updated_at = ? WHERE id = ? AND store_id = ?`;
     INSERT stock_movements với `stock_after` = subquery `SELECT stock FROM products WHERE id = ?`
   - nếu debt_amount > 0:
     `UPDATE contacts SET debt = debt + ?, debt_since = COALESCE(debt_since, ?) WHERE ...`;
     INSERT debt_entries (balance_after = subquery debt)
5. Nếu batch lỗi do CHECK `stock >= 0` thì trả lỗi `OUT_OF_STOCK` (message: "Không đủ hàng trong kho"). Xác định mặt hàng thiếu bằng cách so tồn hiện tại với số yêu cầu.
6. Tiền thừa trả khách = `paid - total` nếu dương, tính ở client và không lưu (lưu `paid = min(paid, total)`).

### Nhập hàng (`purchase`)
Giống bán hàng nhưng cộng tồn, contact là supplier, mã PN. Giá vốn bình quân tính TRƯỚC khi cộng tồn, trong cùng câu UPDATE:
```sql
UPDATE products SET
  cost_price = CASE WHEN MAX(stock, 0) + ?in_qty > 0
    THEN CAST(ROUND((MAX(stock, 0) * cost_price + ?in_qty * ?in_unit_cost) * 1.0 / (MAX(stock, 0) + ?in_qty)) AS INTEGER)
    ELSE ?in_unit_cost END,
  stock = stock + ?in_qty,
  updated_at = ?
WHERE id = ? AND store_id = ?;
```
`in_unit_cost` = giá nhập mỗi đơn vị cơ bản sau khi phân bổ chiết khấu phiếu theo tỷ lệ thành tiền dòng = `round(line_total_after_discount / (base_qty/1000))`.
Phần chưa trả cộng vào `contacts.debt` của nhà cung cấp và ghi debt_entries.

### Hủy chứng từ
- Chỉ owner. Chỉ hủy được status `completed`.
- Hủy bán: cộng lại tồn, stock_movements type `cancel`, trừ nợ khách bằng số debt_amount (debt_entries âm). Không đổi giá vốn.
- Hủy nhập: trừ tồn (có thể vi phạm CHECK nếu hàng đã bán, khi đó báo lỗi rõ ràng). Giá vốn tính ngược: nếu `stock - q > 0` thì `cost = round((stock*cost - q*in_cost)/(stock - q))`, ngược lại giữ nguyên. Trừ nợ NCC.
- Cập nhật `contacts.debt_since = NULL` khi debt về 0 (`CASE WHEN debt - ? <= 0 THEN NULL ELSE debt_since END`).

### Thu nợ / trả nợ NCC (`payments`)
- receipt: contact phải là customer, `amount <= debt` (không cho thu quá nợ). Batch: counter PT, INSERT payments, UPDATE contacts debt, INSERT debt_entries âm.
- disbursement: tương tự cho supplier, mã PC.
- Hủy phiếu: đảo lại.

### Kiểm kho (`stock_count`)
- Tạo phiếu nháp với danh sách hàng (theo nhóm hoặc chọn tay). `system_qty` chụp lại tồn lúc tạo.
- Cập nhật `actual_qty` và `reason` khi đang draft (cho phép sửa).
- Hoàn thành: với mỗi dòng có actual_qty khác NULL, chênh lệch = `actual_qty - tồn hiện tại`. Lưu ý dùng tồn hiện tại tại thời điểm hoàn thành, không dùng system_qty, vì giữa lúc đếm có thể đã bán hàng. Hiển thị cảnh báo nếu tồn đã đổi. Ghi `UPDATE products SET stock = stock + diff`, stock_movements type `adjust` có `note = reason`.
- Dòng lệch ≠ 0 bắt buộc có reason.

### Tìm kiếm
`name_search` = `toSearch(name + ' ' + code + ' ' + (barcode ?? ''))` với toSearch: lowercase, bỏ dấu, đ→d, gộp khoảng trắng.
Với `contacts`: `toSearch(name + ' ' + code + ' ' + (phone ?? ''))`. Dùng `productSearchText` / `contactSearchText` trong `src/shared/text.ts`, không tự ghép chuỗi.
Query: `name_search LIKE '%' || ? || '%'` với q đã toSearch. Tra mã vạch: khớp chính xác products.barcode hoặc product_units.barcode (trả về luôn đơn vị).

### Cảnh báo hàng
- Sắp hết: `stock > 0 AND stock <= min_stock` (min_stock > 0).
- Hết hàng: `stock <= 0`.

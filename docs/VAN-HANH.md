# Vận hành

Tài liệu cho người triển khai và vận hành ứng dụng trên Cloudflare: deploy lần đầu, môi trường
preview, CI/CD, sao lưu và khôi phục D1, xem log, thêm migration an toàn.

Quy ước lệnh: chạy ở thư mục gốc dự án. `pnpm exec wrangler ...` dùng đúng phiên bản wrangler của dự án.

> **Lưu ý `pnpm deploy`:** `deploy` là lệnh có sẵn của pnpm (deploy workspace), không phải script
> của dự án. Luôn gõ **`pnpm run deploy`** / **`pnpm run deploy:preview`**.

## 1. Deploy lần đầu

### 1.1. Chuẩn bị

1. Tài khoản Cloudflare. Nên dùng gói **Workers Paid** (5 USD/tháng): gói Free giới hạn khoảng
   50 truy vấn D1 cho mỗi request, một hóa đơn nhiều dòng (mỗi dòng ~3 câu lệnh trong batch) có thể
   vượt giới hạn. Xem lại bảng giới hạn hiện hành ở trang D1 Limits của Cloudflare trước khi chọn gói.
2. Đăng nhập wrangler trên máy (mở trình duyệt để xác nhận):
   ```sh
   pnpm exec wrangler login
   pnpm exec wrangler whoami      # kiểm tra đúng tài khoản, ghi lại Account ID
   ```

### 1.2. Tạo D1 và R2

```sh
# Production
pnpm exec wrangler d1 create store-app-db
pnpm exec wrangler r2 bucket create store-app-images

# Preview (dữ liệu riêng, dùng để thử trước khi lên production)
pnpm exec wrangler d1 create store-app-db-preview
pnpm exec wrangler r2 bucket create store-app-images-preview

# Bucket chứa file sao lưu D1 (workflow backup.yml)
pnpm exec wrangler r2 bucket create store-app-backups
```

Mỗi lệnh `d1 create` in ra một `database_id`. Mở `wrangler.jsonc`, thay UUID toàn số 0:

- `d1_databases[0].database_id` (cấp trên cùng) ← id của `store-app-db`;
- `env.preview.d1_databases[0].database_id` ← id của `store-app-db-preview`.

`database_id` không phải bí mật, commit vào git bình thường. Sau đó:

```sh
pnpm cf-typegen        # không đổi binding nên type giữ nguyên, chạy cho chắc
pnpm typecheck && pnpm test
```

Đặt lifecycle cho bucket sao lưu (xóa file cũ sau 90 ngày): Dashboard → R2 → `store-app-backups`
→ Settings → Object lifecycle rules → Add rule, prefix `d1/`, xóa sau 90 ngày.

### 1.3. Tạo bảng (migration) và deploy

```sh
pnpm db:migrate:remote          # production: áp dụng migrations/*.sql vào store-app-db
pnpm run deploy                 # build + wrangler deploy → Worker "store-app"

pnpm db:migrate:preview         # preview
pnpm run deploy:preview         # Worker "store-app-preview"
```

Wrangler in ra địa chỉ dạng `https://store-app.<tài-khoản>.workers.dev`. Kiểm tra:

1. Mở `https://.../api/health` → `{"ok":true}`.
2. Mở trang chủ, **Đăng ký cửa hàng** thật, thêm 1 hàng, bán 1 hóa đơn, in thử.
3. Giới hạn đăng nhập theo IP (binding Rate Limiting, 20 lần/phút/IP): gửi hơn 20 request đăng nhập
   trong 1 phút từ cùng máy, **mỗi lần một SĐT khác nhau** (cùng một SĐT thì từ lần sai thứ 6 đã gặp
   "nhập sai quá nhiều lần" trước). Dễ nhất bằng script, ví dụ trong Git Bash:
   ```sh
   for i in $(seq 1 25); do
     curl -s -o /dev/null -w "%{http_code} " -X POST https://store-app.<tài-khoản>.workers.dev/api/auth/login \
       -H "Content-Type: application/json" -H "X-Requested-With: fetch" \
       -d "{\"phone\":\"09000099$(printf %02d $i)\",\"password\":\"sai123\"}"
   done
   ```
   Phải thấy mã `429` ở các lần cuối (trước đó là `401`). Rate Limiting của Cloudflare đếm gần đúng và
   theo từng location nên ngưỡng có thể lệch vài lần. Không thấy `429` thì kiểm tra binding ở
   Dashboard → Workers → store-app → Settings → Bindings.
4. Cron dọn dữ liệu (03:00 giờ VN): Dashboard → Workers → store-app → Settings → Triggers có
   `0 20 * * *`; hôm sau xem tab Logs có lượt chạy `scheduled`.
5. Thử một hóa đơn 30–50 dòng để chắc không chạm giới hạn truy vấn D1 của gói đang dùng.

### 1.4. Gắn tên miền riêng

Tên miền phải đang quản lý DNS ở Cloudflare (đã thêm vào tài khoản, đổi nameserver xong).

Cách 1 (khuyên dùng, lưu trong git): bỏ comment dòng `routes` trong `wrangler.jsonc`:

```jsonc
"routes": [{ "pattern": "app.ten-mien-cua-ban.vn", "custom_domain": true }],
```

rồi `pnpm run deploy`. Cloudflare tự tạo bản ghi DNS và chứng chỉ HTTPS (vài phút).

Cách 2: Dashboard → Workers → store-app → Settings → Domains & Routes → Add → Custom domain.
(Nếu làm theo cách 2 thì lần deploy sau không xóa, nhưng cấu hình không nằm trong git.)

Có thể tắt địa chỉ `*.workers.dev` sau khi tên miền chạy ổn: thêm `"workers_dev": false` cấp trên cùng.

### 1.5. GitHub Actions

Ba workflow trong `.github/workflows/`:

| File | Khi nào | Làm gì |
|---|---|---|
| `ci.yml` | Mỗi Pull Request; được `deploy.yml` gọi lại | `typecheck`, `lint`, `test`; job riêng chạy E2E Playwright |
| `deploy.yml` | Push/merge vào `main` → production; chạy tay để chọn `preview` (production chạy tay chỉ được từ `main`) | Toàn bộ `ci.yml` (kể cả E2E) → build → **migration remote** → `wrangler deploy` |
| `backup.yml` | 04:00 giờ VN mỗi ngày; chạy tay được | Export D1 production → nén → cất vào R2 `store-app-backups/d1/` |

`deploy.yml` và `backup.yml` **chỉ chạy khi biến `DEPLOY_ENABLED` = `true`** (GitHub → Settings →
Secrets and variables → Actions → tab Variables → New repository variable). Chỉ đặt biến này sau
khi đã điền `database_id` thật vào `wrangler.jsonc` và tạo secrets bên dưới; trước đó push lên `main`
không deploy gì. Token Cloudflare chỉ được đưa vào đúng các bước migrate/deploy/export.

Repo đang commit thẳng lên `main` thì CI chỉ chạy qua `deploy.yml` (vẫn đủ test + E2E trước khi
deploy). Nên chuyển sang làm việc qua Pull Request để CI chạy trước khi merge.

Tạo secrets (GitHub → repo → Settings → Secrets and variables → Actions → New repository secret):

- `CLOUDFLARE_ACCOUNT_ID`: Account ID (lệnh `wrangler whoami` hoặc trang tổng quan Cloudflare).
- `CLOUDFLARE_API_TOKEN`: Cloudflare → My Profile → API Tokens → Create Token → mẫu
  **Edit Cloudflare Workers**, thêm quyền **Account · D1 · Edit** và **Account · Workers R2 Storage · Edit**;
  nếu gắn tên miền riêng thêm **Zone · Workers Routes · Edit** cho zone đó. Giới hạn token vào đúng
  tài khoản (và zone).

Khuyến nghị: GitHub → Settings → Branches → bảo vệ `main`, bắt buộc check `CI` qua trước khi merge;
Settings → Environments → `production` thêm "Required reviewers" nếu muốn duyệt tay trước khi deploy.

## 2. Sao lưu và khôi phục D1

D1 có hai lớp bảo vệ:

1. **Time Travel** (có sẵn, không cần cấu hình): khôi phục database về bất kỳ phút nào trong
   30 ngày gần nhất (gói Paid; gói Free 7 ngày). Dùng khi lỡ tay/lỗi code làm hỏng dữ liệu gần đây.
2. **Export định kỳ** (`backup.yml`): file SQL đầy đủ mỗi ngày, giữ lâu hơn Time Travel, dùng khi
   cần dữ liệu cũ hơn 30 ngày hoặc chuyển sang database khác.

### 2.1. Time Travel

```sh
# Xem bookmark hiện tại (nên ghi lại trước mỗi lần migration hoặc thao tác lớn)
pnpm exec wrangler d1 time-travel info store-app-db

# Bookmark tại một thời điểm (giờ UTC hoặc Unix timestamp). VD 14:30 giờ VN ngày 07/10/2026:
pnpm exec wrangler d1 time-travel info store-app-db --timestamp=2026-10-07T07:30:00Z

# Khôi phục (GHI ĐÈ toàn bộ database, mọi cửa hàng). Lệnh in ra bookmark "trước khi khôi phục"
# để hoàn tác nếu chọn nhầm thời điểm.
pnpm exec wrangler d1 time-travel restore store-app-db --bookmark=<bookmark>
pnpm exec wrangler d1 time-travel restore store-app-db --timestamp=2026-10-07T07:30:00Z
```

Lưu ý: một database dùng chung cho mọi cửa hàng, khôi phục là quay lại **cả hệ thống**, mất mọi giao
dịch sau thời điểm đó của tất cả cửa hàng. Nếu chỉ một cửa hàng hỏng dữ liệu, cân nhắc khôi phục ra
database tạm (mục 2.3) rồi chép riêng dữ liệu của cửa hàng đó.

### 2.2. Export thủ công

```sh
pnpm exec wrangler d1 export store-app-db --remote --output=backup-$(date +%Y%m%d).sql
```

Export làm database phản hồi chậm trong lúc chạy: chọn giờ vắng. Tải file sao lưu tự động về:
Dashboard → R2 → `store-app-backups` → `d1/` → tải file `.sql.gz`, hoặc
`pnpm exec wrangler r2 object get store-app-backups/d1/<tên-file> --file=<tên-file> --remote`.

### 2.3. Khôi phục từ file export

Không nạp đè vào database đang chạy. Tạo database mới, nạp vào, kiểm tra, rồi mới chuyển:

```sh
gunzip store-app-db-20261007-2100.sql.gz
pnpm exec wrangler d1 create store-app-db-restore
pnpm exec wrangler d1 execute store-app-db-restore --remote --file=store-app-db-20261007-2100.sql
pnpm exec wrangler d1 execute store-app-db-restore --remote --command="SELECT COUNT(*) FROM documents"
```

Muốn dùng hẳn database này: đổi `database_id` (và `database_name`) cấp trên cùng của `wrangler.jsonc`
sang database mới, `pnpm run deploy`. Migration đã có sẵn trong file export (bảng `d1_migrations`).

Nên tập khôi phục thử vào database tạm mỗi quý một lần để chắc file sao lưu dùng được.

## 3. Xem log

- **Trực tiếp** (stream log khi đang có request):
  ```sh
  pnpm exec wrangler tail store-app                    # production
  pnpm exec wrangler tail store-app-preview            # preview
  pnpm exec wrangler tail store-app --status error     # chỉ request lỗi
  ```
- **Lịch sử**: `observability.enabled = true` trong `wrangler.jsonc` → Dashboard → Workers →
  store-app → **Logs** (Workers Logs, lọc theo thời gian, status, nội dung; lưu vài ngày tùy gói).
- Lỗi không lường trước được middleware ghi `console.error("Lỗi không xử lý được:", method, path, ...)`
  (đã che mật khẩu/token); lỗi nghiệp vụ (`AppError`) không ghi log vì là phản hồi bình thường.
- Chỉ số: Dashboard → Workers → store-app → Metrics (số request, lỗi, CPU); D1 → store-app-db →
  Metrics (số truy vấn, dung lượng, truy vấn chậm trong "Insights").

## 4. Quy trình thêm migration an toàn

Workflow `deploy.yml` chạy migration **trước** khi code mới lên. Trong vài chục giây giữa hai bước,
code cũ đang chạy với schema mới, nên mọi migration phải **tương thích ngược** với code đang chạy.

### 4.1. Được làm trong một lần deploy

- Thêm bảng mới, thêm index (`CREATE INDEX`), thêm cột cho phép NULL hoặc có `DEFAULT`.
- Thêm dữ liệu (INSERT) không ảnh hưởng code cũ.

### 4.2. Phải tách thành nhiều lần deploy (mở rộng → chuyển → thu gọn)

- **Đổi tên/xóa cột, đổi kiểu, thêm `NOT NULL` không default**:
  1. Deploy A: thêm cột mới (nullable), code ghi cả cột cũ và mới.
  2. Chạy câu lệnh chép dữ liệu cũ sang cột mới (migration riêng).
  3. Deploy B: code chỉ đọc/ghi cột mới.
  4. Deploy C: migration xóa cột cũ.
- Drizzle-kit với SQLite có thể sinh kiểu "tạo bảng mới → chép dữ liệu → xóa bảng cũ → đổi tên" cho
  các thay đổi mà `ALTER TABLE` không làm được. Với bảng lớn (`documents`, `document_lines`,
  `stock_movements`, `debt_entries`) việc này chậm và khóa ghi: **đọc kỹ file SQL sinh ra**, tránh nếu được.

### 4.3. Các bước

1. Sửa `src/worker/db/schema.ts`.
2. `pnpm db:generate` → đổi tên file trong `migrations/` cho dễ hiểu (sửa `tag` tương ứng trong
   `migrations/meta/_journal.json`). **Đọc file SQL**: đúng ý định, không có `DROP` ngoài dự kiến.
3. `pnpm db:migrate:local`, chạy app, `pnpm typecheck && pnpm test` (test tự áp dụng mọi migration
   vào D1 test). Nếu là index cho truy vấn danh sách/báo cáo, test `test/db/query-plans.test.ts` cho
   biết kế hoạch truy vấn có dùng index không.
4. Không bao giờ sửa file migration đã chạy ở production; muốn sửa thì thêm migration mới.
5. Mở PR → CI xanh → deploy **preview** (Actions → Deploy → Run workflow → `preview`), thử trên bản preview.
6. Ghi lại bookmark Time Travel của production (`wrangler d1 time-travel info store-app-db`).
7. Merge vào `main` → `deploy.yml` tự chạy migration rồi deploy. Theo dõi tab Actions và log (mục 3).
8. Có sự cố: deploy lại commit trước (Dashboard → Workers → store-app → Deployments → Rollback, hoặc
   revert commit); nếu migration làm hỏng dữ liệu thì Time Travel về bookmark ở bước 6.

## 5. Chạy kiểm thử E2E (Playwright)

```sh
pnpm test:e2e
```

Tự khởi động `vite dev` ở cổng 5180 với D1 local riêng `.wrangler/e2e` (xóa và nạp lại seed
"Tạp hóa Minh Anh" mỗi lần chạy, không đụng dữ liệu của `pnpm dev`), dùng Chrome cài trên máy.
Kịch bản ở `e2e/`: luồng chính cửa hàng mới, quét mã vạch, quyền nhân viên, hủy hóa đơn.
Lỗi thì xem ảnh chụp và trace trong `test-results/` (`pnpm exec playwright show-trace <file>`).

# Tiến độ dự án

Cập nhật sau mỗi giai đoạn bằng lệnh /phase. Phiên mới đọc file này để biết trạng thái.

| Giai đoạn | Trạng thái | Ghi chú |
|---|---|---|
| 00 Cài đặt môi trường | Xong | Node 22.15.1, pnpm 10.34.6, jq 1.8.2; các hook đã kiểm tra đạt |
| 01 Khởi tạo dự án | Xong | Vite 8 + @cloudflare/vite-plugin, Hono, React 19, Tailwind 4, Vitest 4.1 + pool-workers; /api/health + trang Hello qua hc<AppType> |
| 02 Database | Xong | Schema Drizzle 14 bảng + migration `0000_init.sql`; helper qty/money/text/codes/uuid/password; `getDb(env, storeId)`; seed `pnpm db:seed:local`; 40 test |
| 03 API nền tảng, auth | Xong | AppError + middleware lỗi/CSRF/session/requireAuth/requireOwner/rateLimit; /api/auth/*, /api/store, /api/users; migration `0001_session_remember.sql`; Cron dọn dữ liệu đăng nhập; helper test 2 cửa hàng; 82 test |
| 04 API hàng hóa, danh bạ | Xong | /api/categories, /api/products (list/lookup/pos/detail/movements/create/update/import/image), /api/images, /api/contacts; serialize theo role; 125 test |
| 05 API bán hàng | Chưa làm | |
| 06 API nhập hàng, kiểm kho | Chưa làm | |
| 07 API công nợ, báo cáo | Chưa làm | |
| 08 Frontend nền tảng | Chưa làm | |
| 09 Bán hàng (POS) | Chưa làm | |
| 10 Hàng hóa | Chưa làm | |
| 11 Nhập hàng, kiểm kho | Chưa làm | |
| 12 Sổ nợ | Chưa làm | |
| 13 Tổng quan, cài đặt | Chưa làm | |
| 14 In hóa đơn, responsive | Chưa làm | |
| 15 Kiểm thử, deploy | Chưa làm | |

## Quyết định quan trọng

- Hook gọi qua `bash "${CLAUDE_PROJECT_DIR}/..."` (có ngoặc kép) để chạy đúng trên Windows/Git Bash với đường dẫn chứa `\`.
- `.gitattributes` ép `*.sh` dùng LF vì máy dev bật `core.autocrlf=true`.
- Dùng pnpm 10, không dùng 12: corepack đi kèm Node 22.15 chưa chạy được pnpm 12 (bản viết bằng Rust).
- Shim pnpm và `jq.exe` đặt ở `%LOCALAPPDATA%\bin` (đã thêm vào PATH người dùng), vì thư mục Node của nvm chỉ Admin ghi được.

- Giai đoạn 01: `compatibility_date` = 2026-08-22 vì workerd trong pool-workers 0.22 chỉ hỗ trợ tới ngày này.
- Giai đoạn 01: Vitest 4.1.x (pool-workers chưa hỗ trợ 5), TypeScript 6.0.x (typescript-eslint yêu cầu < 6.1).
- Giai đoạn 01: client lấy `AppType` qua project references (`tsconfig.worker.json` sinh .d.ts), tránh trộn runtime types của Workers với DOM.
- Giai đoạn 01: Tailwind v4 cấu hình bằng `@theme` trong `src/react-app/styles/index.css`: màu `ink`, `ink-muted`, `ink-body`, `ink-soft`, `line`, `line-input`, `page`, `table-head`, `primary`, `primary-soft`, `warn(-dot)`, `danger(-dot)`, `success(-dot)`; bo góc `rounded-small/control/card`; `h-touch`=44px; utility `num` (tabular-nums + căn phải).
- Không bật `nodejs_compat` (chưa thư viện nào cần).

- Giai đoạn 02: Drizzle biểu diễn được mọi CHECK (kể cả CHECK nhiều cột `stock >= 0 OR allow_negative = 1`), nên migration `0000_init.sql` là bản sinh nguyên, không sửa tay. CHECK được đặt tên (`products_stock_check`, `payments_amount_check`...); UNIQUE sinh thành UNIQUE INDEX (`*_store_code_unique`, `*_store_idempotency_unique`).
- Giai đoạn 02: cờ 0/1 khai báo `integer({ mode: "boolean" })`; cột enum dùng `text({ enum })`, các hằng `DOCUMENT_TYPES`, `COUNTER_KINDS`... export từ `schema.ts`.
- Giai đoạn 02: Drizzle bọc lỗi D1 thành "Failed query" và để lỗi gốc ở `cause`. Dùng `isConstraintError(err, "CHECK", "products_stock_check")` (`src/worker/lib/db-errors.ts`) để nhận ra hết hàng, trùng idempotency key...
- Giai đoạn 02: `getDb(env, storeId)` trả về repository gắn storeId qua closure (`storeId`, `batch`, `codes.next(kind)`, `categories`). `createDatabase` (Drizzle thô) chỉ dùng cho test/việc toàn hệ thống; ESLint chặn import nó và `drizzle-orm/d1` trong `src/worker/routes|services`.
- Giai đoạn 02: sinh mã: `codes.next(kind)` trả `{ bump, code }`; `bump` phải đứng trước câu dùng `code` trong cùng batch. Batch lỗi thì bộ đếm không tăng (đã test). `formatCode` (6 chữ số) ở `src/shared/codes.ts`.
- Giai đoạn 02: `uuidv7` đơn điệu trong một isolate (12 bit bộ đếm trong cùng ms), cần vì Workers đóng băng `Date.now()` trong một request.
- Giai đoạn 02: `parseVnd` trả `null` khi có ký tự lạ (dấu phẩy thập phân, "1,5tr", chữ) thay vì đoán; `formatQty` dùng dấu phẩy thập phân vi-VN.
- Giai đoạn 02: `lib/password.ts` (PBKDF2 100k vòng, từ chối chuỗi lưu < 10k vòng) viết sớm vì seed cần; giai đoạn 03 dùng lại.
- Giai đoạn 02: seed chạy bằng `tsx` (devDependency), sinh `.wrangler/seed/seed.sql` rồi `wrangler d1 execute --local`. Seed XÓA SẠCH D1 local rồi nạp: cửa hàng "Tạp hóa Minh Anh", chủ 0900000001 / nhân viên 0900000002 (mật khẩu `123456`), 6 nhóm, 32 mặt hàng (mã SP theo design, ví dụ SP000052), 6 khách (KH), 2 NCC. Tồn đầu kỳ ghi qua phiếu kiểm kho KK000001 (stock_movements `adjust`), nợ cũ ghi qua debt_entries, để sổ cái khớp số dư. Bộ đếm: SP=127, KH=6, NCC=2, KK=1.
- Giai đoạn 03: mã lỗi dùng chung ở `src/shared/errors.ts` (`ERROR_CODES` → HTTP status): VALIDATION_ERROR, BAD_REQUEST, CANNOT_MODIFY_SELF, WRONG_PASSWORD (400); UNAUTHORIZED, INVALID_CREDENTIALS (401); FORBIDDEN, ACCOUNT_DISABLED, CSRF_REJECTED (403); NOT_FOUND (404); PHONE_TAKEN, LAST_OWNER (409); UNSUPPORTED_MEDIA_TYPE (415); TOO_MANY_ATTEMPTS, RATE_LIMITED (429); INTERNAL_ERROR (500). `AppError(code, message, status?, details?)` lấy status mặc định từ bảng này.
- Giai đoạn 03: validate bằng `validate(target, schema)` (`lib/validate.ts`, bọc `@hono/zod-validator`, ném ZodError → 400 kèm `details.fields[{path, message}]`). `z.config(vi())` ở `src/worker/index.ts` cho thông báo mặc định tiếng Việt; schema vẫn ghi câu cụ thể. Lỗi 500 log qua `redact()` để không ghi params SQL (có thể chứa password_hash).
- Giai đoạn 03: middleware `session` chạy cho mọi /api (gắn `c.var.session` nếu cookie hợp lệ); `requireAuth` gắn `user`, `storeId`, `db = getDb(env, storeId)` (type `AuthEnv`); `requireOwner` đặt sau. Vai trò và trạng thái khóa đọc lại từ `users` mỗi request nên có hiệu lực ngay.
- Giai đoạn 03: thêm cột `sessions.remember` (migration 0001). Phiên "ghi nhớ": 30 ngày, gia hạn khi còn < 7 ngày, đặt lại cookie Max-Age. Phiên không ghi nhớ: cookie phiên, server chỉ cho sống 1 ngày kể từ lần dùng gần nhất (gia hạn khi còn < 12 giờ, không đặt lại cookie). `sessionPolicy(remember)` ở `lib/session-cookie.ts`. Đăng ký luôn "ghi nhớ". Cookie giữ tên `sid` theo spec (không dùng tiền tố `__Host-`).
- Giai đoạn 03: truy vấn cấp hệ thống (trước khi biết cửa hàng: tra SĐT, phiên, login_attempts, tạo cửa hàng) nằm ở `repositories/auth.ts`, lấy qua `getAuthDb(env)`; không dùng cho dữ liệu nghiệp vụ.
- Giai đoạn 03: giới hạn đăng nhập ghi lần thử RỒI mới đếm trong một batch (không đọc-rồi-ghi), nên request song song cũng chỉ thử được 5 lần; lần thứ 6 trở đi bị TOO_MANY_ATTEMPTS kể cả đúng mật khẩu. Thử tiếp khi đang bị khóa sẽ kéo dài thời gian khóa (cửa sổ trượt 15 phút). Đăng nhập đúng xóa lần thử của SĐT đó. SĐT không tồn tại vẫn chạy PBKDF2 (hash giả) để không lộ qua thời gian.
- Giai đoạn 03: CSRF: mọi POST/PUT/PATCH/DELETE cần `X-Requested-With: fetch`; có body thì phải `application/json` (trừ `/api/products/:id/image`); request không body (đăng xuất) không cần Content-Type. Client `hc` trong `src/react-app/api/client.ts` đã gửi sẵn header này.
- Giai đoạn 03: đăng ký: cửa hàng + chủ + 8 bộ đếm (value 0) + 4 nhóm hàng mặc định (Đồ uống, Thực phẩm, Hóa phẩm, Khác) + phiên trong MỘT batch; SĐT cửa hàng mặc định = SĐT chủ.
- Giai đoạn 03: giới hạn theo IP bằng binding Rate Limiting (`wrangler.jsonc` → `ratelimits`): `REGISTER_LIMITER` 5/phút, `LOGIN_LIMITER` 20/phút, key = `CF-Connecting-IP` (thiếu header thì bỏ qua) → 429 `RATE_LIMITED`. Bổ sung cho giới hạn theo SĐT trong DB.
- Giai đoạn 03: Cron Trigger `0 20 * * *` (03:00 giờ VN) gọi `purgeStaleAuthData` (`services/maintenance.ts`): xóa `login_attempts` quá 15 phút và phiên hết hạn. `src/worker/index.ts` export `{ fetch, scheduled }`; `AppType` vẫn là `typeof app`.
- Giai đoạn 03: tự đổi mật khẩu (PATCH /api/users/:id với id của mình) bắt buộc `currentPassword` đúng → nếu sai `WRONG_PASSWORD` (400). Chủ đặt lại mật khẩu cho người khác thì không cần.
- Giai đoạn 03: nhân viên: khóa hoặc đặt lại mật khẩu → xóa phiên của người đó trong cùng batch (câu DELETE có điều kiện "update đã có hiệu lực"); tự đổi mật khẩu giữ phiên hiện tại. Owner không tự khóa/tự đổi vai trò (CANNOT_MODIFY_SELF); UPDATE có điều kiện "còn chủ hoạt động khác" nên cửa hàng không bao giờ hết chủ, kể cả khi hai chủ hạ quyền nhau cùng lúc (LAST_OWNER). Đăng nhập khi đang có phiên thì xóa phiên cũ.
- Giai đoạn 03: PUT /api/store bắt buộc gửi đủ trường (`phone`, `address`, `receiptFooter` có thể null; chuỗi rỗng lưu null) để client không vô tình xóa dữ liệu.
- Giai đoạn 03: test API gọi qua `client(cookie)` = `hc<AppType>` chạy trên `SELF.fetch` (type chặt như frontend). Helper ở `test/helpers/`: `createStore`, `addStaff`, `createTwoStores` (A, B mỗi bên có owner + staff), `login`, `uniquePhone`, `rawFetch`, `errorOf`, `sidCookie`. Thêm ca cô lập vào `test/api/isolation.test.ts` cho mỗi route mới.

- Giai đoạn 04: route hàng hóa, nhóm hàng, danh bạ, ảnh gom ở `src/worker/routes/catalog.ts`; đường dẫn cố định (`/lookup`, `/pos`, `/import`) khai báo trước `/:id`.
- Giai đoạn 04: quy tắc 8 qua `services/serialize.ts` (`serializeProduct`, `serializeMovement`, `ownerOnly`): staff không nhận `costPrice`, `stockValue`, `unitCost`. Mọi route trả hàng hóa/sổ kho phải đi qua đây. Danh sách POS không select giá vốn.
- Giai đoạn 04: `db.batchAll(statements[])` cho batch có số câu lệnh động (mảng rỗng thì bỏ qua). D1 giới hạn 100 tham số mỗi câu: danh sách `IN (...)` chia phần 90 (`chunks` trong repositories/products.ts), đơn vị quy đổi và dòng phiếu INSERT từng câu một.
- Giai đoạn 04: mã nhập tay đúng mẫu hệ thống (vd. SP000200, KH000010) thì `db.codes.atLeast(kind, n)` đẩy bộ đếm lên ≥ n trong cùng batch (`MAX(value, excluded.value)`), để mã tự sinh sau đó không trùng. Mã tự do (vd. GAO-ST25) không ảnh hưởng bộ đếm. `codeNumber` ở lib/codes.ts.
- Giai đoạn 04: mã tự sinh chỉ có dạng subquery trong batch, nên `name_search` ghép bằng SQL (`lib/search.ts`: `productSearchValue`, `contactSearchValue`), có test đối chiếu với `productSearchText`/`contactSearchText`. Mã chỉ gồm `[A-Za-z0-9._-]`, nên `toSearch(code) = lower(code)`.
- Giai đoạn 04: tạo hàng = INSERT hàng (stock = tồn đầu kỳ) + đơn vị + phiếu `stock_count` KK completed (`note` "Tồn đầu kỳ", dòng system 0 → actual) + `stock_movements` `adjust` (`stock_after` bằng subquery), MỘT batch (`db.stock.openingStockStatements`). Tồn đầu kỳ 0 thì không tạo phiếu.
- Giai đoạn 04: sửa hàng (PUT) bỏ qua `stock`/`costPrice` nếu gửi lên; bỏ trống mã thì giữ mã cũ; đơn vị thay toàn bộ (xóa rồi thêm, cùng batch). Tắt "cho phép bán âm" khi tồn đang âm → `NEGATIVE_STOCK` (từ CHECK `products_stock_check`).
- Giai đoạn 04: mã vạch không trùng trong cửa hàng (hàng và đơn vị) kiểm tra bằng một lượt đọc trước khi ghi (không có UNIQUE vì trải 2 bảng); hai người lưu cùng mã vạch đúng cùng lúc vẫn có thể lọt (chấp nhận).
- Giai đoạn 04: danh sách hàng: `status` all (gồm cả ngừng bán) / low (đang bán, min_stock > 0, 0 < tồn ≤ min) / out (đang bán, tồn ≤ 0) / inactive; `counts` theo cùng bộ lọc q + nhóm; sort `name` theo name_search (A–Z đúng tiếng Việt), `code`, `newest`, `stock_asc`, `stock_desc`; LIKE có ESCAPE. `stockValue` = TOTAL(MAX(stock,0) × cost_price)/1000 của cả cửa hàng (kể cả hàng ngừng bán), chỉ owner.
- Giai đoạn 04: giới hạn số: đơn giá ≤ `MAX_PRICE` (1 tỷ), số lượng ≤ `MAX_QTY_MILLI` (1e9 milli = 1 triệu đơn vị), hạn mức nợ ≤ `MAX_AMOUNT` (1.000 tỷ), factor 2..100.000, để số lượng × đơn giá / 1000 và số lượng × factor luôn ≤ 2^53.
- Giai đoạn 04: import: validate từng dòng; loại trùng mã/mã vạch trong file và với DB; nhóm hàng khớp theo `toSearch(tên)`, nhóm thiếu được tạo trước (batch riêng); ghi theo nhóm 20 dòng (mỗi nhóm một phiếu KK nếu có tồn), nhóm lỗi thì ghi lại từng dòng. Trả `{ total, succeeded, failed, createdCategories, rows[{ row (1-based), ok, id, code | error }] }`. Số lượng trong file đã quy về milli (client chuyển).
- Giai đoạn 04: ảnh: multipart trường `file`, bắt buộc Content-Length ≤ 2MB + 64KB, nhận diện JPG/PNG/WEBP bằng magic bytes; key `${storeId}/products/${productId}-${uuidv7}.${ext}`; ảnh cũ bị xóa khỏi R2 sau khi ghi. GET `/api/images/:key{.+}` kiểm tra tiền tố storeId và chặn "..", cache `private, immutable`.
- Giai đoạn 04: nhóm hàng: tên không trùng (theo toSearch) → `CATEGORY_NAME_TAKEN`; xóa bằng `DELETE ... WHERE NOT EXISTS (hàng)` → `CATEGORY_IN_USE` kèm `details.productCount`.
- Giai đoạn 04: danh bạ: mã KH/NCC theo loại; staff thêm/sửa được nhưng `debtLimit` và `isActive` chỉ owner đặt (staff gửi lên bị bỏ qua). Tìm SĐT gõ có khoảng trắng/dấu chấm vẫn khớp. `overdueDays` = đang nợ và `debt_since` ≤ now − N ngày; sort `debt_since_asc` đẩy người không nợ xuống cuối.
- Giai đoạn 04: staff được xem danh sách nhà cung cấp và nợ NCC (GET /api/contacts?type=supplier), người dùng đã quyết định không chặn.
- Giai đoạn 04: Drizzle bỏ tên bảng khi select một bảng, nên subquery tương quan phải ghi rõ cột ngoài (`"categories"."id"` trong `listWithCounts`).
- Giai đoạn 04: test helper `test/helpers/catalog.ts`: `productInput`, `createProduct`, `contactInput`, `createContact`.

## Việc còn nợ

- Người dùng tự chạy `wrangler login`, `wrangler d1 create store-app-db`, `wrangler r2 bucket create store-app-images` rồi thay `database_id` trong `wrangler.jsonc` (đang là UUID toàn số 0).
- Seed: thêm hóa đơn bán và phiếu nhập mẫu qua service sau giai đoạn 05–06.
- Cân nhắc index `categories (store_id, sort_order)` nếu cần (DATABASE.md không yêu cầu, bảng nhỏ).
- `toBaseQty` chưa tự kiểm tra factor; đầu vào đã chặn bằng Zod (factor 2..100.000, qty ≤ 1e9 milli) từ giai đoạn 04. Giai đoạn 05 dùng lại `qtyMilliSchema`/`moneySchema` cho dòng chứng từ.
- Giới hạn đăng nhập theo SĐT vẫn cho phép người khác (đổi nhiều IP) cố tình khóa đăng nhập của một SĐT 15 phút; chấp nhận cho MVP.
- Khi deploy: kiểm tra binding Rate Limiting (`namespace_id` 1001, 1002) và Cron Trigger hoạt động trên tài khoản Cloudflare (giai đoạn 15).
- Tạo hàng và import chưa có idempotencyKey (không phải chứng từ theo quy tắc 6, nhưng gửi lại do mạng chập chờn sẽ tạo trùng hàng mã tự sinh + phiếu tồn đầu kỳ). Cân nhắc thêm khi làm giao diện (giai đoạn 10).
- Tra mã vạch trả cả hàng ngừng bán (kèm `isActive`); POS (giai đoạn 09) phải chặn bán hàng ngừng bán. Server sẽ chặn ở service bán hàng (giai đoạn 05).
- Hai lần upload ảnh song song cho cùng hàng có thể để lại một ảnh mồ côi trên R2 (chỉ tốn chỗ).
- Import: nhóm hàng mới được tạo trước khi ghi hàng; nếu mọi dòng của nhóm đó lỗi khi ghi thì còn nhóm rỗng.
- Seed (`scripts/seed.ts`) vẫn ghi SQL trực tiếp; mã SP theo design (vd. SP000052) cùng bộ đếm SP=127 vẫn đúng với `codeNumber`.
- Nâng `compatibility_date` khi `@cloudflare/vitest-pool-workers` có bản đi kèm workerd mới hơn 2026-08-22.

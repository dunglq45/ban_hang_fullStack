# API (`/api/*`)

Quy ước:
- JSON vào/ra. Lỗi: `{ "error": { "code": "OUT_OF_STOCK", "message": "Không đủ hàng trong kho", "details"?: {...} } }`.
- Danh sách: query `page`, `pageSize`, trả `{ items, total, page, pageSize }`.
- Tiền và số lượng trong API theo đúng quy ước lưu trữ (VND nguyên, số lượng milli).
- 🔒 = cần đăng nhập. 👑 = chỉ owner.

## Mã lỗi
Định nghĩa ở `src/shared/errors.ts` (mã → HTTP status), dùng chung cho client.

| HTTP | Mã |
|---|---|
| 400 | VALIDATION_ERROR (kèm `details.fields[{ path, message }]`), BAD_REQUEST, CANNOT_MODIFY_SELF, WRONG_PASSWORD, INVALID_CATEGORY, INVALID_IMAGE, INVALID_UNIT, INVALID_CONTACT, INVALID_DISCOUNT, AMOUNT_TOO_LARGE, DEBT_REQUIRES_CUSTOMER, DEBT_REQUIRES_SUPPLIER, REASON_REQUIRED (`details.lines[]`), TOO_MANY_LINES |
| 401 | UNAUTHORIZED, INVALID_CREDENTIALS |
| 403 | FORBIDDEN, ACCOUNT_DISABLED, CSRF_REJECTED, PRICE_BELOW_COST |
| 404 | NOT_FOUND, PRODUCT_NOT_IN_COUNT |
| 409 | PHONE_TAKEN, LAST_OWNER, CODE_TAKEN, BARCODE_TAKEN, CATEGORY_IN_USE, CATEGORY_NAME_TAKEN, NEGATIVE_STOCK, OUT_OF_STOCK (`details: { productId, name, stock, requested, items[] }`), PRODUCT_INACTIVE, DEBT_LIMIT_EXCEEDED (`details: { debt, debtLimit, debtAmount }`), ALREADY_CANCELLED, INVALID_STATUS, IDEMPOTENCY_CONFLICT, CANNOT_CANCEL_STOCK_USED (`details.items[]`), AMOUNT_EXCEEDS_DEBT (`details: { debt, amount }`) |
| 413 | IMAGE_TOO_LARGE |
| 415 | UNSUPPORTED_MEDIA_TYPE |
| 429 | TOO_MANY_ATTEMPTS, RATE_LIMITED |
| 500 | INTERNAL_ERROR |

## Auth
| Method | Path | Mô tả |
|---|---|---|
| POST | /api/auth/register | Tạo cửa hàng + tài khoản owner `{ storeName, ownerName, phone, password }`. Seed nhóm hàng mặc định. |
| POST | /api/auth/login | `{ phone, password, remember }`, set cookie |
| POST | /api/auth/logout | 🔒 xóa session |
| GET | /api/auth/me | 🔒 `{ user, store }` |
| PUT | /api/auth/password | 🔒 tự đổi mật khẩu (mọi vai trò) `{ currentPassword, password }`; sai mật khẩu hiện tại → `WRONG_PASSWORD`; giữ phiên đang dùng, đăng xuất thiết bị khác |

## Cửa hàng và nhân viên
| GET/PUT | /api/store | 🔒👑 thông tin cửa hàng, footer hóa đơn |
| GET/POST | /api/users | 🔒👑 danh sách, thêm nhân viên |
| PATCH | /api/users/:id | 🔒👑 đổi tên, vai trò, khóa/mở, đặt lại mật khẩu |

## Nhóm hàng
| GET/POST | /api/categories | 🔒 (POST 👑) |
| PATCH/DELETE | /api/categories/:id | 🔒👑 (xóa chỉ khi không còn hàng) |

## Hàng hóa
| GET | /api/products | 🔒 `q, categoryId, status=all|low|out|inactive, sort` (staff không có cost_price) |
| GET | /api/products/lookup?barcode= | 🔒 tra mã vạch → `{ product, unit? }` |
| GET | /api/products/pos | 🔒 danh sách gọn cho POS (đang bán, show_in_pos), có units |
| GET | /api/products/:id | 🔒 chi tiết + units |
| GET | /api/products/:id/movements | 🔒 lịch sử kho, lọc type, from, to |
| POST | /api/products | 🔒👑 tạo (kèm units, tồn đầu kỳ: ghi stock_movements type `adjust`, note "Tồn đầu kỳ") |
| PUT | /api/products/:id | 🔒👑 sửa thông tin, giá, units. KHÔNG sửa trực tiếp stock/cost_price |
| POST | /api/products/import | 🔒👑 tối đa 500 dòng, trả kết quả từng dòng (ok/lỗi) |
| POST | /api/products/:id/image | 🔒👑 upload ảnh lên R2 (≤ 2MB, jpg/png/webp) |
| GET | /api/images/:key | 🔒 trả ảnh từ R2 |

## Khách hàng và nhà cung cấp
| GET | /api/contacts?type=customer|supplier | 🔒 `q, hasDebt, overdueDays, sort=debt_desc|debt_since_asc|name` |
| GET | /api/contacts/:id | 🔒 kèm `lastPayment` (lần thu/trả gần nhất còn hiệu lực: code, amount, method, createdAt) hoặc null |
| GET | /api/contacts/:id/debt-entries | 🔒 sổ chi tiết công nợ, mới nhất trước, phân trang. Mỗi dòng: `createdAt`, `ref { kind: document|payment, id, code, type }`, `description` ("Bán hàng, trả thiếu", "Thu nợ tiền mặt", "Hủy hóa đơn HD…"…), `increase` (phát sinh nợ), `decrease` (đã trả), `balanceAfter` |
| POST/PUT | /api/contacts(/:id) | 🔒 |
| GET | /api/debts/summary | 🔒 `receivable { amount, customers }`, `overdue { amount, customers, days: 30 }` (theo ngày bắt đầu nợ), `collectedThisMonth { amount, count }` (tháng theo giờ VN), `payable { amount, suppliers }`, `paidThisMonth { amount, count }`. Staff xem được (đã quyết định không chặn số liệu NCC ở giai đoạn 04) |

## Chứng từ
| POST | /api/sales | 🔒 tạo hóa đơn bán (xem DATABASE.md). 201 = tạo mới, 200 = idempotencyKey đã dùng (trả hóa đơn cũ). `force` chỉ có tác dụng với owner |
| POST | /api/purchases | 🔒👑 tạo phiếu nhập (status `draft` hoặc `completed`). 201 = tạo mới, 200 = idempotencyKey đã dùng |
| PUT | /api/purchases/:id | 🔒👑 sửa phiếu NHÁP (thay đầu phiếu và toàn bộ dòng) |
| POST | /api/purchases/:id/complete | 🔒👑 hoàn thành phiếu nháp |
| GET | /api/documents | 🔒 `type, status, contactId, from, to, q` |
| GET | /api/documents/:id | 🔒 kèm lines, contact, người tạo |
| POST | /api/documents/:id/cancel | 🔒👑 hủy |

## Thu chi
| POST | /api/payments | 🔒 `{ type, contactId, amount, method, note, idempotencyKey }` (disbursement 👑). receipt: khách hàng, PT; disbursement: NCC, PC. `amount` ≤ nợ hiện tại (`AMOUNT_EXCEEDS_DEBT`). 201 = tạo mới, 200 = idempotencyKey đã dùng |
| GET | /api/payments/:id | 🔒 phiếu kèm `contact` (nợ hiện tại), `createdBy`, `balanceAfter` (dư nợ ngay sau phiếu), `store` (để in); staff chỉ xem phiếu thu (disbursement → `FORBIDDEN`) |
| POST | /api/payments/:id/cancel | 🔒👑 cộng lại nợ, ghi sổ nợ dòng dương |

## Kiểm kho
| POST | /api/stock-counts | 🔒👑 tạo phiếu nháp `{ categoryId? , productIds? }` (có productIds thì bỏ qua categoryId; bỏ trống cả hai = mọi hàng đang bán; tối đa 200 hàng) |
| GET | /api/stock-counts/:id | 🔒 |
| PATCH | /api/stock-counts/:id/lines | 🔒 cập nhật hàng loạt `{ lines: [{ lineId, actualQty (milli hoặc null), reason }] }` |
| POST | /api/stock-counts/:id/scan | 🔒 `{ barcode }` → actual_qty + 1 đơn vị (theo factor nếu là mã vạch thùng) |
| POST | /api/stock-counts/:id/complete | 🔒👑 trả `{ document, warnings[] }` (hàng đã đếm mà tồn đổi kể từ lúc tạo phiếu) |

## Báo cáo (👑)
| GET | /api/reports/overview?period=today|7d|month&from&to | `range`, `revenue`, `orders`, `averageOrder`, `costOfGoods`, `grossProfit`, `margin` (%, 1 chữ số, null khi chưa có doanh thu), `receivable { amount, customers, overdueAmount, overdueCustomers }` (số dư hiện tại, không theo kỳ), `restock { total, out, low }`. `from`/`to` là ngày VN `YYYY-MM-DD` (bao gồm cả hai), phải đi cùng nhau, tối đa 366 ngày |
| GET | /api/reports/revenue-daily?days=7 | đủ N ngày (1–90, tính cả hôm nay), ngày không bán ra 0: `items[{ date, from, revenue, orders }]`, `total`, `orders` |
| GET | /api/reports/top-products?period=&sort=qty|revenue&limit=10 | `items[{ rank, productId, code, name, baseUnit, qty (milli đơn vị cơ bản), revenue (thành tiền dòng, trước chiết khấu hóa đơn) }]` |
| GET | /api/reports/restock?page&pageSize | hàng đang bán hết (tồn ≤ 0) hoặc sắp hết (0 < tồn ≤ tối thiểu): hết trước, rồi tỷ lệ tồn/tối thiểu thấp nhất; `items[{ …, status: out|low }]`, `counts { out, low }` |

Ghi chú: mọi tính toán "ngày" dùng múi giờ Asia/Ho_Chi_Minh (UTC+7), helper ở `src/shared/period.ts`. Doanh thu = SUM(total) hóa đơn bán hoàn thành (đã trừ chiết khấu hóa đơn) − phiếu khách trả hàng; hóa đơn bị hủy không tính. Lợi nhuận gộp = doanh thu − giá vốn đã chụp ở từng dòng lúc bán.

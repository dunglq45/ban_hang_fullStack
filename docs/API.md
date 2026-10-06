# API (`/api/*`)

Quy ước:
- JSON vào/ra. Lỗi: `{ "error": { "code": "OUT_OF_STOCK", "message": "Không đủ hàng trong kho", "details"?: {...} } }`.
- Danh sách: query `page`, `pageSize`, trả `{ items, total, page, pageSize }`.
- Tiền và số lượng trong API theo đúng quy ước lưu trữ (VND nguyên, số lượng milli).
- 🔒 = cần đăng nhập. 👑 = chỉ owner.

## Auth
| Method | Path | Mô tả |
|---|---|---|
| POST | /api/auth/register | Tạo cửa hàng + tài khoản owner `{ storeName, ownerName, phone, password }`. Seed nhóm hàng mặc định. |
| POST | /api/auth/login | `{ phone, password, remember }`, set cookie |
| POST | /api/auth/logout | 🔒 xóa session |
| GET | /api/auth/me | 🔒 `{ user, store }` |

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
| GET | /api/contacts/:id | 🔒 |
| GET | /api/contacts/:id/debt-entries | 🔒 sổ chi tiết công nợ (kèm mã chứng từ hoặc phiếu) |
| POST/PUT | /api/contacts(/:id) | 🔒 |
| GET | /api/debts/summary | 🔒 tổng phải thu, quá 30 ngày, đã thu tháng này; tổng phải trả |

## Chứng từ
| POST | /api/sales | 🔒 tạo hóa đơn bán (xem DATABASE.md) |
| POST | /api/purchases | 🔒👑 tạo phiếu nhập (status `draft` hoặc `completed`) |
| POST | /api/purchases/:id/complete | 🔒👑 hoàn thành phiếu nháp |
| GET | /api/documents | 🔒 `type, status, contactId, from, to, q` |
| GET | /api/documents/:id | 🔒 kèm lines, contact, người tạo |
| POST | /api/documents/:id/cancel | 🔒👑 hủy |

## Thu chi
| POST | /api/payments | 🔒 `{ type, contactId, amount, method, note, idempotencyKey }` (disbursement 👑) |
| POST | /api/payments/:id/cancel | 🔒👑 |

## Kiểm kho
| POST | /api/stock-counts | 🔒👑 tạo phiếu nháp `{ categoryId? , productIds? }` |
| GET | /api/stock-counts/:id | 🔒 |
| PATCH | /api/stock-counts/:id/lines | 🔒 cập nhật hàng loạt `[{ lineId, actualQty, reason }]` |
| POST | /api/stock-counts/:id/scan | 🔒 `{ barcode }` → actual_qty + 1 đơn vị (theo factor nếu là mã vạch thùng) |
| POST | /api/stock-counts/:id/complete | 🔒👑 |

## Báo cáo (👑)
| GET | /api/reports/overview?period=today|7d|month&from&to | doanh thu, số đơn, TB/đơn, lợi nhuận gộp, biên LN, phải thu, số hàng cần nhập |
| GET | /api/reports/revenue-daily?days=7 | doanh thu theo ngày (múi giờ Asia/Ho_Chi_Minh) |
| GET | /api/reports/top-products?period= | bán chạy: số lượng, doanh thu |
| GET | /api/reports/restock | hàng sắp hết / hết |

Ghi chú: mọi tính toán "ngày" dùng múi giờ Asia/Ho_Chi_Minh (UTC+7).

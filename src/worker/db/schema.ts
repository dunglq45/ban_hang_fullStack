// Drizzle schema theo docs/DATABASE.md.
// Quy ước: id TEXT (UUIDv7), thời gian INTEGER (epoch ms), tiền INTEGER (VND), số lượng INTEGER (milli).
// Cờ 0/1 khai báo mode "boolean" (lưu INTEGER, Drizzle đổi sang boolean khi đọc).
import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  unique,
} from "drizzle-orm/sqlite-core";

export const USER_ROLES = ["owner", "staff"] as const;
export const CONTACT_TYPES = ["customer", "supplier"] as const;
export const DOCUMENT_TYPES = [
  "sale",
  "purchase",
  "sale_return",
  "purchase_return",
  "stock_count",
] as const;
export const DOCUMENT_STATUSES = ["draft", "completed", "cancelled"] as const;
export const PAYMENT_TYPES = ["receipt", "disbursement"] as const;
export const PAYMENT_STATUSES = ["completed", "cancelled"] as const;
export const PAYMENT_METHODS = ["cash", "transfer"] as const;
export const MOVEMENT_TYPES = [
  "sale",
  "purchase",
  "sale_return",
  "purchase_return",
  "adjust",
  "cancel",
] as const;
export const COUNTER_KINDS = ["HD", "PN", "PT", "PC", "KK", "SP", "KH", "NCC"] as const;

export type UserRole = (typeof USER_ROLES)[number];
export type ContactType = (typeof CONTACT_TYPES)[number];
export type DocumentType = (typeof DOCUMENT_TYPES)[number];
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];
export type PaymentType = (typeof PAYMENT_TYPES)[number];
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export type MovementType = (typeof MOVEMENT_TYPES)[number];
export type CounterKind = (typeof COUNTER_KINDS)[number];

export const stores = sqliteTable("stores", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  phone: text("phone"),
  address: text("address"),
  receiptFooter: text("receipt_footer"),
  createdAt: integer("created_at").notNull(),
});

export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    storeId: text("store_id")
      .notNull()
      .references(() => stores.id),
    phone: text("phone").notNull().unique(),
    name: text("name").notNull(),
    // "pbkdf2$100000$<salt b64>$<hash b64>"
    passwordHash: text("password_hash").notNull(),
    role: text("role", { enum: USER_ROLES }).notNull(),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [check("users_role_check", sql`${t.role} IN ('owner','staff')`)],
);

export const sessions = sqliteTable("sessions", {
  // sha256(token) dạng hex
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  storeId: text("store_id").notNull(),
  expiresAt: integer("expires_at").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const loginAttempts = sqliteTable(
  "login_attempts",
  {
    phone: text("phone").notNull(),
    at: integer("at").notNull(),
  },
  (t) => [index("idx_login_attempts").on(t.phone, t.at)],
);

export const counters = sqliteTable(
  "counters",
  {
    storeId: text("store_id").notNull(),
    kind: text("kind", { enum: COUNTER_KINDS }).notNull(),
    value: integer("value").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.storeId, t.kind] })],
);

export const categories = sqliteTable("categories", {
  id: text("id").primaryKey(),
  storeId: text("store_id").notNull(),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const products = sqliteTable(
  "products",
  {
    id: text("id").primaryKey(),
    storeId: text("store_id").notNull(),
    // SP000001, tự sinh nếu bỏ trống
    code: text("code").notNull(),
    barcode: text("barcode"),
    name: text("name").notNull(),
    // toSearch(name + code + barcode)
    nameSearch: text("name_search").notNull(),
    categoryId: text("category_id"),
    baseUnit: text("base_unit").notNull(),
    // giá vốn bình quân / 1 đơn vị cơ bản
    costPrice: integer("cost_price").notNull().default(0),
    salePrice: integer("sale_price").notNull().default(0),
    // milli đơn vị cơ bản
    stock: integer("stock").notNull().default(0),
    minStock: integer("min_stock").notNull().default(0),
    allowNegative: integer("allow_negative", { mode: "boolean" }).notNull().default(false),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    showInPos: integer("show_in_pos", { mode: "boolean" }).notNull().default(true),
    imageKey: text("image_key"),
    note: text("note"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [
    check("products_stock_check", sql`${t.stock} >= 0 OR ${t.allowNegative} = 1`),
    unique("products_store_code_unique").on(t.storeId, t.code),
    index("idx_products_search").on(t.storeId, t.isActive, t.nameSearch),
    index("idx_products_barcode").on(t.storeId, t.barcode),
  ],
);

// Đơn vị quy đổi (Thùng = 24 Chai)
export const productUnits = sqliteTable(
  "product_units",
  {
    id: text("id").primaryKey(),
    storeId: text("store_id").notNull(),
    productId: text("product_id")
      .notNull()
      .references(() => products.id),
    name: text("name").notNull(),
    // số đơn vị cơ bản (nguyên)
    factor: integer("factor").notNull(),
    salePrice: integer("sale_price"),
    barcode: text("barcode"),
  },
  (t) => [
    check("product_units_factor_check", sql`${t.factor} > 1`),
    index("idx_units_product").on(t.storeId, t.productId),
    index("idx_units_barcode").on(t.storeId, t.barcode),
  ],
);

// Khách hàng và nhà cung cấp
export const contacts = sqliteTable(
  "contacts",
  {
    id: text("id").primaryKey(),
    storeId: text("store_id").notNull(),
    type: text("type", { enum: CONTACT_TYPES }).notNull(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    nameSearch: text("name_search").notNull(),
    phone: text("phone"),
    address: text("address"),
    note: text("note"),
    // customer: khách nợ mình; supplier: mình nợ NCC
    debt: integer("debt").notNull().default(0),
    // NULL = không giới hạn
    debtLimit: integer("debt_limit"),
    // thời điểm bắt đầu có nợ (NULL khi debt = 0)
    debtSince: integer("debt_since"),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [
    check("contacts_type_check", sql`${t.type} IN ('customer','supplier')`),
    unique("contacts_store_code_unique").on(t.storeId, t.code),
    index("idx_contacts_search").on(t.storeId, t.type, t.nameSearch),
    index("idx_contacts_debt").on(t.storeId, t.type, t.debt),
  ],
);

// Hóa đơn bán, phiếu nhập, trả hàng, kiểm kho
export const documents = sqliteTable(
  "documents",
  {
    id: text("id").primaryKey(),
    storeId: text("store_id").notNull(),
    type: text("type", { enum: DOCUMENT_TYPES }).notNull(),
    // HD000231, PN000058, KK000013
    code: text("code").notNull(),
    contactId: text("contact_id"),
    status: text("status", { enum: DOCUMENT_STATUSES }).notNull(),
    subtotal: integer("subtotal").notNull().default(0),
    discount: integer("discount").notNull().default(0),
    total: integer("total").notNull().default(0),
    paid: integer("paid").notNull().default(0),
    // = total - paid (ghi nợ)
    debtAmount: integer("debt_amount").notNull().default(0),
    paymentMethod: text("payment_method", { enum: PAYMENT_METHODS }),
    note: text("note"),
    idempotencyKey: text("idempotency_key"),
    createdBy: text("created_by").notNull(),
    createdAt: integer("created_at").notNull(),
    completedAt: integer("completed_at"),
    cancelledAt: integer("cancelled_at"),
    cancelledBy: text("cancelled_by"),
  },
  (t) => [
    check(
      "documents_type_check",
      sql`${t.type} IN ('sale','purchase','sale_return','purchase_return','stock_count')`,
    ),
    check("documents_status_check", sql`${t.status} IN ('draft','completed','cancelled')`),
    check("documents_payment_method_check", sql`${t.paymentMethod} IN ('cash','transfer')`),
    unique("documents_store_code_unique").on(t.storeId, t.code),
    unique("documents_store_idempotency_unique").on(t.storeId, t.idempotencyKey),
    index("idx_documents_list").on(t.storeId, t.type, t.status, t.createdAt),
    index("idx_documents_contact").on(t.storeId, t.contactId, t.createdAt),
  ],
);

export const documentLines = sqliteTable(
  "document_lines",
  {
    id: text("id").primaryKey(),
    storeId: text("store_id").notNull(),
    documentId: text("document_id")
      .notNull()
      .references(() => documents.id),
    productId: text("product_id").notNull(),
    unitName: text("unit_name").notNull(),
    factor: integer("factor").notNull().default(1),
    // milli, theo đơn vị đã chọn
    qty: integer("qty").notNull(),
    // milli đơn vị cơ bản = qty * factor
    baseQty: integer("base_qty").notNull(),
    // giá theo đơn vị đã chọn
    unitPrice: integer("unit_price").notNull(),
    lineTotal: integer("line_total").notNull(),
    // giá vốn / đơn vị cơ bản tại thời điểm ghi
    costPrice: integer("cost_price").notNull().default(0),
    // kiểm kho: tồn hệ thống (milli)
    systemQty: integer("system_qty"),
    // kiểm kho: thực tế (milli), NULL = chưa đếm
    actualQty: integer("actual_qty"),
    // kiểm kho: lý do lệch
    reason: text("reason"),
  },
  (t) => [
    index("idx_lines_doc").on(t.storeId, t.documentId),
    index("idx_lines_product").on(t.storeId, t.productId),
  ],
);

// Sổ cái kho, chỉ INSERT
export const stockMovements = sqliteTable(
  "stock_movements",
  {
    id: text("id").primaryKey(),
    storeId: text("store_id").notNull(),
    productId: text("product_id").notNull(),
    documentId: text("document_id").notNull(),
    type: text("type", { enum: MOVEMENT_TYPES }).notNull(),
    // milli, + nhập / - xuất
    qtyChange: integer("qty_change").notNull(),
    stockAfter: integer("stock_after").notNull(),
    unitCost: integer("unit_cost").notNull(),
    note: text("note"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("idx_movements_product").on(t.storeId, t.productId, t.createdAt)],
);

// Phiếu thu (thu nợ khách) / phiếu chi (trả nợ NCC)
export const payments = sqliteTable(
  "payments",
  {
    id: text("id").primaryKey(),
    storeId: text("store_id").notNull(),
    type: text("type", { enum: PAYMENT_TYPES }).notNull(),
    // PT000045 / PC000012
    code: text("code").notNull(),
    contactId: text("contact_id").notNull(),
    amount: integer("amount").notNull(),
    method: text("method", { enum: PAYMENT_METHODS }).notNull(),
    note: text("note"),
    status: text("status", { enum: PAYMENT_STATUSES }).notNull(),
    idempotencyKey: text("idempotency_key"),
    createdBy: text("created_by").notNull(),
    createdAt: integer("created_at").notNull(),
    cancelledAt: integer("cancelled_at"),
  },
  (t) => [
    check("payments_type_check", sql`${t.type} IN ('receipt','disbursement')`),
    check("payments_amount_check", sql`${t.amount} > 0`),
    check("payments_method_check", sql`${t.method} IN ('cash','transfer')`),
    check("payments_status_check", sql`${t.status} IN ('completed','cancelled')`),
    unique("payments_store_code_unique").on(t.storeId, t.code),
    unique("payments_store_idempotency_unique").on(t.storeId, t.idempotencyKey),
  ],
);

// Sổ cái công nợ, chỉ INSERT
export const debtEntries = sqliteTable(
  "debt_entries",
  {
    id: text("id").primaryKey(),
    storeId: text("store_id").notNull(),
    contactId: text("contact_id").notNull(),
    documentId: text("document_id"),
    paymentId: text("payment_id"),
    // + tăng nợ / - giảm nợ
    amount: integer("amount").notNull(),
    balanceAfter: integer("balance_after").notNull(),
    note: text("note"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("idx_debt_contact").on(t.storeId, t.contactId, t.createdAt)],
);

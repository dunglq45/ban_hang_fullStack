// Seed dữ liệu mẫu cho D1 LOCAL: `pnpm db:seed:local`.
// XÓA TOÀN BỘ dữ liệu trong D1 local rồi nạp lại: 1 cửa hàng, 2 tài khoản, 6 nhóm hàng,
// 32 mặt hàng, 6 khách hàng, 2 nhà cung cấp (tên, giá lấy từ design/*.dc.html).
// Tồn đầu kỳ ghi qua một phiếu kiểm kho đã hoàn thành và nợ cũ ghi vào debt_entries,
// để sổ cái kho và sổ cái công nợ khớp với số dư ngay từ đầu.
// Hóa đơn bán, phiếu nhập mẫu sẽ thêm qua service khi các service đó có (giai đoạn 05–07).
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { formatCode } from "../src/shared/codes";
import { toMilli } from "../src/shared/qty";
import { contactSearchText, productSearchText } from "../src/shared/text";
import { hashPassword } from "../src/worker/lib/password";
import { uuidv7 } from "../src/worker/lib/uuid";

const DB_NAME = "store-app-db";
const PASSWORD = "123456";
const DAY = 86_400_000;

type SqlValue = string | number | boolean | null;

function lit(v: SqlValue): string {
  if (v === null) return "NULL";
  if (typeof v === "boolean") return v ? "1" : "0";
  if (typeof v === "number") {
    if (!Number.isSafeInteger(v)) throw new Error(`Seed chỉ dùng số nguyên: ${v}`);
    return String(v);
  }
  return `'${v.replace(/'/g, "''")}'`;
}

const statements: string[] = [];

function insert(table: string, row: Record<string, SqlValue>) {
  const cols = Object.keys(row);
  statements.push(
    `INSERT INTO ${table} (${cols.join(", ")}) VALUES (${cols.map((c) => lit(row[c]!)).join(", ")});`,
  );
}

// ---------------------------------------------------------------------------
// Dữ liệu
// ---------------------------------------------------------------------------

const CATEGORIES = ["Đồ uống", "Mì, gạo", "Sữa", "Gia vị", "Bánh kẹo", "Hóa phẩm"] as const;
type Category = (typeof CATEGORIES)[number];

interface ProductSeed {
  no: number; // số trong mã SP, theo design
  name: string;
  category: Category;
  unit: string;
  cost: number;
  price: number;
  stock: number;
  min: number;
  barcode?: string;
  units?: { name: string; factor: number; price: number }[];
}

const PRODUCTS: ProductSeed[] = [
  // Đồ uống
  {
    no: 3,
    name: "Nước suối 500ml",
    category: "Đồ uống",
    unit: "Chai",
    cost: 3500,
    price: 5000,
    stock: 48,
    min: 12,
    units: [{ name: "Thùng", factor: 24, price: 110_000 }],
  },
  {
    no: 5,
    name: "Nước ngọt lon",
    category: "Đồ uống",
    unit: "Lon",
    cost: 7800,
    price: 10_000,
    stock: 36,
    min: 12,
    units: [{ name: "Thùng", factor: 24, price: 230_000 }],
  },
  {
    no: 7,
    name: "Trà xanh chai 455ml",
    category: "Đồ uống",
    unit: "Chai",
    cost: 7000,
    price: 10_000,
    stock: 30,
    min: 10,
  },
  {
    no: 8,
    name: "Cà phê sữa lon",
    category: "Đồ uống",
    unit: "Lon",
    cost: 9000,
    price: 12_000,
    stock: 24,
    min: 6,
  },
  {
    no: 9,
    name: "Bia lon 330ml",
    category: "Đồ uống",
    unit: "Lon",
    cost: 14_000,
    price: 17_000,
    stock: 48,
    min: 24,
    units: [{ name: "Thùng", factor: 24, price: 390_000 }],
  },
  // Mì, gạo
  {
    no: 12,
    name: "Mì gói tôm chua cay",
    category: "Mì, gạo",
    unit: "Gói",
    cost: 3600,
    price: 4500,
    stock: 120,
    min: 30,
    barcode: "8934563138165",
    units: [{ name: "Thùng", factor: 30, price: 125_000 }],
  },
  {
    no: 14,
    name: "Mì ly",
    category: "Mì, gạo",
    unit: "Ly",
    cost: 7000,
    price: 9000,
    stock: 24,
    min: 6,
  },
  {
    no: 16,
    name: "Phở gói ăn liền",
    category: "Mì, gạo",
    unit: "Gói",
    cost: 6500,
    price: 8000,
    stock: 30,
    min: 10,
  },
  {
    no: 60,
    name: "Gạo ST25",
    category: "Mì, gạo",
    unit: "Kg",
    cost: 27_000,
    price: 32_000,
    stock: 85,
    min: 20,
  },
  {
    no: 62,
    name: "Gạo tám thơm",
    category: "Mì, gạo",
    unit: "Kg",
    cost: 18_000,
    price: 22_000,
    stock: 50.5,
    min: 20,
  },
  {
    no: 64,
    name: "Bún khô 500g",
    category: "Mì, gạo",
    unit: "Gói",
    cost: 14_000,
    price: 18_000,
    stock: 20,
    min: 5,
  },
  // Sữa
  {
    no: 31,
    name: "Sữa tươi hộp 180ml",
    category: "Sữa",
    unit: "Hộp",
    cost: 6500,
    price: 8000,
    stock: 4,
    min: 24,
    units: [{ name: "Thùng", factor: 48, price: 365_000 }],
  },
  {
    no: 33,
    name: "Sữa đặc lon",
    category: "Sữa",
    unit: "Lon",
    cost: 21_000,
    price: 26_000,
    stock: 15,
    min: 6,
  },
  {
    no: 35,
    name: "Sữa chua hộp",
    category: "Sữa",
    unit: "Hộp",
    cost: 5500,
    price: 7000,
    stock: 20,
    min: 8,
  },
  {
    no: 37,
    name: "Sữa bột hộp 400g",
    category: "Sữa",
    unit: "Hộp",
    cost: 165_000,
    price: 190_000,
    stock: 6,
    min: 2,
  },
  // Gia vị
  {
    no: 47,
    name: "Dầu ăn 1 lít",
    category: "Gia vị",
    unit: "Chai",
    cost: 45_000,
    price: 52_000,
    stock: 12,
    min: 6,
    barcode: "8936017361042",
  },
  {
    no: 52,
    name: "Nước mắm 500ml",
    category: "Gia vị",
    unit: "Chai",
    cost: 31_000,
    price: 38_000,
    stock: 2,
    min: 6,
    barcode: "8934567890123",
    units: [{ name: "Thùng", factor: 12, price: 440_000 }],
  },
  {
    no: 90,
    name: "Muối i-ốt",
    category: "Gia vị",
    unit: "Gói",
    cost: 4000,
    price: 5000,
    stock: 40,
    min: 10,
  },
  {
    no: 93,
    name: "Bột ngọt 400g",
    category: "Gia vị",
    unit: "Gói",
    cost: 28_000,
    price: 34_000,
    stock: 18,
    min: 5,
  },
  {
    no: 95,
    name: "Hạt nêm 400g",
    category: "Gia vị",
    unit: "Gói",
    cost: 38_000,
    price: 45_000,
    stock: 15,
    min: 5,
  },
  {
    no: 98,
    name: "Đường trắng 1kg",
    category: "Gia vị",
    unit: "Gói",
    cost: 22_000,
    price: 27_000,
    stock: 3,
    min: 10,
  },
  {
    no: 101,
    name: "Tiêu xay 50g",
    category: "Gia vị",
    unit: "Gói",
    cost: 12_000,
    price: 15_000,
    stock: 22,
    min: 5,
  },
  {
    no: 127,
    name: "Nước tương 500ml",
    category: "Gia vị",
    unit: "Chai",
    cost: 21_000,
    price: 25_000,
    stock: 36,
    min: 6,
  },
  // Bánh kẹo
  {
    no: 71,
    name: "Bánh quy hộp",
    category: "Bánh kẹo",
    unit: "Hộp",
    cost: 46_000,
    price: 58_000,
    stock: 9,
    min: 10,
  },
  {
    no: 73,
    name: "Kẹo dẻo gói",
    category: "Bánh kẹo",
    unit: "Gói",
    cost: 9000,
    price: 12_000,
    stock: 25,
    min: 5,
  },
  {
    no: 75,
    name: "Snack khoai tây",
    category: "Bánh kẹo",
    unit: "Gói",
    cost: 7500,
    price: 10_000,
    stock: 40,
    min: 10,
  },
  {
    no: 77,
    name: "Bánh bông lan",
    category: "Bánh kẹo",
    unit: "Cái",
    cost: 4000,
    price: 6000,
    stock: 30,
    min: 10,
  },
  // Hóa phẩm
  {
    no: 80,
    name: "Nước rửa chén 750ml",
    category: "Hóa phẩm",
    unit: "Chai",
    cost: 22_000,
    price: 28_000,
    stock: 14,
    min: 4,
  },
  {
    no: 82,
    name: "Dầu gội 650ml",
    category: "Hóa phẩm",
    unit: "Chai",
    cost: 95_000,
    price: 115_000,
    stock: 8,
    min: 3,
  },
  {
    no: 84,
    name: "Kem đánh răng",
    category: "Hóa phẩm",
    unit: "Tuýp",
    cost: 26_000,
    price: 32_000,
    stock: 20,
    min: 5,
  },
  {
    no: 86,
    name: "Giấy vệ sinh 10 cuộn",
    category: "Hóa phẩm",
    unit: "Bịch",
    cost: 52_000,
    price: 65_000,
    stock: 10,
    min: 3,
  },
  {
    no: 88,
    name: "Bột giặt 3kg",
    category: "Hóa phẩm",
    unit: "Túi",
    cost: 118_000,
    price: 135_000,
    stock: 0,
    min: 5,
  },
];

interface ContactSeed {
  name: string;
  phone: string | null;
  address?: string;
  debt: number;
  debtDays?: number; // nợ từ bao nhiêu ngày trước
  debtLimit?: number;
}

const CUSTOMERS: ContactSeed[] = [
  {
    name: "Anh Tuấn (thợ hồ)",
    phone: "0987112334",
    debt: 1_200_000,
    debtDays: 41,
    debtLimit: 2_000_000,
  },
  { name: "Cô Hoa", phone: "0903556120", debt: 650_000, debtDays: 35 },
  { name: "Bác Bình", phone: "0978203441", debt: 420_000, debtDays: 8 },
  { name: "Chị Lan", phone: "0912345678", debt: 363_000, debtDays: 20 },
  { name: "Chú Hải", phone: "0935870019", debt: 215_000, debtDays: 3 },
  { name: "Anh Minh", phone: "0908765432", debt: 0 },
];

const SUPPLIERS: ContactSeed[] = [
  {
    name: "Đại lý Hưng Thịnh",
    phone: "02838556677",
    address: "Chợ Bình Tây, Quận 6, TP.HCM",
    debt: 1_500_000,
    debtDays: 12,
  },
  {
    name: "Công ty Phân phối Sài Gòn",
    phone: "02839221100",
    address: "Quận Tân Bình, TP.HCM",
    debt: 0,
  },
];

// ---------------------------------------------------------------------------
// Sinh SQL
// ---------------------------------------------------------------------------

async function buildSql(): Promise<string> {
  const now = Date.now();
  const storeId = uuidv7();

  // Xóa bảng con trước bảng cha (D1 bật foreign_keys).
  for (const table of [
    "sessions",
    "login_attempts",
    "debt_entries",
    "stock_movements",
    "document_lines",
    "payments",
    "documents",
    "product_units",
    "products",
    "categories",
    "contacts",
    "counters",
    "users",
    "stores",
  ]) {
    statements.push(`DELETE FROM ${table};`);
  }

  insert("stores", {
    id: storeId,
    name: "Tạp hóa Minh Anh",
    phone: "0900000001",
    address: "45 Nguyễn Trãi, Phường 2, Quận 5, TP.HCM",
    receipt_footer: "Cảm ơn quý khách, hẹn gặp lại!",
    created_at: now,
  });

  const ownerId = uuidv7();
  const users = [
    { id: ownerId, phone: "0900000001", name: "Minh Anh", role: "owner" },
    { id: uuidv7(), phone: "0900000002", name: "Thu Hằng", role: "staff" },
  ];
  for (const u of users) {
    insert("users", {
      id: u.id,
      store_id: storeId,
      phone: u.phone,
      name: u.name,
      password_hash: await hashPassword(PASSWORD),
      role: u.role,
      is_active: true,
      created_at: now,
    });
  }

  const categoryIds = new Map<Category, string>();
  CATEGORIES.forEach((name, i) => {
    const id = uuidv7();
    categoryIds.set(name, id);
    insert("categories", { id, store_id: storeId, name, sort_order: i + 1 });
  });

  // Phiếu kiểm kho "Tồn đầu kỳ" để mỗi mặt hàng có dòng sổ kho khớp với tồn.
  const openingDocId = uuidv7();
  const openingAt = now - 60 * DAY;
  insert("documents", {
    id: openingDocId,
    store_id: storeId,
    type: "stock_count",
    code: formatCode("KK", 1),
    status: "completed",
    note: "Tồn đầu kỳ (dữ liệu mẫu)",
    created_by: ownerId,
    created_at: openingAt,
    completed_at: openingAt,
  });

  for (const p of PRODUCTS) {
    const id = uuidv7();
    const code = formatCode("SP", p.no);
    const stock = toMilli(p.stock);
    insert("products", {
      id,
      store_id: storeId,
      code,
      barcode: p.barcode ?? null,
      name: p.name,
      name_search: productSearchText({ name: p.name, code, barcode: p.barcode }),
      category_id: categoryIds.get(p.category)!,
      base_unit: p.unit,
      cost_price: p.cost,
      sale_price: p.price,
      stock,
      min_stock: toMilli(p.min),
      allow_negative: false,
      is_active: true,
      show_in_pos: true,
      created_at: openingAt,
      updated_at: openingAt,
    });
    for (const u of p.units ?? []) {
      insert("product_units", {
        id: uuidv7(),
        store_id: storeId,
        product_id: id,
        name: u.name,
        factor: u.factor,
        sale_price: u.price,
        barcode: null,
      });
    }
    if (stock !== 0) {
      insert("document_lines", {
        id: uuidv7(),
        store_id: storeId,
        document_id: openingDocId,
        product_id: id,
        unit_name: p.unit,
        factor: 1,
        qty: stock,
        base_qty: stock,
        unit_price: 0,
        line_total: 0,
        cost_price: p.cost,
        system_qty: 0,
        actual_qty: stock,
        reason: "Tồn đầu kỳ",
      });
      insert("stock_movements", {
        id: uuidv7(),
        store_id: storeId,
        product_id: id,
        document_id: openingDocId,
        type: "adjust",
        qty_change: stock,
        stock_after: stock,
        unit_cost: p.cost,
        note: "Tồn đầu kỳ",
        created_at: openingAt,
      });
    }
  }

  function seedContacts(type: "customer" | "supplier", prefix: string, list: ContactSeed[]) {
    list.forEach((c, i) => {
      const id = uuidv7();
      const code = formatCode(prefix, i + 1);
      const since = c.debt > 0 ? now - (c.debtDays ?? 0) * DAY : null;
      insert("contacts", {
        id,
        store_id: storeId,
        type,
        code,
        name: c.name,
        name_search: contactSearchText({ name: c.name, code, phone: c.phone }),
        phone: c.phone,
        address: c.address ?? null,
        note: null,
        debt: c.debt,
        debt_limit: c.debtLimit ?? null,
        debt_since: since,
        is_active: true,
        created_at: openingAt,
        updated_at: since ?? openingAt,
      });
      if (c.debt > 0) {
        insert("debt_entries", {
          id: uuidv7(),
          store_id: storeId,
          contact_id: id,
          document_id: null,
          payment_id: null,
          amount: c.debt,
          balance_after: c.debt,
          note: "Nợ cũ chuyển sang (dữ liệu mẫu)",
          created_at: since!,
        });
      }
    });
    return list.length;
  }

  const customerCount = seedContacts("customer", "KH", CUSTOMERS);
  const supplierCount = seedContacts("supplier", "NCC", SUPPLIERS);

  // Bộ đếm phải bắt đầu từ sau mã lớn nhất đã dùng.
  const counters: Record<string, number> = {
    SP: Math.max(...PRODUCTS.map((p) => p.no)),
    KH: customerCount,
    NCC: supplierCount,
    KK: 1,
  };
  for (const [kind, value] of Object.entries(counters)) {
    insert("counters", { store_id: storeId, kind, value });
  }

  return statements.join("\n") + "\n";
}

async function main() {
  const codes = new Set(PRODUCTS.map((p) => p.no));
  if (codes.size !== PRODUCTS.length) throw new Error("Trùng mã hàng trong dữ liệu seed");

  const sql = await buildSql();
  const dir = resolve(".wrangler", "seed");
  mkdirSync(dir, { recursive: true });
  const file = resolve(dir, "seed.sql");
  writeFileSync(file, sql, "utf8");

  console.log(`Đã sinh ${statements.length} câu lệnh → ${file}`);
  console.log("Nạp vào D1 local (dữ liệu cũ trong D1 local sẽ bị xóa)...");

  // `wrangler d1 execute --file` không nguyên tử: nếu lỗi giữa chừng, D1 local có thể bị xóa dở.
  // Khi đó sửa lỗi rồi chạy lại seed (seed luôn xóa sạch trước khi nạp).
  // Một chuỗi lệnh duy nhất qua shell (pnpm trên Windows là .cmd), đường dẫn đặt trong ngoặc kép.
  const result = spawnSync(`pnpm exec wrangler d1 execute ${DB_NAME} --local --file="${file}"`, {
    stdio: ["inherit", "ignore", "inherit"], // bỏ JSON kết quả từng câu lệnh cho gọn
    shell: true,
  });
  if (result.status !== 0) process.exit(result.status ?? 1);

  console.log(
    `\nXong. Đăng nhập: chủ 0900000001 / ${PASSWORD}, nhân viên 0900000002 / ${PASSWORD}`,
  );
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});

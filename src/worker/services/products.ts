import type { SQL } from "drizzle-orm";
import type { z } from "zod";
import {
  type createProductSchema,
  importRowSchema,
  type listProductsQuerySchema,
  type movementsQuerySchema,
  type updateProductSchema,
} from "../../shared/schemas/product";
import { productSearchText, toSearch } from "../../shared/text";
import type { StoreDb } from "../db/client";
import type { UserRole } from "../db/schema";
import { codeNumber } from "../lib/codes";
import { isConstraintError } from "../lib/db-errors";
import { AppError } from "../lib/errors";
import { productSearchValue } from "../lib/search";
import { uuidv7 } from "../lib/uuid";
import type { OpeningStockItem } from "../repositories/stock";
import type { SessionUser } from "../types";
import { ownerOnly, serializeMovement, serializeProduct, serializeProducts } from "./serialize";

type CreateInput = z.output<typeof createProductSchema>;
type UpdateInput = z.output<typeof updateProductSchema>;

// ---------- Đọc ----------

export async function listProducts(
  db: StoreDb,
  role: UserRole,
  query: z.output<typeof listProductsQuerySchema>,
) {
  const filters = { q: query.q, categoryId: query.categoryId };
  const [page, counts, stockValue] = await Promise.all([
    db.products.list(filters, query.status, query.sort, query.page, query.pageSize),
    db.products.counts(filters),
    role === "owner" ? db.products.stockValue() : Promise.resolve(0),
  ]);
  return {
    items: serializeProducts(page.items, role),
    total: page.total,
    page: query.page,
    pageSize: query.pageSize,
    counts,
    stockValue: ownerOnly(stockValue, role),
  };
}

const DAY_MS = 86_400_000;

export async function getProduct(db: StoreDb, role: UserRole, id: string, now = Date.now()) {
  const product = await db.products.findById(id);
  if (!product) throw new AppError("NOT_FOUND", "Không tìm thấy hàng hóa");
  // Phiếu nhập gần nhất gắn với giá vốn (mô tả nguồn của giá vốn bình quân) và nhân viên không
  // được xem phiếu nhập (/api/purchases chỉ owner), nên bỏ qua cho staff như costPrice.
  const [sold30d, lastPurchase] = await Promise.all([
    db.products.soldSince(id, now - 30 * DAY_MS),
    role === "owner" ? db.products.lastPurchase(id) : Promise.resolve(undefined),
  ]);
  return {
    ...serializeProduct(product, role),
    /** Đã bán trong 30 ngày qua (milli đơn vị cơ bản, trừ hàng trả lại). */
    sold30d,
    /** Phiếu nhập gần nhất: giá vốn bình quân cập nhật theo phiếu này. Chỉ owner. */
    lastPurchase: ownerOnly(lastPurchase ?? null, role),
  };
}

export async function lookupBarcode(db: StoreDb, role: UserRole, barcode: string) {
  const found = await db.products.findByBarcode(barcode);
  if (!found) throw new AppError("NOT_FOUND", "Không tìm thấy hàng có mã vạch này");
  return { product: serializeProduct(found.product, role), unit: found.unit };
}

export function posProducts(db: StoreDb) {
  return db.products.pos();
}

export async function productMovements(
  db: StoreDb,
  role: UserRole,
  id: string,
  query: z.output<typeof movementsQuerySchema>,
) {
  if (!(await db.products.exists(id))) throw new AppError("NOT_FOUND", "Không tìm thấy hàng hóa");
  const page = await db.products.movements(
    id,
    { type: query.type, from: query.from, to: query.to },
    query.page,
    query.pageSize,
  );
  return {
    items: page.items.map((m) => serializeMovement(m, role)),
    total: page.total,
    page: query.page,
    pageSize: query.pageSize,
  };
}

// ---------- Kiểm tra trước khi ghi ----------

async function assertCategory(db: StoreDb, categoryId: string | null) {
  if (categoryId && !(await db.categories.findById(categoryId))) {
    throw new AppError("INVALID_CATEGORY", "Nhóm hàng không tồn tại");
  }
}

/**
 * Mã vạch không trùng trong cửa hàng (kể cả mã vạch của đơn vị quy đổi). Không có UNIQUE trong DB
 * vì trải trên 2 bảng; hai người cùng lưu một mã vạch trong cùng tích tắc vẫn có thể lọt (chấp nhận).
 */
async function assertBarcodesFree(
  db: StoreDb,
  input: { barcode: string | null; units: { barcode: string | null }[] },
  excludeProductId?: string,
) {
  const wanted = [input.barcode, ...input.units.map((u) => u.barcode)].filter(
    (b): b is string => !!b,
  );
  if (wanted.length === 0) return;
  const taken = await db.products.barcodesTaken(wanted, excludeProductId);
  const first = wanted.find((b) => taken.has(b));
  if (first) {
    throw new AppError("BARCODE_TAKEN", `Mã vạch ${first} đã dùng cho hàng hóa khác`, undefined, {
      barcode: first,
    });
  }
}

/** Đổi lỗi ràng buộc DB thành lỗi nghiệp vụ dễ hiểu. */
function mapWriteError(err: unknown): never {
  if (isConstraintError(err, "UNIQUE", "products.code")) {
    throw new AppError("CODE_TAKEN", "Mã hàng này đã tồn tại");
  }
  if (isConstraintError(err, "CHECK", "products_stock_check")) {
    throw new AppError(
      "NEGATIVE_STOCK",
      'Tồn kho đang âm nên chưa thể tắt "Cho phép bán khi hết hàng". Hãy kiểm kho trước',
    );
  }
  throw err;
}

// ---------- Ghi ----------

interface ProductRowInput {
  name: string;
  code: string | null;
  barcode: string | null;
  categoryId: string | null;
  baseUnit: string;
  costPrice: number;
  salePrice: number;
  minStock: number;
  allowNegative: boolean;
  isActive: boolean;
  showInPos: boolean;
  note: string | null;
  units: { name: string; factor: number; salePrice: number | null; barcode: string | null }[];
  openingStock: number;
}

/**
 * Các câu lệnh tạo một mặt hàng (chưa gồm phiếu tồn đầu kỳ): cấp mã (nếu bỏ trống),
 * đẩy bộ đếm khi mã nhập tay đúng mẫu SPxxxxxx, INSERT hàng (stock = tồn đầu kỳ) và đơn vị.
 * `idempotencyKey`: chỉ tạo đơn lẻ (POST /products) mới có; dòng import không chống trùng kiểu
 * này (xem ghi chú ở importProducts).
 */
function productStatements(
  db: StoreDb,
  id: string,
  input: ProductRowInput,
  now: number,
  idempotencyKey: string | null = null,
) {
  const statements = [];
  let code: string | SQL<string>;
  if (input.code) {
    code = input.code;
    const n = codeNumber("SP", input.code);
    if (n !== null) statements.push(db.codes.atLeast("SP", n));
  } else {
    const next = db.codes.next("SP");
    statements.push(next.bump);
    code = next.code;
  }
  statements.push(
    db.products.insert({
      id,
      code,
      barcode: input.barcode,
      name: input.name,
      nameSearch: productSearchValue({ name: input.name, code, barcode: input.barcode }),
      categoryId: input.categoryId,
      baseUnit: input.baseUnit,
      costPrice: input.costPrice,
      salePrice: input.salePrice,
      stock: input.openingStock,
      minStock: input.minStock,
      allowNegative: input.allowNegative,
      isActive: input.isActive,
      showInPos: input.showInPos,
      note: input.note,
      idempotencyKey,
      createdAt: now,
      updatedAt: now,
    }),
    ...db.products.insertUnits(
      id,
      input.units.map((u) => ({ id: uuidv7(), ...u })),
    ),
  );
  return statements;
}

function openingItem(id: string, input: ProductRowInput): OpeningStockItem | null {
  if (input.openingStock <= 0) return null;
  return {
    productId: id,
    baseUnit: input.baseUnit,
    qty: input.openingStock,
    unitCost: input.costPrice,
    lineId: uuidv7(),
    movementId: uuidv7(),
  };
}

/** Phiếu kiểm kho "Tồn đầu kỳ" cho các hàng có tồn ban đầu > 0 (rỗng nếu không có hàng nào). */
function openingStatements(
  db: StoreDb,
  actor: SessionUser,
  items: OpeningStockItem[],
  now: number,
) {
  if (items.length === 0) return [];
  return db.stock.openingStockStatements({
    documentId: uuidv7(),
    createdBy: actor.id,
    now,
    items,
  });
}

export interface CreateProductResult {
  product: Awaited<ReturnType<typeof getProduct>>;
  /** true: idempotencyKey đã dùng trước đó, trả lại hàng cũ, không ghi gì thêm. */
  replayed: boolean;
}

/**
 * Tạo hàng: hàng + đơn vị + (phiếu KK tồn đầu kỳ + sổ kho) trong MỘT batch.
 * Gửi lại cùng idempotencyKey (mạng chập chờn, bấm hai lần) trả lại hàng đã tạo, không tạo thêm.
 */
export async function createProduct(
  db: StoreDb,
  actor: SessionUser,
  input: CreateInput,
): Promise<CreateProductResult> {
  const existing = await db.products.findByIdempotencyKey(input.idempotencyKey);
  if (existing) return { product: await getProduct(db, actor.role, existing.id), replayed: true };

  await assertCategory(db, input.categoryId);
  await assertBarcodesFree(db, input);
  const now = Date.now();
  const id = uuidv7();
  const opening = openingItem(id, input);
  try {
    await db.batchAll([
      ...productStatements(db, id, input, now, input.idempotencyKey),
      ...openingStatements(db, actor, opening ? [opening] : [], now),
    ]);
  } catch (err) {
    // Request trùng gửi gần như đồng thời: lượt đọc ở trên chưa thấy, nhưng INSERT vấp UNIQUE.
    if (isConstraintError(err, "UNIQUE", "products.idempotency_key")) {
      const again = await db.products.findByIdempotencyKey(input.idempotencyKey);
      if (again) return { product: await getProduct(db, actor.role, again.id), replayed: true };
    }
    mapWriteError(err);
  }
  return { product: await getProduct(db, actor.role, id), replayed: false };
}

/**
 * Sửa hàng: không đụng tới stock và cost_price (chỉ đổi qua chứng từ). Đơn vị quy đổi thay thế
 * toàn bộ (xóa cũ, thêm mới) trong cùng batch; name_search luôn tính lại.
 */
export async function updateProduct(
  db: StoreDb,
  actor: SessionUser,
  id: string,
  input: UpdateInput,
) {
  const current = await db.products.findById(id);
  if (!current) throw new AppError("NOT_FOUND", "Không tìm thấy hàng hóa");
  await assertCategory(db, input.categoryId);
  await assertBarcodesFree(db, input, id);

  // Bỏ trống mã khi sửa thì giữ mã cũ.
  const code = input.code ?? current.code;
  const now = Date.now();
  const n = input.code ? codeNumber("SP", input.code) : null;
  try {
    await db.batchAll([
      ...(n !== null ? [db.codes.atLeast("SP", n)] : []),
      db.products.update(id, {
        code,
        barcode: input.barcode,
        name: input.name,
        nameSearch: productSearchText({ name: input.name, code, barcode: input.barcode }),
        categoryId: input.categoryId,
        baseUnit: input.baseUnit,
        salePrice: input.salePrice,
        minStock: input.minStock,
        allowNegative: input.allowNegative,
        isActive: input.isActive,
        showInPos: input.showInPos,
        note: input.note,
        updatedAt: now,
      }),
      db.products.deleteUnits(id),
      ...db.products.insertUnits(
        id,
        input.units.map((u) => ({ id: uuidv7(), ...u })),
      ),
    ]);
  } catch (err) {
    mapWriteError(err);
  }
  return getProduct(db, actor.role, id);
}

// ---------- Nhập từ Excel ----------

/** Mỗi batch nhập tối đa ngần này dòng; batch lỗi thì chạy lại từng dòng để tách dòng hỏng. */
const IMPORT_CHUNK = 20;

export type ImportRowResult =
  { row: number; ok: true; id: string; code: string } | { row: number; ok: false; error: string };

interface PreparedRow {
  row: number;
  id: string;
  input: ProductRowInput;
}

function errorMessage(err: unknown): string {
  if (err instanceof AppError) return err.message;
  if (isConstraintError(err, "UNIQUE", "products.code")) return "Mã hàng này đã tồn tại";
  console.error("Lỗi nhập hàng:", err instanceof Error ? err.message : err);
  return "Không lưu được dòng này";
}

/**
 * Nhập tối đa 500 dòng. Kiểm tra từng dòng trước (dữ liệu, trùng mã/mã vạch trong file và trong
 * cửa hàng), tạo nhóm hàng còn thiếu, rồi ghi theo nhóm nhỏ. Mỗi nhóm có phiếu tồn đầu kỳ riêng.
 */
export async function importProducts(db: StoreDb, actor: SessionUser, rawRows: unknown[]) {
  const results: ImportRowResult[] = [];
  const fail = (row: number, error: string) => results.push({ row, ok: false, error });

  // 1. Validate từng dòng.
  const parsed: { row: number; data: z.output<typeof importRowSchema> }[] = [];
  rawRows.forEach((raw, i) => {
    const r = importRowSchema.safeParse(raw);
    if (r.success) parsed.push({ row: i + 1, data: r.data });
    else fail(i + 1, r.error.issues[0]?.message ?? "Dữ liệu không hợp lệ");
  });

  // 2. Trùng mã / mã vạch: trong file (dòng sau lỗi) và với hàng đã có.
  const [codesTaken, barcodesTaken] = await Promise.all([
    db.products.codesTaken(parsed.flatMap((p) => (p.data.code ? [p.data.code] : []))),
    db.products.barcodesTaken(parsed.flatMap((p) => (p.data.barcode ? [p.data.barcode] : []))),
  ]);
  const seenCodes = new Set<string>();
  const seenBarcodes = new Set<string>();
  const valid = parsed.filter(({ row, data }) => {
    if (data.code && (codesTaken.has(data.code) || seenCodes.has(data.code))) {
      fail(row, `Mã hàng ${data.code} đã tồn tại`);
      return false;
    }
    if (data.barcode && (barcodesTaken.has(data.barcode) || seenBarcodes.has(data.barcode))) {
      fail(row, `Mã vạch ${data.barcode} đã dùng cho hàng hóa khác`);
      return false;
    }
    if (data.code) seenCodes.add(data.code);
    if (data.barcode) seenBarcodes.add(data.barcode);
    return true;
  });

  // 3. Nhóm hàng theo tên (không phân biệt dấu/hoa thường); tạo nhóm còn thiếu trong một batch.
  const categoryIds = new Map<string, string>();
  for (const c of await db.categories.list()) categoryIds.set(toSearch(c.name), c.id);
  const newCategories: { id: string; name: string; sortOrder: number }[] = [];
  let sortOrder = await db.categories.maxSortOrder();
  for (const { data } of valid) {
    if (!data.category) continue;
    const key = toSearch(data.category);
    if (!categoryIds.has(key)) {
      const id = uuidv7();
      categoryIds.set(key, id);
      newCategories.push({ id, name: data.category, sortOrder: ++sortOrder });
    }
  }
  if (newCategories.length > 0) {
    await db.batchAll(newCategories.map((c) => db.categories.insert(c)));
  }

  const prepared: PreparedRow[] = valid.map(({ row, data }) => ({
    row,
    id: uuidv7(),
    input: {
      name: data.name,
      code: data.code,
      barcode: data.barcode,
      categoryId: data.category ? (categoryIds.get(toSearch(data.category)) ?? null) : null,
      baseUnit: data.unit,
      costPrice: data.costPrice,
      salePrice: data.salePrice,
      minStock: data.minStock,
      allowNegative: false,
      isActive: true,
      showInPos: true,
      note: null,
      units: [],
      openingStock: data.stock,
    },
  }));

  // 4. Ghi theo nhóm; nhóm lỗi thì ghi lại từng dòng.
  const now = Date.now();
  const write = async (rows: PreparedRow[]) => {
    const items = rows.flatMap((r) => {
      const it = openingItem(r.id, r.input);
      return it ? [it] : [];
    });
    await db.batchAll([
      ...rows.flatMap((r) => productStatements(db, r.id, r.input, now)),
      ...openingStatements(db, actor, items, now),
    ]);
  };
  const saved: PreparedRow[] = [];
  for (let i = 0; i < prepared.length; i += IMPORT_CHUNK) {
    const chunk = prepared.slice(i, i + IMPORT_CHUNK);
    try {
      await write(chunk);
      saved.push(...chunk);
    } catch {
      for (const r of chunk) {
        try {
          await write([r]);
          saved.push(r);
        } catch (err) {
          fail(r.row, errorMessage(err));
        }
      }
    }
  }

  // 5. Lấy mã đã cấp (mã tự sinh chỉ biết sau khi ghi).
  const codes = await db.products.codesByIds(saved.map((r) => r.id));
  for (const r of saved)
    results.push({ row: r.row, ok: true, id: r.id, code: codes.get(r.id) ?? "" });

  results.sort((a, b) => a.row - b.row);
  const succeeded = results.filter((r) => r.ok).length;
  return {
    total: rawRows.length,
    succeeded,
    failed: rawRows.length - succeeded,
    createdCategories: newCategories.map((c) => c.name),
    rows: results,
  };
}

// ---------- Ảnh ----------

/** Nhận diện định dạng qua "magic bytes" (không tin MIME do trình duyệt gửi). */
function detectImage(bytes: Uint8Array): { ext: "jpg" | "png" | "webp"; mime: string } | null {
  const b = (i: number) => bytes[i] ?? -1;
  if (b(0) === 0xff && b(1) === 0xd8 && b(2) === 0xff) return { ext: "jpg", mime: "image/jpeg" };
  if (b(0) === 0x89 && b(1) === 0x50 && b(2) === 0x4e && b(3) === 0x47) {
    return { ext: "png", mime: "image/png" };
  }
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.slice(from, to));
  if (bytes.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") {
    return { ext: "webp", mime: "image/webp" };
  }
  return null;
}

export async function uploadProductImage(
  db: StoreDb,
  bucket: R2Bucket,
  actor: SessionUser,
  id: string,
  file: File,
  maxBytes: number,
) {
  if (file.size > maxBytes) {
    throw new AppError("IMAGE_TOO_LARGE", "Ảnh quá lớn, tối đa 2MB");
  }
  const current = await db.products.imageKeyOf(id);
  if (!current) throw new AppError("NOT_FOUND", "Không tìm thấy hàng hóa");

  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = detectImage(bytes);
  if (!kind) throw new AppError("INVALID_IMAGE", "Chỉ nhận ảnh JPG, PNG hoặc WEBP");

  const key = `${db.storeId}/products/${id}-${uuidv7()}.${kind.ext}`;
  await bucket.put(key, bytes, { httpMetadata: { contentType: kind.mime } });
  const [row] = await db.products.setImageKey(id, key, Date.now());
  if (!row) {
    await bucket.delete(key);
    throw new AppError("NOT_FOUND", "Không tìm thấy hàng hóa");
  }
  // Ảnh cũ không còn ai dùng; xóa lỗi cũng không sao (chỉ tốn chỗ).
  if (current.imageKey) await bucket.delete(current.imageKey).catch(() => undefined);
  return getProduct(db, actor.role, id);
}

/** Ảnh chỉ đọc được khi key thuộc cửa hàng của người đang đăng nhập. */
export async function getImage(db: StoreDb, bucket: R2Bucket, key: string) {
  if (!key.startsWith(`${db.storeId}/`) || key.includes("..")) {
    throw new AppError("NOT_FOUND", "Không tìm thấy ảnh");
  }
  const object = await bucket.get(key);
  if (!object) throw new AppError("NOT_FOUND", "Không tìm thấy ảnh");
  return object;
}

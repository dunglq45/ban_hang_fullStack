import { Hono } from "hono";
import { z } from "zod";
import { createCategorySchema, updateCategorySchema } from "../../shared/schemas/category";
import { idParamSchema } from "../../shared/schemas/common";
import {
  createContactSchema,
  listContactsQuerySchema,
  updateContactSchema,
} from "../../shared/schemas/contact";
import {
  createProductSchema,
  importProductsSchema,
  listProductsQuerySchema,
  lookupQuerySchema,
  MAX_IMAGE_BYTES,
  movementsQuerySchema,
  updateProductSchema,
} from "../../shared/schemas/product";
import { AppError } from "../lib/errors";
import { validate } from "../lib/validate";
import { requireAuth, requireOwner } from "../middleware/session";
import {
  createCategory,
  deleteCategory,
  listCategories,
  updateCategory,
} from "../services/categories";
import { createContact, getContact, listContacts, updateContact } from "../services/contacts";
import {
  createProduct,
  getImage,
  getProduct,
  importProducts,
  listProducts,
  lookupBarcode,
  posProducts,
  productMovements,
  updateProduct,
  uploadProductImage,
} from "../services/products";
import type { AuthEnv } from "../types";

export const categoryRoutes = new Hono<AuthEnv>()
  .use(requireAuth)
  .get("/", async (c) => c.json({ items: await listCategories(c.get("db")) }))
  .post("/", requireOwner, validate("json", createCategorySchema), async (c) =>
    c.json(await createCategory(c.get("db"), c.req.valid("json")), 201),
  )
  .patch(
    "/:id",
    requireOwner,
    validate("param", idParamSchema),
    validate("json", updateCategorySchema),
    async (c) =>
      c.json(await updateCategory(c.get("db"), c.req.valid("param").id, c.req.valid("json"))),
  )
  .delete("/:id", requireOwner, validate("param", idParamSchema), async (c) => {
    await deleteCategory(c.get("db"), c.req.valid("param").id);
    return c.json({ ok: true });
  });

// Các đường dẫn cố định (/lookup, /pos, /import) phải khai báo trước /:id.
export const productRoutes = new Hono<AuthEnv>()
  .use(requireAuth)
  .get("/", validate("query", listProductsQuerySchema), async (c) =>
    c.json(await listProducts(c.get("db"), c.get("user").role, c.req.valid("query"))),
  )
  .get("/lookup", validate("query", lookupQuerySchema), async (c) =>
    c.json(await lookupBarcode(c.get("db"), c.get("user").role, c.req.valid("query").barcode)),
  )
  .get("/pos", async (c) => c.json({ items: await posProducts(c.get("db")) }))
  .post("/import", requireOwner, validate("json", importProductsSchema), async (c) =>
    c.json(await importProducts(c.get("db"), c.get("user"), c.req.valid("json").rows)),
  )
  .post("/", requireOwner, validate("json", createProductSchema), async (c) =>
    c.json(await createProduct(c.get("db"), c.get("user"), c.req.valid("json")), 201),
  )
  .get("/:id", validate("param", idParamSchema), async (c) =>
    c.json(await getProduct(c.get("db"), c.get("user").role, c.req.valid("param").id)),
  )
  .get(
    "/:id/movements",
    validate("param", idParamSchema),
    validate("query", movementsQuerySchema),
    async (c) =>
      c.json(
        await productMovements(
          c.get("db"),
          c.get("user").role,
          c.req.valid("param").id,
          c.req.valid("query"),
        ),
      ),
  )
  .put(
    "/:id",
    requireOwner,
    validate("param", idParamSchema),
    validate("json", updateProductSchema),
    async (c) =>
      c.json(
        await updateProduct(
          c.get("db"),
          c.get("user"),
          c.req.valid("param").id,
          c.req.valid("json"),
        ),
      ),
  )
  .post("/:id/image", requireOwner, validate("param", idParamSchema), async (c) => {
    // Chặn sớm body quá lớn trước khi đọc vào bộ nhớ (chừa chỗ cho phần bao multipart).
    // Thiếu Content-Length (gửi kiểu chunked) thì từ chối, để không phải đọc body không giới hạn.
    const length = Number(c.req.header("Content-Length"));
    if (!Number.isFinite(length) || length <= 0) {
      throw new AppError("INVALID_IMAGE", "Không đọc được ảnh gửi lên");
    }
    if (length > MAX_IMAGE_BYTES + 64 * 1024) {
      throw new AppError("IMAGE_TOO_LARGE", "Ảnh quá lớn, tối đa 2MB");
    }
    const body = await c.req.parseBody().catch(() => {
      throw new AppError("INVALID_IMAGE", "Không đọc được ảnh gửi lên");
    });
    const file = body["file"];
    if (!(file instanceof File)) {
      throw new AppError("INVALID_IMAGE", 'Vui lòng chọn ảnh (trường "file")');
    }
    return c.json(
      await uploadProductImage(
        c.get("db"),
        c.env.IMAGES,
        c.get("user"),
        c.req.valid("param").id,
        file,
        MAX_IMAGE_BYTES,
      ),
    );
  });

export const imageRoutes = new Hono<AuthEnv>()
  .use(requireAuth)
  .get("/:key{.+}", validate("param", z.object({ key: z.string().min(1).max(300) })), async (c) => {
    const object = await getImage(c.get("db"), c.env.IMAGES, c.req.valid("param").key);
    return c.body(object.body, 200, {
      "Content-Type": object.httpMetadata?.contentType ?? "application/octet-stream",
      // Key chứa uuid nên nội dung không bao giờ đổi; "private" vì cần đăng nhập.
      "Cache-Control": "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    });
  });

export const contactRoutes = new Hono<AuthEnv>()
  .use(requireAuth)
  .get("/", validate("query", listContactsQuerySchema), async (c) =>
    c.json(await listContacts(c.get("db"), c.req.valid("query"))),
  )
  .get("/:id", validate("param", idParamSchema), async (c) =>
    c.json(await getContact(c.get("db"), c.req.valid("param").id)),
  )
  .post("/", validate("json", createContactSchema), async (c) =>
    c.json(await createContact(c.get("db"), c.get("user").role, c.req.valid("json")), 201),
  )
  .put("/:id", validate("param", idParamSchema), validate("json", updateContactSchema), async (c) =>
    c.json(
      await updateContact(
        c.get("db"),
        c.get("user").role,
        c.req.valid("param").id,
        c.req.valid("json"),
      ),
    ),
  );

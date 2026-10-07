// Tài liệu OpenAPI 3.1 cho trang /api/docs (chỉ dev). Schema body/query lấy thẳng từ các schema Zod
// mà route đang validate (src/shared/schemas), nên không lệch với code. Danh sách endpoint viết tay
// ở bảng ENDPOINTS; test/api/docs.test.ts bảo đảm mọi route của app đều có trong bảng.
import { z } from "zod";
import { ERROR_CODES } from "../../shared/errors";
import { changePasswordSchema, loginSchema, registerSchema } from "../../shared/schemas/auth";
import { createCategorySchema, updateCategorySchema } from "../../shared/schemas/category";
import { idParamSchema } from "../../shared/schemas/common";
import {
  createContactSchema,
  listContactsQuerySchema,
  updateContactSchema,
} from "../../shared/schemas/contact";
import {
  createPurchaseSchema,
  createSaleSchema,
  createStockCountSchema,
  listDocumentsQuerySchema,
  scanSchema,
  updatePurchaseSchema,
  updateStockCountLinesSchema,
} from "../../shared/schemas/document";
import { createPaymentSchema } from "../../shared/schemas/payment";
import {
  createProductSchema,
  importProductsSchema,
  listProductsQuerySchema,
  lookupQuerySchema,
  movementsQuerySchema,
  updateProductSchema,
} from "../../shared/schemas/product";
import {
  debtEntriesQuerySchema,
  periodQuerySchema,
  restockQuerySchema,
  revenueDailyQuerySchema,
  topProductsQuerySchema,
} from "../../shared/schemas/report";
import { createUserSchema, updateStoreSchema, updateUserSchema } from "../../shared/schemas/store";

type Method = "get" | "post" | "put" | "patch" | "delete";
/** public: không cần đăng nhập; user: mọi người đã đăng nhập; owner: chỉ chủ cửa hàng. */
type Access = "public" | "user" | "owner";

interface Endpoint {
  method: Method;
  /** Đường dẫn kiểu Hono (dưới /api), vd. /products/:id */
  path: string;
  tag: string;
  summary: string;
  access: Access;
  description?: string;
  query?: z.ZodType;
  body?: z.ZodType;
  /** Ví dụ body điền sẵn khi bấm "Try it out". */
  example?: unknown;
  /** Upload ảnh: multipart/form-data, trường `file`. */
  multipart?: boolean;
  /** Mã HTTP khi thành công (mặc định 200). */
  status?: number;
}

const ENDPOINTS: Endpoint[] = [
  { method: "get", path: "/health", tag: "Hệ thống", summary: "Kiểm tra server", access: "public" },

  // Auth
  {
    method: "post",
    path: "/auth/register",
    tag: "Auth",
    summary: "Đăng ký cửa hàng + tài khoản chủ",
    access: "public",
    body: registerSchema,
    status: 201,
  },
  {
    method: "post",
    path: "/auth/login",
    tag: "Auth",
    summary: "Đăng nhập (đặt cookie sid)",
    description:
      "Tài khoản mẫu sau `pnpm db:seed:local`: chủ `0900000001`, nhân viên `0900000002`, mật khẩu `123456`.",
    access: "public",
    body: loginSchema,
    example: { phone: "0900000001", password: "123456", remember: true },
  },
  { method: "post", path: "/auth/logout", tag: "Auth", summary: "Đăng xuất", access: "user" },
  {
    method: "get",
    path: "/auth/me",
    tag: "Auth",
    summary: "Người dùng và cửa hàng hiện tại",
    access: "user",
  },
  {
    method: "put",
    path: "/auth/password",
    tag: "Auth",
    summary: "Tự đổi mật khẩu (mọi vai trò)",
    description:
      "Phải đúng mật khẩu hiện tại (sai → `WRONG_PASSWORD`). Giữ phiên đang dùng, đăng xuất các thiết bị khác.",
    access: "user",
    body: changePasswordSchema,
  },

  // Cửa hàng, nhân viên
  {
    method: "get",
    path: "/store",
    tag: "Cửa hàng",
    summary: "Thông tin cửa hàng",
    access: "owner",
  },
  {
    method: "put",
    path: "/store",
    tag: "Cửa hàng",
    summary: "Sửa thông tin cửa hàng, chân hóa đơn",
    access: "owner",
    body: updateStoreSchema,
  },
  {
    method: "get",
    path: "/users",
    tag: "Cửa hàng",
    summary: "Danh sách nhân viên",
    access: "owner",
  },
  {
    method: "post",
    path: "/users",
    tag: "Cửa hàng",
    summary: "Thêm nhân viên",
    access: "owner",
    body: createUserSchema,
    status: 201,
  },
  {
    method: "patch",
    path: "/users/:id",
    tag: "Cửa hàng",
    summary: "Đổi tên, vai trò, khóa/mở, đặt lại mật khẩu",
    access: "owner",
    body: updateUserSchema,
  },

  // Nhóm hàng
  { method: "get", path: "/categories", tag: "Nhóm hàng", summary: "Danh sách", access: "user" },
  {
    method: "post",
    path: "/categories",
    tag: "Nhóm hàng",
    summary: "Thêm nhóm",
    access: "owner",
    body: createCategorySchema,
    status: 201,
  },
  {
    method: "patch",
    path: "/categories/:id",
    tag: "Nhóm hàng",
    summary: "Sửa nhóm",
    access: "owner",
    body: updateCategorySchema,
  },
  {
    method: "delete",
    path: "/categories/:id",
    tag: "Nhóm hàng",
    summary: "Xóa nhóm (chỉ khi không còn hàng)",
    access: "owner",
  },

  // Hàng hóa
  {
    method: "get",
    path: "/products",
    tag: "Hàng hóa",
    summary: "Danh sách hàng (staff không có giá vốn)",
    access: "user",
    query: listProductsQuerySchema,
  },
  {
    method: "get",
    path: "/products/lookup",
    tag: "Hàng hóa",
    summary: "Tra mã vạch",
    access: "user",
    query: lookupQuerySchema,
  },
  {
    method: "get",
    path: "/products/pos",
    tag: "Hàng hóa",
    summary: "Danh sách gọn cho POS",
    access: "user",
  },
  {
    method: "post",
    path: "/products/import",
    tag: "Hàng hóa",
    summary: "Nhập danh sách hàng (tối đa 500 dòng)",
    access: "owner",
    body: importProductsSchema,
  },
  {
    method: "post",
    path: "/products",
    tag: "Hàng hóa",
    summary: "Thêm hàng (kèm đơn vị, tồn đầu kỳ)",
    access: "owner",
    body: createProductSchema,
    status: 201,
  },
  {
    method: "get",
    path: "/products/:id",
    tag: "Hàng hóa",
    summary: "Chi tiết hàng",
    access: "user",
  },
  {
    method: "get",
    path: "/products/:id/movements",
    tag: "Hàng hóa",
    summary: "Lịch sử kho",
    access: "user",
    query: movementsQuerySchema,
  },
  {
    method: "put",
    path: "/products/:id",
    tag: "Hàng hóa",
    summary: "Sửa hàng (không sửa tồn, giá vốn)",
    access: "owner",
    body: updateProductSchema,
  },
  {
    method: "post",
    path: "/products/:id/image",
    tag: "Hàng hóa",
    summary: "Tải ảnh hàng (≤ 2MB, jpg/png/webp)",
    access: "owner",
    multipart: true,
  },
  {
    method: "get",
    path: "/images/:key{.+}",
    tag: "Hàng hóa",
    summary: "Ảnh hàng hóa từ R2",
    access: "user",
  },

  // Danh bạ, sổ nợ
  {
    method: "get",
    path: "/contacts",
    tag: "Khách hàng, NCC",
    summary: "Danh sách khách hàng / nhà cung cấp",
    access: "user",
    query: listContactsQuerySchema,
  },
  {
    method: "get",
    path: "/contacts/:id",
    tag: "Khách hàng, NCC",
    summary: "Chi tiết (kèm lần thu/trả gần nhất)",
    access: "user",
  },
  {
    method: "get",
    path: "/contacts/:id/debt-entries",
    tag: "Khách hàng, NCC",
    summary: "Sổ chi tiết công nợ",
    access: "user",
    query: debtEntriesQuerySchema,
  },
  {
    method: "post",
    path: "/contacts",
    tag: "Khách hàng, NCC",
    summary: "Thêm khách hàng / NCC",
    access: "user",
    body: createContactSchema,
    status: 201,
  },
  {
    method: "put",
    path: "/contacts/:id",
    tag: "Khách hàng, NCC",
    summary: "Sửa thông tin",
    access: "user",
    body: updateContactSchema,
  },
  {
    method: "get",
    path: "/debts/summary",
    tag: "Thu chi, công nợ",
    summary: "Tổng phải thu, quá 30 ngày, đã thu tháng này, phải trả",
    access: "user",
  },

  // Chứng từ
  {
    method: "post",
    path: "/sales",
    tag: "Chứng từ",
    summary: "Tạo hóa đơn bán (201 mới, 200 gửi lại cùng idempotencyKey)",
    access: "user",
    body: createSaleSchema,
    status: 201,
  },
  {
    method: "post",
    path: "/purchases",
    tag: "Chứng từ",
    summary: "Tạo phiếu nhập (nháp hoặc hoàn thành)",
    access: "owner",
    body: createPurchaseSchema,
    status: 201,
  },
  {
    method: "put",
    path: "/purchases/:id",
    tag: "Chứng từ",
    summary: "Sửa phiếu nhập nháp",
    access: "owner",
    body: updatePurchaseSchema,
  },
  {
    method: "post",
    path: "/purchases/:id/complete",
    tag: "Chứng từ",
    summary: "Hoàn thành phiếu nhập nháp",
    access: "owner",
  },
  {
    method: "get",
    path: "/documents",
    tag: "Chứng từ",
    summary: "Danh sách chứng từ (staff chỉ hóa đơn bán)",
    access: "user",
    query: listDocumentsQuerySchema,
  },
  {
    method: "get",
    path: "/documents/:id",
    tag: "Chứng từ",
    summary: "Chi tiết chứng từ",
    access: "user",
  },
  {
    method: "post",
    path: "/documents/:id/cancel",
    tag: "Chứng từ",
    summary: "Hủy chứng từ (bút toán đảo)",
    access: "owner",
  },

  // Thu chi
  {
    method: "post",
    path: "/payments",
    tag: "Thu chi, công nợ",
    summary: "Lập phiếu thu (khách) / phiếu chi (NCC, chỉ chủ)",
    access: "user",
    body: createPaymentSchema,
    status: 201,
  },
  {
    method: "get",
    path: "/payments/:id",
    tag: "Thu chi, công nợ",
    summary: "Chi tiết phiếu",
    access: "user",
  },
  {
    method: "post",
    path: "/payments/:id/cancel",
    tag: "Thu chi, công nợ",
    summary: "Hủy phiếu thu/chi",
    access: "owner",
  },

  // Kiểm kho
  {
    method: "post",
    path: "/stock-counts",
    tag: "Kiểm kho",
    summary: "Tạo phiếu kiểm nháp",
    access: "owner",
    body: createStockCountSchema,
    status: 201,
  },
  {
    method: "get",
    path: "/stock-counts/:id",
    tag: "Kiểm kho",
    summary: "Xem phiếu kiểm",
    access: "user",
  },
  {
    method: "patch",
    path: "/stock-counts/:id/lines",
    tag: "Kiểm kho",
    summary: "Ghi số đếm thực tế, lý do",
    access: "user",
    body: updateStockCountLinesSchema,
  },
  {
    method: "post",
    path: "/stock-counts/:id/scan",
    tag: "Kiểm kho",
    summary: "Quét mã vạch: +1 đơn vị",
    access: "user",
    body: scanSchema,
  },
  {
    method: "post",
    path: "/stock-counts/:id/complete",
    tag: "Kiểm kho",
    summary: "Hoàn thành kiểm kho",
    access: "owner",
  },

  // Báo cáo
  {
    method: "get",
    path: "/reports/overview",
    tag: "Báo cáo",
    summary: "Tổng quan: doanh thu, lợi nhuận gộp, phải thu, hàng cần nhập",
    access: "owner",
    query: periodQuerySchema,
  },
  {
    method: "get",
    path: "/reports/revenue-daily",
    tag: "Báo cáo",
    summary: "Doanh thu theo ngày (giờ VN)",
    access: "owner",
    query: revenueDailyQuerySchema,
  },
  {
    method: "get",
    path: "/reports/top-products",
    tag: "Báo cáo",
    summary: "Hàng bán chạy",
    access: "owner",
    query: topProductsQuerySchema,
  },
  {
    method: "get",
    path: "/reports/restock",
    tag: "Báo cáo",
    summary: "Hàng cần nhập",
    access: "owner",
    query: restockQuerySchema,
  },
];

const ACCESS_TEXT: Record<Access, string> = {
  public: "Không cần đăng nhập.",
  user: "🔒 Cần đăng nhập.",
  owner: "🔒👑 Chỉ chủ cửa hàng.",
};

/** Schema JSON của phía INPUT (cái client gửi): bỏ qua transform, chỗ không biểu diễn được thành {}. */
function jsonSchema(schema: z.ZodType): Record<string, unknown> {
  const { $schema: _drop, ...rest } = z.toJSONSchema(schema, {
    io: "input",
    unrepresentable: "any",
  }) as Record<string, unknown>;
  return rest;
}

/** /products/:id → /products/{id}; /images/:key{.+} → /images/{key} */
export function toOpenApiPath(honoPath: string): string {
  return honoPath.replace(/:([A-Za-z_]+)(\{[^}]*\})?/g, "{$1}");
}

function pathParams(path: string) {
  const idSchema = jsonSchema(idParamSchema.shape.id);
  return [...path.matchAll(/:([A-Za-z_]+)/g)].map((m) => ({
    name: m[1]!,
    in: "path",
    required: true,
    schema: m[1] === "id" ? idSchema : { type: "string" },
  }));
}

function queryParams(schema: z.ZodType) {
  const json = jsonSchema(schema) as {
    properties?: Record<string, Record<string, unknown>>;
    required?: string[];
  };
  return Object.entries(json.properties ?? {}).map(([name, prop]) => ({
    name,
    in: "query",
    // Có default thì client không bắt buộc gửi.
    required: (json.required ?? []).includes(name) && !("default" in prop),
    schema: prop,
    ...(typeof prop.description === "string" ? { description: prop.description } : {}),
  }));
}

/** Danh sách "METHOD /api/path" đã có trong tài liệu (dùng cho test đối chiếu với route thật). */
export function documentedRoutes(): string[] {
  return ENDPOINTS.map((e) => `${e.method.toUpperCase()} /api${e.path}`);
}

export function buildOpenApi() {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const e of ENDPOINTS) {
    const key = toOpenApiPath(`/api${e.path}`);
    const status = String(e.status ?? 200);
    const requestBody = e.body
      ? {
          required: true,
          content: {
            "application/json": {
              schema: jsonSchema(e.body),
              ...(e.example !== undefined ? { example: e.example } : {}),
            },
          },
        }
      : e.multipart
        ? {
            required: true,
            content: {
              "multipart/form-data": {
                schema: {
                  type: "object",
                  required: ["file"],
                  properties: { file: { type: "string", format: "binary" } },
                },
              },
            },
          }
        : undefined;
    paths[key] = {
      ...paths[key],
      [e.method]: {
        tags: [e.tag],
        summary: e.summary,
        description: [ACCESS_TEXT[e.access], e.description].filter(Boolean).join("\n\n"),
        ...(e.access === "public" ? { security: [] } : {}),
        parameters: [...pathParams(e.path), ...(e.query ? queryParams(e.query) : [])],
        ...(requestBody ? { requestBody } : {}),
        responses: {
          [status]: { description: "Thành công", content: { "application/json": {} } },
          default: {
            description: "Lỗi nghiệp vụ hoặc validate",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
        },
      },
    };
  }

  return {
    openapi: "3.1.0",
    info: {
      title: "API Quản lý cửa hàng",
      version: "0.7.0",
      description: [
        "Tài liệu sinh từ schema Zod (`src/shared/schemas`). Chỉ có khi chạy `pnpm dev`.",
        "",
        "**Cách thử:** gọi `POST /api/auth/login` (tài khoản mẫu: chủ `0900000001`, nhân viên `0900000002`, mật khẩu `123456`). Trình duyệt tự lưu cookie `sid`, các request sau đã đăng nhập.",
        "",
        "- Tiền: số nguyên VND. Số lượng: milli (1,5 kg = `1500`).",
        "- `idempotencyKey`: UUID mới cho mỗi lần tạo; gửi lại cùng key trả kết quả cũ (HTTP 200).",
        "- Trang này tự thêm header `X-Requested-With: fetch` (chống CSRF) vào mọi request.",
      ].join("\n"),
    },
    tags: [
      "Hệ thống",
      "Auth",
      "Cửa hàng",
      "Nhóm hàng",
      "Hàng hóa",
      "Khách hàng, NCC",
      "Chứng từ",
      "Thu chi, công nợ",
      "Kiểm kho",
      "Báo cáo",
    ].map((name) => ({ name })),
    components: {
      securitySchemes: { cookieAuth: { type: "apiKey", in: "cookie", name: "sid" } },
      schemas: {
        Error: {
          type: "object",
          properties: {
            error: {
              type: "object",
              required: ["code", "message"],
              properties: {
                code: { type: "string", enum: Object.keys(ERROR_CODES) },
                message: { type: "string" },
                details: {},
              },
            },
          },
        },
      },
    },
    security: [{ cookieAuth: [] }],
    paths,
  };
}

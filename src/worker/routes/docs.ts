// Trang tài liệu API kiểu Swagger, chỉ gắn khi chạy dev (src/worker/app.ts).
// Swagger UI tải từ CDN; mọi request "Try it out" tự kèm header chống CSRF và cookie phiên.
import { Hono } from "hono";
import { buildOpenApi } from "../dev/openapi";
import type { AppEnv } from "../types";

const SWAGGER_UI = "https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.17.14";

const page = `<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>API – Quản lý cửa hàng</title>
  <link rel="stylesheet" href="${SWAGGER_UI}/swagger-ui.css" />
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="${SWAGGER_UI}/swagger-ui-bundle.js" crossorigin></script>
  <script>
    window.ui = SwaggerUIBundle({
      url: "/api/docs/openapi.json",
      dom_id: "#swagger-ui",
      deepLinking: true,
      persistAuthorization: true,
      displayRequestDuration: true,
      tryItOutEnabled: true,
      requestInterceptor: (req) => {
        req.headers["X-Requested-With"] = "fetch";
        req.credentials = "same-origin";
        return req;
      },
    });
  </script>
</body>
</html>`;

/** Hàm (không phải hằng) để bản build loại bỏ được toàn bộ phần tài liệu khi không gọi tới. */
export function docsRoutes() {
  return new Hono<AppEnv>()
    .get("/", (c) => c.html(page))
    .get("/openapi.json", (c) => c.json(buildOpenApi()));
}

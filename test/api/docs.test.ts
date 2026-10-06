import { describe, expect, it } from "vitest";
import { app } from "../../src/worker/app";
import { documentedRoutes } from "../../src/worker/dev/openapi";
import { rawFetch } from "../helpers/api";

const METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);

describe("tài liệu API (/api/docs, chỉ dev)", () => {
  it("mọi route của app đều có trong tài liệu, và ngược lại", () => {
    const actual = app.routes
      .filter((r) => METHODS.has(r.method) && !r.path.startsWith("/api/docs"))
      .map((r) => `${r.method} ${r.path}`);
    expect([...new Set(actual)].sort()).toEqual([...documentedRoutes()].sort());
  });

  it("trả spec OpenAPI có schema body lấy từ Zod, và trang Swagger UI", async () => {
    const res = await rawFetch("/api/docs/openapi.json");
    expect(res.status).toBe(200);
    const spec = (await res.json()) as {
      openapi: string;
      paths: Record<string, Record<string, { requestBody?: unknown; parameters?: unknown[] }>>;
    };
    expect(spec.openapi).toBe("3.1.0");
    expect(spec.paths["/api/products/{id}"]?.put?.requestBody).toBeDefined();
    expect(spec.paths["/api/auth/login"]?.post?.requestBody).toMatchObject({
      content: {
        "application/json": { schema: { properties: { phone: {}, password: {} } } },
      },
    });
    expect(spec.paths["/api/reports/overview"]?.get?.parameters).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "period", in: "query" })]),
    );

    const page = await rawFetch("/api/docs");
    expect(page.headers.get("content-type")).toContain("text/html");
    expect(await page.text()).toContain("swagger-ui");
  });
});

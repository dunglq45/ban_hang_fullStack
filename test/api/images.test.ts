import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { errorOf, rawFetch } from "../helpers/api";
import { createProduct } from "../helpers/catalog";
import { addStaff, createStore } from "../helpers/stores";

// PNG 1×1 hợp lệ.
const PNG = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  ),
  (c) => c.charCodeAt(0),
);

function upload(productId: string, cookie: string, bytes: Uint8Array, type = "image/png") {
  const form = new FormData();
  form.append("file", new File([bytes], "anh.png", { type }));
  return rawFetch(`/api/products/${productId}/image`, {
    method: "POST",
    headers: { "X-Requested-With": "fetch", Cookie: cookie },
    body: form,
  });
}

describe("ảnh hàng hóa", () => {
  it("tải ảnh lên R2 theo key của cửa hàng, đọc lại được; ảnh mới thay ảnh cũ", async () => {
    const store = await createStore();
    const p = await createProduct(store.owner);
    const res = await upload(p.id, store.owner.cookie, PNG);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { imageKey: string };
    expect(body.imageKey).toMatch(new RegExp(`^${store.storeId}/products/${p.id}-.+\\.png$`));

    const img = await rawFetch(`/api/images/${body.imageKey}`, {
      headers: { Cookie: store.owner.cookie },
    });
    expect(img.status).toBe(200);
    expect(img.headers.get("Content-Type")).toBe("image/png");
    expect(new Uint8Array(await img.arrayBuffer())).toEqual(PNG);

    const second = (await (await upload(p.id, store.owner.cookie, PNG)).json()) as {
      imageKey: string;
    };
    expect(second.imageKey).not.toBe(body.imageKey);
    expect(await env.IMAGES.get(body.imageKey)).toBeNull();
  });

  it("file không phải ảnh (dù khai MIME image/png) → INVALID_IMAGE; quá 2MB → IMAGE_TOO_LARGE", async () => {
    const store = await createStore();
    const p = await createProduct(store.owner);
    const fake = await upload(p.id, store.owner.cookie, new TextEncoder().encode("<svg></svg>"));
    expect((await errorOf(fake)).code).toBe("INVALID_IMAGE");

    const big = new Uint8Array(2 * 1024 * 1024 + 1);
    big.set(PNG);
    const tooBig = await upload(p.id, store.owner.cookie, big);
    expect(tooBig.status).toBe(413);
    expect((await errorOf(tooBig)).code).toBe("IMAGE_TOO_LARGE");
  });

  it("staff không tải ảnh được; hàng không tồn tại → 404", async () => {
    const store = await createStore();
    const p = await createProduct(store.owner);
    const staff = await addStaff(store);
    expect((await upload(p.id, staff.cookie, PNG)).status).toBe(403);
    expect((await upload("khong-co", store.owner.cookie, PNG)).status).toBe(404);
  });
});

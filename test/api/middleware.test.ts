import { describe, expect, it } from "vitest";
import { errorOf, rawFetch } from "../helpers/api";
import { createStore } from "../helpers/stores";

const loginBody = JSON.stringify({ phone: "0900000009", password: "123456" });

describe("chống CSRF cho request ghi", () => {
  it("thiếu X-Requested-With → 403 CSRF_REJECTED", async () => {
    const res = await rawFetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: loginBody,
    });
    expect(res.status).toBe(403);
    expect((await errorOf(res)).code).toBe("CSRF_REJECTED");
  });

  it("gửi dạng form → 415 UNSUPPORTED_MEDIA_TYPE", async () => {
    for (const type of ["application/x-www-form-urlencoded", "text/plain", "multipart/form-data"]) {
      const res = await rawFetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": type, "X-Requested-With": "fetch" },
        body: "phone=0900000009&password=123456",
      });
      expect(res.status).toBe(415);
      expect((await errorOf(res)).code).toBe("UNSUPPORTED_MEDIA_TYPE");
    }
  });

  it("route upload ảnh được miễn kiểm tra Content-Type nhưng vẫn cần X-Requested-With", async () => {
    const store = await createStore();
    const noHeader = await rawFetch("/api/products/abc/image", {
      method: "POST",
      headers: { "Content-Type": "multipart/form-data; boundary=x", Cookie: store.owner.cookie },
      body: "--x--",
    });
    expect((await errorOf(noHeader)).code).toBe("CSRF_REJECTED");
    const ok = await rawFetch("/api/products/abc/image", {
      method: "POST",
      headers: {
        "Content-Type": "multipart/form-data; boundary=x",
        "X-Requested-With": "fetch",
        Cookie: store.owner.cookie,
      },
      body: "--x--",
    });
    // Qua được middleware CSRF (lỗi nếu có là của route ảnh: ảnh hỏng / hàng không tồn tại).
    expect([403, 415]).not.toContain(ok.status);
    expect((await errorOf(ok)).code).not.toBe("CSRF_REJECTED");
  });

  it("POST không body (như trình duyệt gửi khi đăng xuất) không cần Content-Type", async () => {
    const store = await createStore();
    const res = await rawFetch("/api/auth/logout", {
      method: "POST",
      headers: { "X-Requested-With": "fetch", Cookie: store.owner.cookie },
      // Body rỗng không kèm Content-Type: server nhận "Content-Length: 0" và body là stream rỗng.
      body: new Uint8Array(0),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("body rỗng nhưng khai Content-Type không phải JSON → 415", async () => {
    const res = await rawFetch("/api/auth/logout", {
      method: "POST",
      headers: { "X-Requested-With": "fetch", "Content-Type": "text/plain" },
      body: new Uint8Array(0),
    });
    expect(res.status).toBe(415);
  });

  it("có body mà không khai Content-Type → 415", async () => {
    const res = await rawFetch("/api/auth/login", {
      method: "POST",
      headers: { "X-Requested-With": "fetch" },
      body: new Blob([loginBody]).stream(),
      duplex: "half",
    } as RequestInit);
    expect(res.status).toBe(415);
  });

  it("GET không cần header", async () => {
    const res = await rawFetch("/api/health");
    expect(res.status).toBe(200);
  });
});

describe("middleware lỗi", () => {
  it("JSON hỏng → 400 BAD_REQUEST", async () => {
    const res = await rawFetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Requested-With": "fetch" },
      body: "{không phải json",
    });
    expect(res.status).toBe(400);
    expect((await errorOf(res)).code).toBe("BAD_REQUEST");
  });

  it("thiếu trường dùng thông báo tiếng Việt", async () => {
    const res = await rawFetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Requested-With": "fetch" },
      body: "{}",
    });
    const err = await errorOf(res);
    expect(err.code).toBe("VALIDATION_ERROR");
    expect(err.message).toBe("Vui lòng nhập số điện thoại");
  });
});

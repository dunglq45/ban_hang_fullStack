import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "../../src/worker/lib/password";

describe("password", () => {
  it("băm theo định dạng pbkdf2$100000$salt$hash và xác minh được", async () => {
    const hash = await hashPassword("123456");
    expect(hash).toMatch(/^pbkdf2\$100000\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/);
    expect(await verifyPassword("123456", hash)).toBe(true);
    expect(await verifyPassword("1234567", hash)).toBe(false);
  });

  it("salt ngẫu nhiên nên hai lần băm khác nhau", async () => {
    expect(await hashPassword("123456")).not.toBe(await hashPassword("123456"));
  });

  it("chuỗi lưu sai định dạng thì không xác minh được", async () => {
    expect(await verifyPassword("123456", "")).toBe(false);
    expect(await verifyPassword("123456", "md5$abc")).toBe(false);
    expect(await verifyPassword("123456", "pbkdf2$999999$YQ==$YQ==")).toBe(false);
    expect(await verifyPassword("123456", "pbkdf2$1$YQ==$YQ==")).toBe(false);
    expect(await verifyPassword("123456", "pbkdf2$10000$!!$x")).toBe(false);
  });
});

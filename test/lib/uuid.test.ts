import { describe, expect, it } from "vitest";
import { uuidv7 } from "../../src/worker/lib/uuid";

const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("uuidv7", () => {
  it("đúng định dạng version 7, variant RFC 9562", () => {
    expect(uuidv7()).toMatch(UUID_V7);
  });

  it("tăng dần và không trùng khi sinh liên tục", () => {
    const ids = Array.from({ length: 5000 }, () => uuidv7());
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual(ids);
  });

  it("mã hóa thời gian ở 48 bit đầu", () => {
    const before = Date.now();
    const ms = parseInt(uuidv7().replace(/-/g, "").slice(0, 12), 16);
    // Có thể lớn hơn Date.now() một chút nếu bộ đếm trong ms đã tràn ở test trước.
    expect(ms).toBeGreaterThanOrEqual(before);
    expect(ms).toBeLessThan(before + 1000);
  });
});

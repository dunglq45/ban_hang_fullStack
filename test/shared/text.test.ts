import { describe, expect, it } from "vitest";
import { contactSearchText, productSearchText, removeDiacritics, toSearch } from "../../src/shared/text";

describe("text", () => {
  it("removeDiacritics bỏ mọi dấu tiếng Việt, đ → d", () => {
    expect(removeDiacritics("Nước mắm")).toBe("Nuoc mam");
    expect(removeDiacritics("Đường trắng")).toBe("Duong trang");
    expect(removeDiacritics("Bột giặt, Hạt nêm, Muối i-ốt")).toBe("Bot giat, Hat nem, Muoi i-ot");
    expect(removeDiacritics("ẮẰẲẴẶ ỨỪỬỮỰ ỳỷỹỵ đĐ")).toBe("AAAAA UUUUU yyyy dD");
  });

  it("removeDiacritics xử lý cả chữ dựng sẵn (NFC) lẫn tổ hợp (NFD)", () => {
    expect(removeDiacritics("Nước".normalize("NFD"))).toBe("Nuoc");
    expect(removeDiacritics("Nước".normalize("NFC"))).toBe("Nuoc");
  });

  it("toSearch: chữ thường, bỏ dấu, gộp khoảng trắng", () => {
    expect(toSearch("  Nước   MẮM\t500ml ")).toBe("nuoc mam 500ml");
    expect(toSearch("Gạo ST25 SP000060")).toBe("gao st25 sp000060");
    expect(toSearch("ĐẠI LÝ Hưng Thịnh")).toBe("dai ly hung thinh");
    expect(toSearch("")).toBe("");
  });

  it("productSearchText, contactSearchText ghép tên + mã + mã vạch/SĐT", () => {
    expect(productSearchText({ name: "Nước mắm 500ml", code: "SP000052", barcode: "8934567890123" })).toBe(
      "nuoc mam 500ml sp000052 8934567890123",
    );
    expect(productSearchText({ name: "Gạo ST25", code: "SP000060", barcode: null })).toBe("gao st25 sp000060");
    expect(contactSearchText({ name: "Chị Lan", code: "KH000004", phone: "0912345678" })).toBe(
      "chi lan kh000004 0912345678",
    );
  });
});

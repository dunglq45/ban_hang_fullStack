import { describe, expect, it } from "vitest";
import { MAX_DOCUMENT_LINES } from "../../../shared/schemas/document";
import {
  addProduct,
  draftError,
  emptyDraft,
  lineNote,
  linesFromDocument,
  type PurchaseDraft,
  type PurchaseProduct,
  PurchaseLimitError,
  removeLine,
  setLineUnit,
  summarize,
  toPurchaseBody,
  updateLine,
} from "./purchase-lines";

const mam: PurchaseProduct = {
  id: "p-mam",
  code: "SP0052",
  name: "Nước mắm 500ml",
  baseUnit: "Chai",
  costPrice: 31_000,
  stock: 2_000,
  units: [{ name: "Thùng", factor: 12 }],
};
const botGiat: PurchaseProduct = {
  id: "p-bg",
  code: "SP0088",
  name: "Bột giặt 3kg",
  baseUnit: "Túi",
  costPrice: 118_000,
  stock: 0,
  units: [],
};

const supplier = {
  id: "c-ht",
  code: "NCC000001",
  name: "Đại lý Hưng Thịnh",
  phone: null,
  debt: 1_500_000,
  debtLimit: null,
};

function draft(patch: Partial<PurchaseDraft> = {}): PurchaseDraft {
  return { ...emptyDraft(), ...patch };
}

describe("addProduct", () => {
  it("thêm dòng mới với giá nhập = giá vốn × hệ số", () => {
    const { lines, key } = addProduct([], mam, "Thùng");
    expect(key).toBe("p-mam|Thùng");
    expect(lines[0]).toMatchObject({
      unitName: "Thùng",
      factor: 12,
      qty: 1000,
      unitPrice: 372_000,
    });
  });

  it("mặc định đơn vị cơ bản; quét trùng thì cộng số lượng", () => {
    let { lines } = addProduct([], mam);
    lines = addProduct(lines, mam).lines;
    lines = addProduct(lines, mam, "Thùng").lines;
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ unitName: "Chai", qty: 2000, unitPrice: 31_000 });
  });

  it("cộng vào dòng đang có số lượng không hợp lệ", () => {
    let { lines } = addProduct([], mam);
    lines = updateLine(lines, "p-mam|Chai", { qty: null });
    lines = addProduct(lines, mam).lines;
    expect(lines[0]!.qty).toBe(1000);
  });

  it("chặn khi vượt số dòng tối đa", () => {
    const many = Array.from(
      { length: MAX_DOCUMENT_LINES },
      (_, i) => addProduct([], { ...botGiat, id: `p-${i}` }).lines[0]!,
    );
    expect(() => addProduct(many, mam)).toThrow(PurchaseLimitError);
    // Cộng vào dòng có sẵn vẫn được.
    expect(addProduct(many, { ...botGiat, id: "p-0" }).lines[0]!.qty).toBe(2000);
  });
});

describe("setLineUnit", () => {
  it("đổi đơn vị lấy lại giá theo hệ số mới, giữ số lượng", () => {
    const { lines } = addProduct([], mam);
    const next = setLineUnit(
      updateLine(lines, "p-mam|Chai", { unitPrice: 30_000, qty: 3000 }),
      "p-mam|Chai",
      "Thùng",
    );
    expect(next[0]).toMatchObject({
      key: "p-mam|Thùng",
      factor: 12,
      qty: 3000,
      unitPrice: 372_000,
    });
  });

  it("trùng dòng có sẵn thì gộp", () => {
    let { lines } = addProduct([], mam);
    lines = addProduct(lines, mam, "Thùng", 2000).lines;
    const next = setLineUnit(lines, "p-mam|Chai", "Thùng");
    expect(next).toHaveLength(1);
    expect(next[0]!.qty).toBe(3000);
  });
});

describe("summarize và draftError", () => {
  const lines = addProduct(
    addProduct([], botGiat, undefined, 10_000).lines,
    mam,
    "Thùng",
    2000,
  ).lines;

  it("tính tổng, đã trả mặc định = trả đủ", () => {
    const s = summarize(draft({ lines, supplier }));
    expect(s).toMatchObject({
      productCount: 2,
      subtotal: 1_180_000 + 744_000,
      total: 1_924_000,
      paid: 1_924_000,
      debt: 0,
      supplierDebtAfter: 1_500_000,
    });
  });

  it("trả thiếu: còn nợ và tổng nợ NCC sau phiếu", () => {
    const s = summarize(draft({ lines, supplier, discount: 24_000, paid: 1_000_000 }));
    expect(s).toMatchObject({ total: 1_900_000, paid: 1_000_000, debt: 900_000 });
    expect(s.supplierDebtAfter).toBe(2_400_000);
  });

  it("trả dư thì chỉ tính bằng cần trả", () => {
    expect(summarize(draft({ lines, paid: 5_000_000 })).paid).toBe(1_924_000);
  });

  it("báo lỗi rõ ràng", () => {
    expect(draftError(draft())).toBe("Phiếu nhập chưa có mặt hàng nào");
    expect(draftError(draft({ lines: updateLine(lines, "p-bg|Túi", { qty: null }) }))).toBe(
      "Số lượng của Bột giặt 3kg chưa hợp lệ",
    );
    expect(draftError(draft({ lines, discount: 3_000_000 }))).toBe(
      "Chiết khấu lớn hơn tổng tiền hàng",
    );
    expect(draftError(draft({ lines, paid: 0 }))).toMatch(/chọn nhà cung cấp/);
    expect(draftError(draft({ lines, paid: 0, supplier }))).toBeNull();
    expect(draftError(draft({ lines }))).toBeNull();
  });

  it("toPurchaseBody", () => {
    expect(
      toPurchaseBody(
        draft({
          lines: removeLine(lines, "p-bg|Túi"),
          supplier,
          paid: 100_000,
          note: "  HĐ 123 ",
        }),
      ),
    ).toEqual({
      contactId: "c-ht",
      lines: [{ productId: "p-mam", unitName: "Thùng", qty: 2000, unitPrice: 372_000 }],
      discount: 0,
      paid: 100_000,
      paymentMethod: "cash",
      note: "HĐ 123",
    });
  });
});

describe("lineNote", () => {
  it("đơn vị cơ bản và đơn vị quy đổi", () => {
    const { lines } = addProduct(addProduct([], botGiat).lines, mam, "Thùng", 2000);
    expect(lineNote(lines[0]!)).toBe("Tồn hiện tại: 0 túi");
    expect(lineNote(lines[1]!)).toBe("2 thùng = 24 chai · tồn 2 chai");
  });
});

describe("linesFromDocument", () => {
  it("dựng lại dòng với giá đã lưu; đơn vị đã bị xóa vẫn giữ nguyên", () => {
    const products = new Map([[mam.id, { ...mam, units: [] }]]);
    const lines = linesFromDocument(
      [
        { productId: "p-mam", unitName: "Chai", factor: 1, qty: 5000, unitPrice: 30_000 },
        { productId: "p-mam", unitName: "Thùng", factor: 12, qty: 1000, unitPrice: 350_000 },
        { productId: "p-khac", unitName: "Gói", factor: 1, qty: 1000, unitPrice: 1 },
      ],
      products,
    );
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ unitName: "Chai", qty: 5000, unitPrice: 30_000 });
    expect(lines[1]).toMatchObject({ unitName: "Thùng", factor: 12, unitPrice: 350_000 });
  });
});

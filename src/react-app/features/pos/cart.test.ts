import { describe, expect, it } from "vitest";
import {
  addProduct,
  type Cart,
  CartLimitError,
  checkoutError,
  emptyCart,
  quickAmounts,
  removeLine,
  type SellableProduct,
  setCustomer,
  setDiscount,
  setLinePrice,
  setLineQty,
  setLineUnit,
  setPaid,
  setLineErrors,
  lineErrorsFromApi,
  matchesSale,
  stockWarnings,
  summarize,
  toSaleInput,
  unitOptions,
} from "./cart";

const noodles: SellableProduct = {
  id: "p-mi",
  code: "SP000012",
  name: "Mì gói tôm chua cay",
  baseUnit: "Gói",
  salePrice: 4_500,
  stock: 120_000,
  minStock: 20_000,
  allowNegative: false,
  units: [{ name: "Thùng", factor: 30, salePrice: 125_000, barcode: "8934563000301" }],
};

const rice: SellableProduct = {
  id: "p-gao",
  code: "SP000060",
  name: "Gạo ST25",
  baseUnit: "Kg",
  salePrice: 32_000,
  stock: 2_000,
  minStock: 0,
  allowNegative: false,
  units: [{ name: "Bao 5kg", factor: 5, salePrice: null, barcode: null }],
};

const lan = {
  id: "c-lan",
  code: "KH000001",
  name: "Chị Lan",
  phone: "0912345678",
  debt: 350_000,
  debtLimit: null,
};

function cartWith(...steps: Array<(c: Cart) => Cart>) {
  return steps.reduce((c, f) => f(c), emptyCart(1));
}

describe("giỏ hàng", () => {
  it("đơn vị bán: đơn vị cơ bản trước; đơn vị quy đổi không có giá riêng thì giá × hệ số", () => {
    expect(unitOptions(rice)).toEqual([
      { name: "Kg", factor: 1, price: 32_000 },
      { name: "Bao 5kg", factor: 5, price: 160_000 },
    ]);
    expect(unitOptions(noodles)[1]).toEqual({ name: "Thùng", factor: 30, price: 125_000 });
  });

  it("thêm hàng: mặc định 1 đơn vị cơ bản, thêm lại thì cộng dồn; khác đơn vị là dòng khác", () => {
    const cart = cartWith(
      (c) => addProduct(c, noodles),
      (c) => addProduct(c, noodles),
      (c) => addProduct(c, noodles, "Thùng"),
    );
    expect(cart.lines).toHaveLength(2);
    expect(cart.lines[0]).toMatchObject({
      unitName: "Gói",
      factor: 1,
      qty: 2_000,
      unitPrice: 4_500,
    });
    expect(cart.lines[1]).toMatchObject({
      unitName: "Thùng",
      factor: 30,
      qty: 1_000,
      unitPrice: 125_000,
    });
  });

  it("tính tiền: thành tiền dòng có số lẻ, giảm giá, khách trả vừa đủ khi để trống", () => {
    const cart = cartWith(
      (c) => addProduct(c, rice, undefined, 1_500), // 1,5 kg × 32.000 = 48.000
      (c) => addProduct(c, noodles, undefined, 10_000), // 10 gói × 4.500 = 45.000
      (c) => setDiscount(c, 3_000),
    );
    expect(summarize(cart)).toEqual({
      itemCount: 2,
      subtotal: 93_000,
      discount: 3_000,
      total: 90_000,
      paid: 90_000,
      change: 0,
      debtAmount: 0,
      debtAfter: null,
    });
  });

  it("tiền thừa trả khách", () => {
    const cart = cartWith(
      (c) => addProduct(c, noodles, undefined, 10_000),
      (c) => setPaid(c, 50_000),
    );
    expect(summarize(cart)).toMatchObject({ total: 45_000, change: 5_000, debtAmount: 0 });
  });

  it("trả thiếu: ghi nợ phần còn lại, dư nợ sau đơn = nợ cũ + phần ghi nợ", () => {
    const cart = cartWith(
      (c) => addProduct(c, noodles, undefined, 10_000),
      (c) => addProduct(c, noodles, "Thùng"), // 45.000 + 125.000 = 170.000
      (c) => setCustomer(c, lan),
      (c) => setPaid(c, 100_000),
    );
    expect(summarize(cart)).toMatchObject({
      total: 170_000,
      paid: 100_000,
      change: 0,
      debtAmount: 70_000,
      debtAfter: 420_000,
    });
    expect(checkoutError(cart)).toBeNull();
  });

  it("khách lẻ không được ghi nợ; giỏ trống, giảm giá quá tổng cũng bị chặn", () => {
    expect(checkoutError(emptyCart(1))).toBe("Hóa đơn chưa có mặt hàng nào");
    const owing = cartWith(
      (c) => addProduct(c, noodles),
      (c) => setPaid(c, 0),
    );
    expect(checkoutError(owing)).toMatch(/Khách lẻ phải trả đủ/);
    const tooMuch = cartWith(
      (c) => addProduct(c, noodles),
      (c) => setDiscount(c, 5_000),
    );
    expect(checkoutError(tooMuch)).toMatch(/Giảm giá/);
  });

  it("đổi đơn vị: giá về giá đơn vị mới; trùng dòng có sẵn thì gộp", () => {
    let cart = cartWith(
      (c) => addProduct(c, rice, undefined, 2_000),
      (c) => setLinePrice(c, "p-gao:Kg", 30_000),
    );
    cart = setLineUnit(cart, "p-gao:Kg", "Bao 5kg");
    expect(cart.lines).toEqual([
      expect.objectContaining({ key: "p-gao:Bao 5kg", factor: 5, qty: 2_000, unitPrice: 160_000 }),
    ]);

    const merged = setLineUnit(
      cartWith(
        (c) => addProduct(c, noodles, undefined, 3_000),
        (c) => addProduct(c, noodles, "Thùng"),
      ),
      "p-mi:Gói",
      "Thùng",
    );
    expect(merged.lines).toEqual([expect.objectContaining({ key: "p-mi:Thùng", qty: 4_000 })]);
  });

  it("sửa số lượng, xóa dòng; giỏ đổi thì bỏ lỗi thiếu hàng cũ", () => {
    let cart = cartWith((c) => addProduct(c, noodles));
    cart = setLineErrors(cart, { "p-mi": "Không đủ hàng" });
    expect(setCustomer(cart, lan).lineErrors).toHaveProperty("p-mi");
    cart = setLineQty(cart, "p-mi:Gói", 5_000);
    expect(cart.lineErrors).toEqual({});
    expect(cart.lines[0]!.qty).toBe(5_000);
    expect(removeLine(cart, "p-mi:Gói").lines).toEqual([]);
  });

  it("cảnh báo vượt tồn tính theo đơn vị cơ bản, cộng cả các đơn vị", () => {
    const cart = cartWith(
      (c) => addProduct(c, noodles, "Thùng", 4_000), // 120 gói
      (c) => addProduct(c, noodles), // + 1 gói
      (c) => addProduct(c, rice, undefined, 1_000),
    );
    const products = new Map([noodles, rice].map((p) => [p.id, p]));
    expect(stockWarnings(cart, (id) => products.get(id))).toEqual(new Map([["p-mi", 120_000]]));
    const negativeOk = { ...noodles, allowNegative: true };
    expect(stockWarnings(cart, (id) => (id === "p-mi" ? negativeOk : rice)).size).toBe(0);
  });

  it("không quá 200 dòng", () => {
    let cart = emptyCart(1);
    for (let i = 0; i < 200; i++) cart = addProduct(cart, { ...noodles, id: `p${i}` });
    expect(() => addProduct(cart, noodles)).toThrow(CartLimitError);
    // Cộng dồn vào dòng có sẵn vẫn được.
    expect(addProduct(cart, { ...noodles, id: "p0" }).lines[0]!.qty).toBe(2_000);
  });

  it("mệnh giá nhanh: làm tròn lên, lớn hơn số cần trả, tối đa 3", () => {
    expect(quickAmounts(113_000)).toEqual([120_000, 150_000, 200_000]);
    expect(quickAmounts(100_000)).toEqual([200_000, 500_000, 1_000_000]);
    expect(quickAmounts(4_500)).toEqual([10_000, 50_000, 100_000]);
    expect(quickAmounts(640_000)).toEqual([650_000, 700_000, 800_000]);
    expect(quickAmounts(0)).toEqual([]);
  });

  it("body gửi API: giữ idempotencyKey của đơn, trả vừa đủ khi để trống", () => {
    const cart = cartWith(
      (c) => addProduct(c, noodles, "Thùng"),
      (c) => setCustomer(c, lan),
      (c) => setDiscount(c, 5_000),
    );
    expect(toSaleInput(cart)).toEqual({
      idempotencyKey: cart.idempotencyKey,
      contactId: "c-lan",
      lines: [{ productId: "p-mi", unitName: "Thùng", qty: 1_000, unitPrice: 125_000 }],
      discount: 5_000,
      paid: 120_000,
      paymentMethod: "cash",
      force: false,
    });
    expect(toSaleInput(setPaid(cart, 20_000), true)).toMatchObject({ paid: 20_000, force: true });
    expect(toSaleInput(cart).idempotencyKey).toBe(toSaleInput(cart).idempotencyKey);
  });

  it("lỗi từ server → câu lỗi theo dòng (thiếu hàng theo đơn vị cơ bản, lỗi một hàng)", () => {
    const cart = cartWith(
      (c) => addProduct(c, noodles, "Thùng"),
      (c) => addProduct(c, rice),
    );
    expect(
      lineErrorsFromApi(cart, "OUT_OF_STOCK", "Không đủ hàng", {
        items: [
          { productId: "p-mi", name: "Mì", unit: "Gói", stock: 3_000, requested: 30_000 },
          { productId: "khac", stock: 0 },
          { productId: 1, stock: "x" },
        ],
      }),
    ).toEqual({ "p-mi": "Không đủ hàng: chỉ còn 3 Gói" });
    expect(
      lineErrorsFromApi(cart, "PRICE_BELOW_COST", "Giá bán Gạo thấp hơn giá vốn", {
        productId: "p-gao",
      }),
    ).toEqual({ "p-gao": "Giá bán Gạo thấp hơn giá vốn" });
    expect(lineErrorsFromApi(cart, "INTERNAL_ERROR", "Lỗi", undefined)).toEqual({});
  });

  it("hóa đơn trả lại khi gửi trùng key: so đúng nội dung giỏ", () => {
    const cart = cartWith(
      (c) => addProduct(c, noodles, undefined, 2_000),
      (c) => addProduct(c, rice),
      (c) => setCustomer(c, lan),
    );
    const input = toSaleInput(cart);
    const doc = {
      contactId: "c-lan",
      discount: 0,
      lines: [
        { productId: "p-gao", unitName: "Kg", qty: 1_000, unitPrice: 32_000 },
        { productId: "p-mi", unitName: "Gói", qty: 2_000, unitPrice: 4_500 },
      ],
    };
    expect(matchesSale(input, doc)).toBe(true);
    expect(matchesSale(toSaleInput(setLineQty(cart, "p-mi:Gói", 3_000)), doc)).toBe(false);
    expect(matchesSale(toSaleInput(setCustomer(cart, null)), doc)).toBe(false);
    expect(matchesSale(toSaleInput(addProduct(cart, { ...rice, id: "x" })), doc)).toBe(false);
  });
});

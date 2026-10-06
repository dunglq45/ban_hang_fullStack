import { describe, expect, it } from "vitest";
import {
  detailToForm,
  detailToUpdateInput,
  emptyProductForm,
  formatPercent,
  formToCreateInput,
  formToUpdateInput,
  type ProductFormValues,
  profitOf,
  toFieldErrors,
  validateProductForm,
} from "./product-form";

const filled: ProductFormValues = {
  ...emptyProductForm("cat-1"),
  name: "Nước tương 500ml",
  code: " ",
  barcode: "8936017361042",
  baseUnit: "Chai",
  costPrice: 21_000,
  salePrice: 26_000,
  openingStock: 24_000,
  minStock: 6_000,
  note: "  Kệ 2  ",
  units: [{ name: "Thùng", factor: 24, salePrice: 600_000, barcode: "" }],
};

const detail = {
  name: "Nước tương 500ml",
  code: "SP000127",
  barcode: null,
  categoryId: null,
  baseUnit: "Chai",
  costPrice: 21_000,
  salePrice: 26_000,
  minStock: 0,
  allowNegative: false,
  isActive: true,
  showInPos: true,
  note: null,
  units: [{ name: "Thùng", factor: 24, salePrice: null, barcode: "893000" }],
};

describe("form hàng hóa", () => {
  it("tạo mới: ô trống thành null/0, mã bỏ trống để tự sinh, có giá vốn, tồn ban đầu và idempotencyKey", () => {
    expect(formToCreateInput(filled, "key-1")).toEqual({
      name: "Nước tương 500ml",
      code: null,
      barcode: "8936017361042",
      categoryId: "cat-1",
      baseUnit: "Chai",
      salePrice: 26_000,
      minStock: 6_000,
      allowNegative: false,
      isActive: true,
      showInPos: true,
      note: "Kệ 2",
      units: [{ name: "Thùng", factor: 24, salePrice: 600_000, barcode: null }],
      costPrice: 21_000,
      openingStock: 24_000,
      idempotencyKey: "key-1",
    });
    expect(validateProductForm(filled, "create")).toEqual({});
  });

  it("sửa: không gửi giá vốn và tồn kho", () => {
    const input = formToUpdateInput(filled);
    expect(input).not.toHaveProperty("costPrice");
    expect(input).not.toHaveProperty("openingStock");
  });

  it("báo lỗi bằng câu của schema server, theo đúng ô", () => {
    const errors = validateProductForm(
      {
        ...filled,
        name: " ",
        baseUnit: "",
        salePrice: null,
        units: [
          { name: "chai", factor: 12, salePrice: null, barcode: "" },
          { name: "Lốc", factor: null, salePrice: null, barcode: "8936017361042" },
        ],
      },
      "create",
    );
    expect(errors).toMatchObject({
      name: "Vui lòng nhập tên hàng",
      baseUnit: "Vui lòng nhập đơn vị cơ bản",
      salePrice: "Vui lòng nhập giá bán",
      "units.1.factor": "Vui lòng nhập số quy đổi",
    });
    // Kiểm tra trùng (superRefine) chạy khi các ô cơ bản đã hợp lệ, giống server.
    expect(
      validateProductForm(
        {
          ...filled,
          units: [{ name: "Lốc", factor: 6, salePrice: null, barcode: "8936017361042" }],
        },
        "create",
      ),
    ).toEqual({ "units.0.barcode": "Mã vạch 8936017361042 bị trùng" });
    // Tên đơn vị trùng đơn vị cơ bản chỉ báo khi đơn vị cơ bản có giá trị.
    expect(
      validateProductForm({ ...filled, units: [{ ...filled.units[0]!, name: "chai" }] }, "edit"),
    ).toEqual({ "units.0.name": 'Đơn vị "chai" bị trùng' });
  });

  it("chi tiết → form → body PUT giữ nguyên dữ liệu; Ngừng bán chỉ đổi isActive", () => {
    const form = detailToForm(detail);
    expect(form).toMatchObject({ barcode: "", categoryId: "", minStock: null, note: "" });
    expect(detailToUpdateInput(detail, { isActive: false })).toEqual({
      name: "Nước tương 500ml",
      code: "SP000127",
      barcode: null,
      categoryId: null,
      baseUnit: "Chai",
      salePrice: 26_000,
      minStock: 0,
      allowNegative: false,
      isActive: false,
      showInPos: true,
      note: null,
      units: [{ name: "Thùng", factor: 24, salePrice: null, barcode: "893000" }],
    });
  });

  it("lỗi phẳng → lỗi lồng nhau cho react-hook-form", () => {
    expect(toFieldErrors({ name: "a", "units.1.factor": "b" })).toEqual({
      name: { type: "validate", message: "a" },
      units: [undefined, { factor: { type: "validate", message: "b" } }],
    });
  });

  it("lãi mỗi đơn vị và % trên giá bán", () => {
    expect(profitOf(26_000, 21_000)).toEqual({ amount: 5_000, percent: (5_000 / 26_000) * 100 });
    expect(formatPercent((5_000 / 26_000) * 100)).toBe("19,2%");
    expect(profitOf(null, 21_000)).toBeNull();
    expect(profitOf(0, 0)).toEqual({ amount: 0, percent: null });
  });
});

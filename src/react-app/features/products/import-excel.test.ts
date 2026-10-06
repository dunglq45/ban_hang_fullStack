import { describe, expect, it } from "vitest";
import { batches, failedRowsTable, parseSheet, templateTable } from "./import-excel";

describe("đọc file Excel nhập hàng", () => {
  it("file mẫu đọc lại được, dòng ví dụ hợp lệ (số lượng đổi sang milli)", () => {
    const sheet = parseSheet(templateTable());
    expect(sheet.missingColumns).toEqual([]);
    expect(sheet.rows).toEqual([
      expect.objectContaining({
        rowNumber: 2,
        error: null,
        input: {
          name: "Nước mắm Nam Ngư 500ml",
          category: "Gia vị",
          unit: "Chai",
          costPrice: 31_000,
          salePrice: 38_000,
          stock: 24_000,
          minStock: 6_000,
          barcode: "8934563000052",
        },
      }),
    ]);
  });

  it("nhận tiêu đề khác cách viết, cột đảo thứ tự; tiền dạng chuỗi 100.000; số lẻ 1,5", () => {
    const sheet = parseSheet([
      [],
      ["ĐVT", "Tên sản phẩm", "Giá bán lẻ", "Số lượng", "Mã SP"],
      ["Kg", "Gạo ST25", "32.000", "1,5", "GAO-ST25"],
      ["", "", "", "", ""],
      ["Bao", "Gạo nếp", 150000, 2.25, null],
    ]);
    expect(sheet.rows.map((r) => [r.rowNumber, r.error, r.input])).toEqual([
      [3, null, { code: "GAO-ST25", name: "Gạo ST25", unit: "Kg", salePrice: 32_000, stock: 1_500 }],
      [5, null, { name: "Gạo nếp", unit: "Bao", salePrice: 150_000, stock: 2_250 }],
    ]);
  });

  it("báo lỗi từng dòng: thiếu tên, tiền sai, số lượng không rõ nghĩa", () => {
    const sheet = parseSheet([
      ["Tên hàng", "Đơn vị", "Giá bán", "Tồn kho"],
      ["", "Cái", 1000, 1],
      ["Bút", "Cây", "1,5tr", 1],
      ["Vở", "Quyển", 5000, "1.000"],
      ["Thước", "Cái", -2000, 1],
    ]);
    expect(sheet.rows.map((r) => r.error)).toEqual([
      "Vui lòng nhập tên hàng",
      'Giá bán không hợp lệ: "1,5tr"',
      'Tồn kho không hợp lệ: "1.000"',
      'Giá bán không hợp lệ: "-2000"',
    ]);
    expect(sheet.rows.every((r) => r.input === null)).toBe(true);
  });

  it("thiếu cột bắt buộc", () => {
    expect(parseSheet([["Mã hàng", "Giá bán"]]).missingColumns).toEqual(["Tên hàng", "Đơn vị"]);
    expect(parseSheet([]).missingColumns).toEqual(["Tên hàng", "Đơn vị"]);
  });

  it("chia lô 500 dòng và bảng dòng lỗi giữ cột gốc + lý do", () => {
    expect(batches(Array.from({ length: 1201 }, (_, i) => i)).map((b) => b.length)).toEqual([
      500, 500, 201,
    ]);
    expect(
      failedRowsTable(["Tên hàng", "Đơn vị"], [
        { rowNumber: 3, cells: ["Bút"], name: "Bút", reason: "Mã hàng đã tồn tại" },
      ]),
    ).toEqual([
      ["Dòng", "Tên hàng", "Đơn vị", "Lý do lỗi"],
      [3, "Bút", "", "Mã hàng đã tồn tại"],
    ]);
  });
});

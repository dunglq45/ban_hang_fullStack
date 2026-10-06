import { describe, expect, it } from "vitest";
import {
  formatQty,
  formatQtyInput,
  fromMilli,
  lineAmount,
  parseQty,
  toBaseQty,
  toMilli,
} from "../../src/shared/qty";

describe("qty", () => {
  it("toMilli đổi đúng các giá trị thường gặp", () => {
    expect(toMilli(0.5)).toBe(500);
    expect(toMilli(1.25)).toBe(1250);
    expect(toMilli(1000)).toBe(1_000_000);
    expect(toMilli(0)).toBe(0);
  });

  it("toMilli khử sai số dấu phẩy động và làm tròn tới 0,001", () => {
    expect(toMilli(1.005)).toBe(1005);
    expect(toMilli(0.1 + 0.2)).toBe(300);
    expect(toMilli(2.0004)).toBe(2000);
    expect(toMilli(2.0005)).toBe(2001);
    expect(toMilli(-0.5)).toBe(-500);
    expect(Object.is(toMilli(-0.0001), 0)).toBe(true);
  });

  it("toMilli từ chối NaN và vô cực", () => {
    expect(() => toMilli(Number.NaN)).toThrow(RangeError);
    expect(() => toMilli(Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });

  it("fromMilli là phép ngược của toMilli", () => {
    expect(fromMilli(500)).toBe(0.5);
    expect(fromMilli(1250)).toBe(1.25);
    expect(fromMilli(1_000_000)).toBe(1000);
    for (const n of [0.5, 1.25, 1000, 3.333]) expect(fromMilli(toMilli(n))).toBe(n);
  });

  it("formatQty dùng dấu phẩy thập phân và dấu chấm hàng nghìn", () => {
    expect(formatQty(500, "Kg")).toBe("0,5 Kg");
    expect(formatQty(1250, "Kg")).toBe("1,25 Kg");
    expect(formatQty(1_000_000, "Chai")).toBe("1.000 Chai");
    expect(formatQty(120_000)).toBe("120");
  });

  it("toBaseQty và lineAmount", () => {
    expect(toBaseQty(2000, 12)).toBe(24_000);
    expect(lineAmount(1500, 32_000)).toBe(48_000);
    expect(lineAmount(333, 10_000)).toBe(3330);
    expect(lineAmount(1, 500)).toBe(1); // 0,5 đồng làm tròn lên
  });
});

describe("parseQty / formatQtyInput", () => {
  it("dấu phẩy là dấu thập phân, tối đa 3 số lẻ", () => {
    expect(parseQty("1,5")).toBe(1500);
    expect(parseQty(" 2 ")).toBe(2000);
    expect(parseQty("0,125")).toBe(125);
    expect(parseQty("3,")).toBe(3000);
    expect(parseQty("1,005")).toBe(1005);
    expect(parseQty(",5")).toBe(500);
  });

  it("dấu chấm theo sau 1–2 chữ số được hiểu là dấu thập phân", () => {
    expect(parseQty("1.5")).toBe(1500);
    expect(parseQty("0.25")).toBe(250);
    expect(parseQty(".5")).toBe(500);
  });

  it("dấu chấm theo sau 3 chữ số không rõ nghĩa (1.000 = một nghìn?) nên từ chối", () => {
    expect(parseQty("1.000")).toBeNull();
    expect(parseQty("1.500")).toBeNull();
  });

  it("từ chối chuỗi rỗng, chữ, số âm, quá 3 số lẻ, nhiều dấu phân cách", () => {
    for (const s of [
      "",
      "abc",
      "-1",
      "1,2345",
      "1,2,3",
      "1.000,5",
      ",",
      ".",
      "1.",
      "1,2.3",
      "1.2.3",
    ]) {
      expect(parseQty(s), s).toBeNull();
    }
  });

  it("formatQtyInput là phép ngược của parseQty", () => {
    expect(formatQtyInput(1500)).toBe("1,5");
    expect(formatQtyInput(2000)).toBe("2");
    expect(formatQtyInput(1005)).toBe("1,005");
    for (const m of [0, 1, 999, 1500, 123456]) expect(parseQty(formatQtyInput(m))).toBe(m);
  });
});

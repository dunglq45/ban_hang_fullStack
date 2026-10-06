import { describe, expect, it } from "vitest";
import { formatQty } from "../../../shared/qty";
import {
  type CountLineData,
  filterRows,
  formatDiff,
  formatSigned,
  mergeLines,
  missingReasons,
  tabCounts,
} from "./count-lines";

function line(patch: Partial<CountLineData> & { id: string }): CountLineData {
  return {
    productCode: "SP000001",
    productName: "Hàng",
    baseUnit: "Gói",
    systemQty: 10_000,
    currentStock: 10_000,
    stockChanged: false,
    actualQty: null,
    diff: null,
    reason: null,
    ...patch,
  };
}

const lines = [
  line({ id: "a", productName: "Nước tương", actualQty: 10_000, diff: 0 }),
  line({
    id: "b",
    productName: "Bột ngọt",
    productCode: "SP000093",
    actualQty: 12_000,
    diff: 2_000,
  }),
  line({ id: "c", productName: "Đường trắng" }),
];

describe("mergeLines", () => {
  it("áp số đếm chưa lưu, tính chênh lệch theo tồn hiện tại", () => {
    const rows = mergeLines(
      lines,
      { c: { actualQty: 7_000, reason: null }, a: { actualQty: null, reason: null } },
      true,
    );
    expect(rows[2]).toMatchObject({ actualQty: 7_000, diff: -3_000, unsaved: true });
    expect(rows[0]).toMatchObject({ actualQty: null, diff: null, unsaved: true });
    expect(rows[1]).toMatchObject({ diff: 2_000, unsaved: false });
  });

  it("phiếu đã hoàn thành bỏ qua thay đổi cục bộ", () => {
    const rows = mergeLines(lines, { c: { actualQty: 7_000, reason: null } }, false);
    expect(rows[2]!.actualQty).toBeNull();
  });
});

describe("lọc và đếm", () => {
  const rows = mergeLines(lines, {}, true);

  it("tabCounts", () => {
    expect(tabCounts(rows)).toEqual({ all: 3, diff: 1, uncounted: 1 });
  });

  it("filterRows theo tab và từ khóa không dấu / mã hàng", () => {
    expect(filterRows(rows, "diff", "").map((r) => r.id)).toEqual(["b"]);
    expect(filterRows(rows, "uncounted", "").map((r) => r.id)).toEqual(["c"]);
    expect(filterRows(rows, "all", "duong").map((r) => r.id)).toEqual(["c"]);
    expect(filterRows(rows, "all", "sp000093").map((r) => r.id)).toEqual(["b"]);
  });

  it("missingReasons: dòng lệch chưa có lý do", () => {
    expect(missingReasons(rows).map((r) => r.id)).toEqual(["b"]);
    const withReason = mergeLines(lines, { b: { actualQty: 12_000, reason: "Khác" } }, true);
    expect(missingReasons(withReason)).toEqual([]);
  });
});

describe("định dạng", () => {
  it("formatDiff và formatSigned", () => {
    const f = (m: number) => formatQty(m);
    expect(formatDiff(null, f)).toBe("—");
    expect(formatDiff(0, f)).toBe("Khớp");
    expect(formatDiff(2_000, f)).toBe("+2");
    expect(formatDiff(-1_500, f)).toBe("−1,5");
    expect(formatSigned(-21_000, (n) => n.toLocaleString("vi-VN"))).toBe("−21.000");
    expect(formatSigned(0, String)).toBe("0");
  });
});

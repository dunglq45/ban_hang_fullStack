import { afterEach, describe, expect, it } from "vitest";
import { addProduct, type SellableProduct } from "./cart";
import {
  initialTabs,
  loadTabs,
  MAX_TABS,
  posTabsReducer,
  type PosTabsState,
  saveTabs,
  storageKey,
} from "./pos-tabs";

const product: SellableProduct = {
  id: "p1",
  code: "SP000001",
  name: "Nước suối",
  baseUnit: "Chai",
  salePrice: 5_000,
  stock: 10_000,
  minStock: 0,
  allowNegative: false,
  units: [],
};

const run = (state: PosTabsState, ...actions: Parameters<typeof posTabsReducer>[1][]) =>
  actions.reduce(posTabsReducer, state);

describe("nhiều hóa đơn", () => {
  afterEach(() => localStorage.clear());

  it("mở đơn mới lấy số nhỏ nhất chưa dùng và chuyển sang đơn đó", () => {
    let s = run(initialTabs(), { type: "new" }, { type: "new" });
    expect(s.tabs.map((t) => t.number)).toEqual([1, 2, 3]);
    expect(s.activeId).toBe(s.tabs[2]!.id);
    s = run(s, { type: "close", id: s.tabs[1]!.id }, { type: "new" });
    expect(s.tabs.map((t) => t.number)).toEqual([1, 2, 3]);
  });

  it(`tối đa ${MAX_TABS} đơn`, () => {
    let s = initialTabs();
    for (let i = 0; i < 20; i++) s = posTabsReducer(s, { type: "new" });
    expect(s.tabs).toHaveLength(MAX_TABS);
  });

  it("đóng đơn đang mở thì chuyển sang đơn kề; đóng đơn cuối cùng thì còn một đơn trống", () => {
    let s = run(initialTabs(), { type: "new" }, { type: "new" });
    const [a, b, c] = s.tabs;
    s = run(s, { type: "select", id: b!.id }, { type: "close", id: b!.id });
    expect(s.activeId).toBe(c!.id);
    s = run(s, { type: "close", id: c!.id });
    expect(s.activeId).toBe(a!.id);
    s = run(s, { type: "close", id: a!.id });
    expect(s.tabs).toHaveLength(1);
    expect(s.tabs[0]!.number).toBe(1);
  });

  it("bán xong: đơn trống với idempotencyKey mới, giữ tab", () => {
    let s = initialTabs();
    const id = s.activeId;
    s = run(s, { type: "update", id, update: (c) => addProduct(c, product) });
    const oldKey = s.tabs[0]!.idempotencyKey;
    s = run(s, { type: "reset", id });
    expect(s.tabs[0]).toMatchObject({ id, number: 1, lines: [] });
    expect(s.tabs[0]!.idempotencyKey).not.toBe(oldKey);
  });

  it("lưu và đọc lại localStorage; dữ liệu hỏng thì bắt đầu lại", () => {
    const key = storageKey("s1", "u1");
    let s = run(initialTabs(), { type: "new" });
    s = run(s, { type: "update", id: s.activeId, update: (c) => addProduct(c, product) });
    saveTabs(key, s);
    expect(loadTabs(key)).toEqual(s);
    expect(loadTabs(storageKey("s1", "u2")).tabs[0]!.lines).toEqual([]);

    localStorage.setItem(key, "{không phải json");
    expect(loadTabs(key).tabs).toHaveLength(1);
    localStorage.setItem(key, JSON.stringify({ version: 1, tabs: [{ id: 1 }], activeId: "x" }));
    expect(loadTabs(key).tabs[0]!.lines).toEqual([]);
  });
});

describe("ghi nợ từ Sổ nợ", () => {
  const lan = {
    id: "kh-lan",
    code: "KH000027",
    name: "Chị Lan",
    phone: "0912345678",
    debt: 363_000,
    debtLimit: 1_000_000,
  };

  it("đơn đang mở còn trống: gắn khách vào luôn", () => {
    const start = initialTabs();
    const next = posTabsReducer(start, { type: "openForCustomer", customer: lan });
    expect(next.tabs).toHaveLength(1);
    expect(next.tabs[0]!.customer).toEqual(lan);
  });

  it("đơn đang mở có hàng: mở đơn mới cho khách; gọi lại thì chuyển về đơn đó", () => {
    const start = run(initialTabs());
    const withLine = posTabsReducer(start, {
      type: "update",
      id: start.activeId,
      update: (c) => addProduct(c, product),
    });
    const next = posTabsReducer(withLine, { type: "openForCustomer", customer: lan });
    expect(next.tabs).toHaveLength(2);
    expect(next.tabs.find((t) => t.id === next.activeId)!.customer?.id).toBe("kh-lan");
    const back = posTabsReducer(
      { ...next, activeId: withLine.activeId },
      { type: "openForCustomer", customer: lan },
    );
    expect(back.tabs).toHaveLength(2);
    expect(back.activeId).toBe(next.activeId);
  });

  it("đủ 10 đơn đều có hàng: giữ nguyên trạng thái", () => {
    let state = initialTabs();
    for (let i = 0; i < MAX_TABS; i++) {
      state = posTabsReducer(state, {
        type: "update",
        id: state.activeId,
        update: (c) => addProduct(c, product),
      });
      if (i < MAX_TABS - 1) state = posTabsReducer(state, { type: "new" });
    }
    expect(posTabsReducer(state, { type: "openForCustomer", customer: lan })).toBe(state);
  });
});

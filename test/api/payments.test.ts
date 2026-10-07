import { env } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import type { CreatePaymentInput } from "../../src/shared/schemas/payment";
import { createDatabase } from "../../src/worker/db/client";
import { contacts, debtEntries, documents } from "../../src/worker/db/schema";
import { errorOf } from "../helpers/api";
import { createContact, createProduct } from "../helpers/catalog";
import { purchase, purchaseInput, saleInput, sell } from "../helpers/sales";
import { addStaff, createStore, createTwoStores, type TestStore } from "../helpers/stores";

const db = createDatabase(env.DB);

async function saleKey(id: string) {
  return (await db.select().from(documents).where(eq(documents.id, id)).get())!.idempotencyKey!;
}

async function contactRow(id: string) {
  return (await db.select().from(contacts).where(eq(contacts.id, id)).get())!;
}

function paymentInput(
  contactId: string,
  amount: number,
  overrides: Partial<CreatePaymentInput> = {},
): CreatePaymentInput {
  return {
    idempotencyKey: crypto.randomUUID(),
    type: "receipt",
    contactId,
    amount,
    method: "cash",
    note: null,
    ...overrides,
  };
}

/** Khách nợ 363.000 qua một hóa đơn trả thiếu. */
async function customerWithDebt(store: TestStore) {
  const p = await createProduct(store.owner, { openingStock: 100_000 });
  const lan = await createContact(store.owner, { name: "Chị Lan" });
  const sale = await sell(
    store.owner,
    saleInput([{ productId: p.id, unitName: "Chai", qty: 10_000, unitPrice: 38_000 }], {
      contactId: lan.id,
      paid: 17_000,
    }),
  );
  expect((await contactRow(lan.id)).debt).toBe(363_000);
  return { p, lan, sale };
}

describe("phiếu thu nợ khách", () => {
  it("thu một phần → giảm nợ, giữ ngày bắt đầu nợ; thu hết → debt_since = NULL", async () => {
    const store = await createStore();
    const staff = await addStaff(store);
    const { lan } = await customerWithDebt(store);
    const since = (await contactRow(lan.id)).debtSince;

    const res = await staff.api.payments.$post({ json: paymentInput(lan.id, 200_000) });
    expect(res.status).toBe(201);
    const pt = await res.json();
    expect(pt).toMatchObject({
      code: "PT000001",
      type: "receipt",
      status: "completed",
      amount: 200_000,
      balanceAfter: 163_000,
      contact: { id: lan.id, debt: 163_000 },
    });
    expect(await contactRow(lan.id)).toMatchObject({ debt: 163_000, debtSince: since });

    const all = await (
      await staff.api.payments.$post({
        json: paymentInput(lan.id, 163_000, { method: "transfer" }),
      })
    ).json();
    expect(all.code).toBe("PT000002");
    expect(await contactRow(lan.id)).toMatchObject({ debt: 0, debtSince: null });

    const entries = await db.select().from(debtEntries).where(eq(debtEntries.contactId, lan.id));
    expect(entries.map((e) => [e.amount, e.balanceAfter])).toEqual([
      [363_000, 363_000],
      [-200_000, 163_000],
      [-163_000, 0],
    ]);
  });

  it("thu quá nợ → AMOUNT_EXCEEDS_DEBT, không ghi gì; khách không nợ cũng vậy", async () => {
    const store = await createStore();
    const { lan } = await customerWithDebt(store);
    const res = await store.owner.api.payments.$post({ json: paymentInput(lan.id, 363_001) });
    expect(res.status).toBe(409);
    expect(await errorOf(res)).toMatchObject({
      code: "AMOUNT_EXCEEDS_DEBT",
      details: { debt: 363_000, amount: 363_001 },
    });
    const minh = await createContact(store.owner, { name: "Anh Minh", phone: null });
    const none = await store.owner.api.payments.$post({ json: paymentInput(minh.id, 1_000) });
    expect((await errorOf(none)).code).toBe("AMOUNT_EXCEEDS_DEBT");
    expect((await contactRow(lan.id)).debt).toBe(363_000);
    const counter = await store.owner.api.payments.$post({ json: paymentInput(lan.id, 1_000) });
    expect((await counter.json()).code).toBe("PT000001");
  });

  it("hai phiếu thu song song, mỗi phiếu thu hết nợ → chỉ một phiếu được ghi", async () => {
    const store = await createStore();
    const { lan } = await customerWithDebt(store);
    const results = await Promise.all([
      store.owner.api.payments.$post({ json: paymentInput(lan.id, 363_000) }),
      store.owner.api.payments.$post({ json: paymentInput(lan.id, 363_000) }),
    ]);
    const statuses: number[] = results.map((r) => r.status);
    expect(statuses.sort()).toEqual([201, 409]);
    expect((await contactRow(lan.id)).debt).toBe(0);
  });

  it("idempotency: gửi lại cùng key → 200, trả phiếu cũ; key của hóa đơn bán → IDEMPOTENCY_CONFLICT", async () => {
    const store = await createStore();
    const { lan, sale } = await customerWithDebt(store);
    const input = paymentInput(lan.id, 100_000);
    const first = await store.owner.api.payments.$post({ json: input });
    const again = await store.owner.api.payments.$post({ json: input });
    expect(again.status).toBe(200);
    expect((await again.json()).id).toBe((await first.json()).id);
    expect((await contactRow(lan.id)).debt).toBe(263_000);

    const sameAsSale = await store.owner.api.payments.$post({
      json: paymentInput(lan.id, 1_000, { idempotencyKey: await saleKey(sale.id) }),
    });
    expect((await errorOf(sameAsSale)).code).toBe("IDEMPOTENCY_CONFLICT");
    // Chiều ngược lại: hóa đơn bán dùng key của phiếu thu.
    const p = await createProduct(store.owner, { name: "Khác", openingStock: 1_000 });
    const saleWithPaymentKey = await store.owner.api.sales.$post({
      json: saleInput([{ productId: p.id, unitName: "Chai", qty: 1_000, unitPrice: 38_000 }], {
        idempotencyKey: input.idempotencyKey,
      }),
    });
    expect((await errorOf(saleWithPaymentKey)).code).toBe("IDEMPOTENCY_CONFLICT");
  });

  it("hủy phiếu thu → nợ cộng lại, debt_since bắt đầu lại; hủy 2 lần → ALREADY_CANCELLED; staff không hủy được", async () => {
    const store = await createStore();
    const staff = await addStaff(store);
    const { lan } = await customerWithDebt(store);
    const input = paymentInput(lan.id, 363_000);
    const pt = await (await staff.api.payments.$post({ json: input })).json();
    expect((await contactRow(lan.id)).debtSince).toBeNull();

    const denied = await staff.api.payments[":id"].cancel.$post({ param: { id: pt.id } });
    expect(denied.status).toBe(403);
    const res = await store.owner.api.payments[":id"].cancel.$post({ param: { id: pt.id } });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: "cancelled", contact: { debt: 363_000 } });
    const row = await contactRow(lan.id);
    expect(row.debt).toBe(363_000);
    expect(row.debtSince).not.toBeNull();

    const again = await store.owner.api.payments[":id"].cancel.$post({ param: { id: pt.id } });
    expect((await errorOf(again)).code).toBe("ALREADY_CANCELLED");
    expect((await contactRow(lan.id)).debt).toBe(363_000);
    // Gửi lại key của phiếu đã hủy: trả lại phiếu (đã hủy), không thu lần nữa.
    const replay = await staff.api.payments.$post({ json: input });
    expect(replay.status).toBe(200);
    expect(await replay.json()).toMatchObject({ id: pt.id, status: "cancelled" });
    expect((await contactRow(lan.id)).debt).toBe(363_000);
  });

  it("hai lần hủy song song cùng một phiếu → chỉ cộng lại nợ một lần", async () => {
    const store = await createStore();
    const { lan } = await customerWithDebt(store);
    const pt = await (
      await store.owner.api.payments.$post({ json: paymentInput(lan.id, 100_000) })
    ).json();
    const cancel = () => store.owner.api.payments[":id"].cancel.$post({ param: { id: pt.id } });
    const statuses: number[] = (await Promise.all([cancel(), cancel()])).map((r) => r.status);
    expect(statuses.sort()).toEqual([200, 409]);
    expect((await contactRow(lan.id)).debt).toBe(363_000);
    const entries = await db.select().from(debtEntries).where(eq(debtEntries.paymentId, pt.id));
    expect(entries.map((e) => e.amount).sort()).toEqual([-100_000, 100_000].sort());
  });

  it("phiếu chi trả nợ NCC: chỉ owner; khách hàng/NCC sai loại → INVALID_CONTACT", async () => {
    const store = await createStore();
    const staff = await addStaff(store);
    const p = await createProduct(store.owner);
    const ncc = await createContact(store.owner, { type: "supplier", name: "Đại lý Hưng Thịnh" });
    await purchase(
      store.owner,
      purchaseInput([{ productId: p.id, unitName: "Chai", qty: 50_000, unitPrice: 30_000 }], {
        contactId: ncc.id,
        paid: 0,
      }),
    );
    const input = paymentInput(ncc.id, 500_000, { type: "disbursement" });
    expect((await staff.api.payments.$post({ json: input })).status).toBe(403);
    const pc = await (await store.owner.api.payments.$post({ json: input })).json();
    expect(pc).toMatchObject({ code: "PC000001", contact: { debt: 1_000_000 } });

    // Staff chỉ xem được phiếu thu, không xem được phiếu chi (ngoài phạm vi thu nợ của staff).
    const denied = await staff.api.payments[":id"].$get({ param: { id: pc.id } });
    expect((await errorOf(denied)).code).toBe("FORBIDDEN");
    const seen = await (
      await store.owner.api.payments[":id"].$get({ param: { id: pc.id } })
    ).json();
    expect(seen.code).toBe("PC000001");

    const wrong = await store.owner.api.payments.$post({ json: paymentInput(ncc.id, 1_000) });
    expect((await errorOf(wrong)).code).toBe("INVALID_CONTACT");
    const tooMuch = await store.owner.api.payments.$post({
      json: paymentInput(ncc.id, 1_000_001, { type: "disbursement" }),
    });
    expect(await errorOf(tooMuch)).toMatchObject({
      code: "AMOUNT_EXCEEDS_DEBT",
      details: { debt: 1_000_000, amount: 1_000_001 },
    });
  });
});

describe("sổ chi tiết công nợ và tổng sổ nợ", () => {
  it("sổ chi tiết: mới nhất trước, diễn giải, phát sinh/đã trả/dư nợ, mã chứng từ hoặc phiếu", async () => {
    const store = await createStore();
    const staff = await addStaff(store);
    const { p, lan, sale } = await customerWithDebt(store);
    const pt = await (
      await staff.api.payments.$post({ json: paymentInput(lan.id, 200_000) })
    ).json();
    const credit = await sell(
      store.owner,
      saleInput([{ productId: p.id, unitName: "Chai", qty: 1_000, unitPrice: 38_000 }], {
        contactId: lan.id,
        paid: 0,
      }),
    );
    await store.owner.api.documents[":id"].cancel.$post({ param: { id: credit.id } });
    await store.owner.api.payments[":id"].cancel.$post({ param: { id: pt.id } });

    const res = await staff.api.contacts[":id"]["debt-entries"].$get({
      param: { id: lan.id },
      query: { page: "1", pageSize: "10" },
    });
    const ledger = await res.json();
    expect(ledger.total).toBe(5);
    expect(
      ledger.items.map((e) => [e.ref?.code, e.description, e.increase, e.decrease, e.balanceAfter]),
    ).toEqual([
      ["PT000001", "Hủy phiếu thu PT000001", 200_000, 0, 363_000],
      [credit.code, `Hủy hóa đơn ${credit.code}`, 0, 38_000, 163_000],
      [credit.code, "Bán hàng ghi nợ", 38_000, 0, 201_000],
      ["PT000001", "Thu nợ tiền mặt", 0, 200_000, 163_000],
      [sale.code, "Bán hàng, trả thiếu", 363_000, 0, 363_000],
    ]);
    const page2 = await (
      await staff.api.contacts[":id"]["debt-entries"].$get({
        param: { id: lan.id },
        query: { page: "2", pageSize: "4" },
      })
    ).json();
    expect(page2.items.map((e) => e.ref?.code)).toEqual([sale.code]);

    const detail = await (await staff.api.contacts[":id"].$get({ param: { id: lan.id } })).json();
    expect(detail.lastPayment).toBeNull(); // phiếu duy nhất đã bị hủy
  });

  it("tổng sổ nợ: phải thu, quá 30 ngày, đã thu tháng này, phải trả NCC", async () => {
    const store = await createStore();
    const { lan } = await customerWithDebt(store);
    const hoa = await createContact(store.owner, { name: "Cô Hoa", phone: null });
    await sell(
      store.owner,
      saleInput(
        [
          {
            productId: (await createProduct(store.owner, { name: "B", openingStock: 10_000 })).id,
            unitName: "Chai",
            qty: 5_000,
            unitPrice: 130_000,
          },
        ],
        { contactId: hoa.id, paid: 0 },
      ),
    );
    // Cô Hoa nợ từ 35 ngày trước.
    await db
      .update(contacts)
      .set({ debtSince: Date.now() - 35 * 86_400_000 })
      .where(eq(contacts.id, hoa.id));
    await store.owner.api.payments.$post({ json: paymentInput(lan.id, 100_000) });
    await store.owner.api.payments.$post({ json: paymentInput(lan.id, 63_000) });
    const ncc = await createContact(store.owner, { type: "supplier", name: "NCC", phone: null });
    const p = await createProduct(store.owner, { name: "C" });
    await purchase(
      store.owner,
      purchaseInput([{ productId: p.id, unitName: "Chai", qty: 10_000, unitPrice: 30_000 }], {
        contactId: ncc.id,
        paid: 100_000,
      }),
    );

    const summary = await (await store.owner.api.debts.summary.$get()).json();
    expect(summary).toMatchObject({
      receivable: { amount: 200_000 + 650_000, customers: 2 },
      overdue: { amount: 650_000, customers: 1, days: 30 },
      collectedThisMonth: { amount: 163_000, count: 2 },
      payable: { amount: 200_000, suppliers: 1 },
    });
    const detail = await (
      await store.owner.api.contacts[":id"].$get({ param: { id: lan.id } })
    ).json();
    expect(detail.lastPayment).toMatchObject({ code: "PT000002", amount: 63_000, method: "cash" });
  });

  it("cô lập: B không thu nợ khách của A, không hủy/xem phiếu, không xem sổ nợ của A", async () => {
    const { a, b } = await createTwoStores();
    const { lan } = await customerWithDebt(a);
    const pt = await (
      await a.owner.api.payments.$post({ json: paymentInput(lan.id, 1_000) })
    ).json();

    const pay = await b.owner.api.payments.$post({ json: paymentInput(lan.id, 1_000) });
    expect((await errorOf(pay)).code).toBe("INVALID_CONTACT");
    expect((await b.owner.api.payments[":id"].$get({ param: { id: pt.id } })).status).toBe(404);
    const cancel = await b.owner.api.payments[":id"].cancel.$post({ param: { id: pt.id } });
    expect(cancel.status).toBe(404);
    const ledger = await b.owner.api.contacts[":id"]["debt-entries"].$get({
      param: { id: lan.id },
      query: {},
    });
    expect(ledger.status).toBe(404);
    const summary = await (await b.owner.api.debts.summary.$get()).json();
    expect(summary.receivable).toEqual({ amount: 0, customers: 0 });
    expect((await contactRow(lan.id)).debt).toBe(362_000);
  });
});

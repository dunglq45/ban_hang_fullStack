import { expect, type Page } from "@playwright/test";

export const OWNER = { phone: "0900000001", password: "123456" };
export const STAFF = { phone: "0900000002", password: "123456" };

/** Tắt tự in sau khi bán/thu nợ (sẽ mở tab mới và gọi window.print). */
export async function disableAutoPrint(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("pos:print", "0");
    localStorage.setItem("debt:print", "0");
  });
}

export async function login(page: Page, account: { phone: string; password: string }) {
  await page.goto("/login");
  await page.getByLabel("Số điện thoại").fill(account.phone);
  await page.getByRole("textbox", { name: "Mật khẩu", exact: true }).fill(account.password);
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  await expect(page).toHaveURL(/\/ban-hang$/);
}

/**
 * Đọc JSON qua API bằng fetch ngay trong trang (cookie phiên có cờ Secure, `page.request` không gửi
 * qua http://127.0.0.1). GET không cần header CSRF.
 */
export async function apiGet<T>(page: Page, path: string): Promise<T> {
  const { status, body } = await page.evaluate(async (url) => {
    const res = await fetch(url);
    return { status: res.status, body: (await res.json()) as unknown };
  }, `/api${path}`);
  expect(status, `GET ${path} → ${status}`).toBe(200);
  return body as T;
}

interface PosProduct {
  id: string;
  name: string;
  stock: number;
}

export async function productStock(page: Page, name: string): Promise<number> {
  const { items } = await apiGet<{ items: PosProduct[] }>(page, "/products/pos");
  const product = items.find((p) => p.name === name);
  if (!product) throw new Error(`Không thấy hàng ${name}`);
  return product.stock;
}

export async function customerDebt(page: Page, name: string): Promise<number> {
  const { items } = await apiGet<{ items: { name: string; debt: number }[] }>(
    page,
    `/contacts?type=customer&q=${encodeURIComponent(name)}`,
  );
  const contact = items.find((c) => c.name === name);
  if (!contact) throw new Error(`Không thấy khách ${name}`);
  return contact.debt;
}

/** Chọn khách ở POS qua ô tìm khách. */
export async function pickCustomer(page: Page, name: string) {
  await page.getByRole("combobox", { name: "Khách hàng" }).fill(name);
  await page
    .getByRole("option", { name: new RegExp(name) })
    .first()
    .click();
}

/** Bấm Thanh toán ở POS, chờ server tạo hóa đơn (201) và thông báo "Đã bán"; trả về mã hóa đơn. */
export async function checkout(page: Page): Promise<string> {
  const response = page.waitForResponse(
    (r) => r.url().endsWith("/api/sales") && r.request().method() === "POST",
  );
  await page.getByRole("button", { name: /^Thanh toán/ }).click();
  const res = await response;
  expect(res.status()).toBe(201);
  const { code } = (await res.json()) as { code: string };
  await expect(page.getByText(`Đã bán ${code}`)).toBeVisible();
  return code;
}

/** Số tiền theo hiển thị vi-VN: 120000 → "120.000". */
export function vnd(n: number): string {
  return new Intl.NumberFormat("vi-VN").format(n);
}

/** Bấm ô hàng ở lưới "Chọn hàng" của POS `times` lần. */
export async function addToCart(page: Page, name: string, times = 1) {
  const tile = page
    .getByRole("region", { name: "Chọn hàng" })
    .getByRole("button", { name: new RegExp(name) });
  for (let i = 0; i < times; i++) await tile.click();
}

/** Mã trạng thái HTTP của một GET (không kiểm tra kết quả). */
export async function apiStatus(page: Page, path: string): Promise<number> {
  return page.evaluate(async (url) => (await fetch(url)).status, `/api${path}`);
}

export async function productId(page: Page, name: string): Promise<string> {
  const { items } = await apiGet<{ items: PosProduct[] }>(page, "/products/pos");
  const product = items.find((p) => p.name === name);
  if (!product) throw new Error(`Không thấy hàng ${name}`);
  return product.id;
}

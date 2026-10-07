import { expect, test, type Page } from "@playwright/test";
import { addToCart, checkout, customerDebt, disableAutoPrint, productStock, vnd } from "./helpers";

// Luồng chính của một cửa hàng mới: đăng ký → thêm 2 hàng → nhập hàng → bán trả đủ → bán ghi nợ
// → thu nợ → Tổng quan khớp số liệu.

const A = { name: "Nước mắm E2E", unit: "Chai", cost: 20_000, price: 30_000, opening: 10 };
const B = { name: "Đường E2E", unit: "Gói", cost: 15_000, price: 20_000, opening: 0 };
const CUSTOMER = "Anh Tư E2E";

async function addProduct(page: Page, p: typeof A) {
  await page.goto("/hang-hoa/moi");
  await page.getByLabel("Tên hàng").fill(p.name);
  await page.getByLabel("Giá vốn").fill(String(p.cost));
  await page.getByLabel("Giá bán lẻ").fill(String(p.price));
  await page.getByLabel("Đơn vị cơ bản").fill(p.unit);
  if (p.opening) await page.getByLabel(/Tồn kho ban đầu/).fill(String(p.opening));
  await page.getByRole("button", { name: "Lưu hàng hóa" }).click();
  await expect(page).not.toHaveURL(/\/hang-hoa\/moi$/);
}

test("cửa hàng mới: nhập, bán, ghi nợ, thu nợ, tổng quan", async ({ page }) => {
  await disableAutoPrint(page);
  const phone = `09${String(Date.now()).slice(-8)}`;

  await test.step("đăng ký cửa hàng", async () => {
    await page.goto("/register");
    await page.getByLabel("Tên cửa hàng").fill("Tạp hóa E2E");
    await page.getByLabel("Tên chủ cửa hàng").fill("Chủ E2E");
    await page.getByLabel("Số điện thoại").fill(phone);
    await page.getByRole("textbox", { name: "Mật khẩu", exact: true }).fill("123456");
    await page.getByRole("textbox", { name: "Nhập lại mật khẩu" }).fill("123456");
    await page.getByRole("button", { name: "Tạo cửa hàng" }).click();
    await expect(page).toHaveURL(/\/ban-hang$/);
  });

  await test.step("thêm 2 hàng", async () => {
    await addProduct(page, A);
    await addProduct(page, B);
    expect(await productStock(page, A.name)).toBe(A.opening * 1000);
    expect(await productStock(page, B.name)).toBe(0);
  });

  await test.step("nhập 20 gói hàng B, trả đủ", async () => {
    await page.goto("/nhap-hang/moi");
    await page.getByRole("combobox", { name: "Thêm hàng vào phiếu" }).fill(B.name);
    await page.getByRole("option", { name: new RegExp(B.name) }).click();
    await page.getByLabel(`Số lượng ${B.name}`).fill("20");
    await page.getByLabel(`Giá nhập ${B.name}`).fill(String(B.cost));
    await page.getByRole("button", { name: "Hoàn thành nhập hàng" }).click();
    await expect.poll(() => productStock(page, B.name)).toBe(20_000);
  });

  await test.step("bán 2 chai hàng A, khách trả đủ", async () => {
    await page.goto("/ban-hang");
    await addToCart(page, A.name, 2);
    await checkout(page);
    expect(await productStock(page, A.name)).toBe(8_000);
  });

  await test.step("bán 3 gói hàng B cho khách mới, trả 10.000, ghi nợ phần còn lại", async () => {
    await page.getByRole("button", { name: "Thêm khách mới" }).click();
    const dialog = page.getByRole("dialog", { name: "Thêm khách mới" });
    await dialog.getByLabel("Tên khách").fill(CUSTOMER);
    await dialog.getByRole("button", { name: "Thêm và chọn" }).click();
    await expect(dialog).toBeHidden();
    await addToCart(page, B.name, 3);
    await page.getByLabel("Khách thanh toán").fill("10000");
    await checkout(page);
    expect(await productStock(page, B.name)).toBe(17_000);
    expect(await customerDebt(page, CUSTOMER)).toBe(50_000);
  });

  await test.step("thu nợ 30.000", async () => {
    await page.goto("/so-no");
    await page
      .getByRole("link", { name: new RegExp(CUSTOMER) })
      .first()
      .click();
    await page.getByRole("button", { name: "Thu nợ" }).click();
    const dialog = page.getByRole("dialog", { name: "Thu nợ" });
    await dialog.getByLabel("Số tiền thu").fill("30000");
    await dialog.getByRole("button", { name: /^Xác nhận thu/ }).click();
    await expect(dialog).toBeHidden();
    await expect.poll(() => customerDebt(page, CUSTOMER)).toBe(20_000);
  });

  await test.step("Tổng quan hôm nay", async () => {
    await page.goto("/tong-quan");
    // Doanh thu 60.000 + 60.000; lãi gộp (30.000−20.000)×2 + (20.000−15.000)×3 = 35.000.
    const kpi = (label: string) => page.getByText(label, { exact: true }).first().locator("..");
    await expect(kpi("Doanh thu")).toContainText(vnd(120_000));
    await expect(kpi("Doanh thu")).toContainText("2 đơn");
    await expect(kpi("Lợi nhuận gộp")).toContainText(vnd(35_000));
    await expect(kpi("Phải thu khách hàng")).toContainText(vnd(20_000));
    await expect(kpi("Phải thu khách hàng")).toContainText("1 khách đang nợ");
  });
});

import { expect, test } from "@playwright/test";
import {
  addToCart,
  checkout,
  customerDebt,
  disableAutoPrint,
  login,
  OWNER,
  pickCustomer,
  productStock,
} from "./helpers";

const NAME = "Mì gói tôm chua cay"; // 4.500 đ / gói
const CUSTOMER = "Chị Lan";

test("hủy hóa đơn: tồn kho và nợ trở lại như trước", async ({ page }) => {
  await disableAutoPrint(page);
  await login(page, OWNER);
  const stockBefore = await productStock(page, NAME);
  const debtBefore = await customerDebt(page, CUSTOMER);

  const code = await test.step("bán 2 gói cho Chị Lan, ghi nợ toàn bộ", async () => {
    await addToCart(page, NAME, 2);
    await pickCustomer(page, CUSTOMER);
    await page.getByLabel("Khách thanh toán").fill("0");
    const code = await checkout(page);
    expect(await productStock(page, NAME)).toBe(stockBefore - 2_000);
    expect(await customerDebt(page, CUSTOMER)).toBe(debtBefore + 9_000);
    return code;
  });

  await test.step("hủy hóa đơn ở trang Hóa đơn", async () => {
    await page.goto("/hoa-don");
    await page.getByRole("button", { name: code, exact: true }).click();
    await page
      .getByRole("dialog", { name: `Hóa đơn ${code}` })
      .getByRole("button", { name: "Hủy hóa đơn" })
      .click();
    const confirm = page.getByRole("dialog", { name: `Hủy hóa đơn ${code}?` });
    await expect(confirm).toContainText("Nợ của Chị Lan giảm 9.000");
    await confirm.getByRole("button", { name: "Hủy hóa đơn" }).click();
    await expect(confirm).toBeHidden();
  });

  await expect.poll(() => productStock(page, NAME)).toBe(stockBefore);
  expect(await customerDebt(page, CUSTOMER)).toBe(debtBefore);
});

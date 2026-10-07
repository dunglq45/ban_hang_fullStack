import { expect, test } from "@playwright/test";
import { disableAutoPrint, login, OWNER } from "./helpers";

// Máy quét mã vạch USB = bàn phím gõ rất nhanh rồi Enter.
const BARCODE = "8934563138165";
const NAME = "Mì gói tôm chua cay";

test("quét mã vạch thêm hàng vào hóa đơn", async ({ page }) => {
  await disableAutoPrint(page);
  await login(page, OWNER);
  const cart = page.getByRole("list", { name: "Hàng trong đơn" });
  const qty = page.getByRole("textbox", { name: `Số lượng ${NAME}` });
  await expect(
    page.getByRole("region", { name: "Chọn hàng" }).getByRole("button").first(),
  ).toBeVisible();

  await test.step("focus không ở ô nhập nào", async () => {
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.type(BARCODE, { delay: 5 });
    await page.keyboard.press("Enter");
    await expect(cart.getByText(NAME)).toBeVisible();
    await expect(qty).toHaveValue("1");
  });

  await test.step("đang ở ô Giảm giá: mã không lọt vào ô, hàng được cộng thêm", async () => {
    const discount = page.getByLabel("Giảm giá");
    await discount.click();
    await page.keyboard.type(BARCODE, { delay: 5 });
    await page.keyboard.press("Enter");
    await expect(qty).toHaveValue("2");
    await expect(discount).toHaveValue("");
  });

  await test.step("gõ mã vào ô tìm hàng rồi Enter", async () => {
    await page.getByRole("searchbox", { name: "Tìm hàng" }).fill(BARCODE);
    await page.keyboard.press("Enter");
    await expect(qty).toHaveValue("3");
    await expect(page.getByRole("searchbox", { name: "Tìm hàng" })).toHaveValue("");
  });
});

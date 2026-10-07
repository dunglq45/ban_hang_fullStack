import { expect, test } from "@playwright/test";
import { apiGet, apiStatus, login, productId, STAFF } from "./helpers";

const NAME = "Mì gói tôm chua cay";

test("nhân viên không thấy giá vốn, không vào được Tổng quan", async ({ page }) => {
  await login(page, STAFF);

  await test.step("menu không có Tổng quan; mở thẳng /tong-quan bị đưa về Bán hàng", async () => {
    await expect(page.getByRole("link", { name: "Bán hàng" }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Tổng quan" })).toHaveCount(0);
    await page.goto("/tong-quan");
    await expect(page).toHaveURL(/\/ban-hang$/);
  });

  await test.step("chi tiết hàng hóa không hiện giá vốn", async () => {
    const id = await productId(page, NAME);
    await page.goto(`/hang-hoa/${id}`);
    await expect(page.getByRole("heading", { name: NAME })).toBeVisible();
    await expect(page.getByText(/giá vốn/i)).toHaveCount(0);
    await expect(page.getByText(/lợi nhuận|lãi/i)).toHaveCount(0);
  });

  await test.step("API không trả giá vốn, báo cáo bị chặn", async () => {
    const id = await productId(page, NAME);
    const detail = await apiGet<Record<string, unknown>>(page, `/products/${id}`);
    const list = await apiGet<{ items: Record<string, unknown>[] }>(page, "/products?pageSize=5");
    for (const body of [detail, ...list.items]) {
      expect(JSON.stringify(body)).not.toMatch(/cost|profit|margin/i);
    }
    expect(await apiStatus(page, "/reports/overview?period=today")).toBe(403);
  });
});

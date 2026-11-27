import { test, expect } from "@playwright/test";

test("homepage renders travel discovery", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/ShopnoJatra/);
  await expect(
    page.getByRole("heading", { name: /Journey Beyond Dreams/i }),
  ).toBeVisible();
});

test("search route renders honest empty states", async ({ page }) => {
  await page.goto("/search?city=Coxs%20Bazar");
  await expect(page.getByRole("heading", { name: "Search results" })).toBeVisible();
  await expect(page.getByText(/hotel/i).first()).toBeVisible();
});

test("destination detail route renders", async ({ page }) => {
  await page.goto("/destinations/coxs-bazar");
  await expect(page.getByRole("heading", { name: /Cox's Bazar/i })).toBeVisible();
});

test("booking history requires authentication", async ({ page }) => {
  await page.goto("/account/bookings");
  await expect(page).toHaveURL(/\/auth\/login/);
});

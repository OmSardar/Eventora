import { test, expect } from "@playwright/test";

test.describe("Events Discovery & Detail", () => {
  test("Landing page displays value proposition and featured events", async ({ page }) => {
    await page.goto("/");

    await expect(page.locator("h1")).toContainText("Exceptional events");
    await expect(page.getByRole("link", { name: "Browse Events" }).first()).toBeVisible();
    await expect(page.locator("text=Atomic Guarantee")).toBeVisible();
  });

  test("Browse events page allows filtering by category", async ({ page }) => {
    await page.goto("/events");

    await expect(page.locator("h1")).toContainText("Discover Upcoming Events");
    await page.click("button:has-text('Technology')");

    // Wait for filtered results
    await expect(page.locator("input[placeholder*='Search']")).toBeVisible();
  });
});


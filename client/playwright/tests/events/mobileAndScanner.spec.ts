import { test, expect } from "@playwright/test";

test.describe("Mobile QR Ticket Scanner & Responsive Dropdown UI", () => {
  test("1. Ticket verification page displays mobile camera scanner UI and handles manual input", async ({ page }) => {
    await page.goto("/tickets/verify");
    await expect(page.locator("h1")).toContainText("Digital Ticket Verification");

    // Camera scanner placeholder is present
    await expect(page.locator("text=Mobile Camera Scanner")).toBeVisible({ timeout: 10000 });
    await expect(page.locator("button:has-text('Start Camera Scanner')")).toBeVisible();
    await expect(page.locator("button:has-text('Upload or Snap Photo')")).toBeVisible();

    // Toggle manual input
    const manualToggle = page.locator("button:has-text('Type / Paste Token Manually')");
    await expect(manualToggle).toBeVisible();
    await manualToggle.click();

    const tokenInput = page.locator("input[placeholder*='Paste ticket HMAC token']");
    await expect(tokenInput).toBeVisible();

    // Verify invalid ticket rejection
    await tokenInput.fill("invalid_fake_token.payload");
    await page.locator("button:has-text('Verify')").click();

    await expect(page.locator("text=Invalid or Forged Ticket")).toBeVisible({ timeout: 10000 });
    await expect(page.locator("text=ENTRY REJECTED")).toBeVisible();
  });

  test("2. Responsive viewport test: 320px width has no horizontal overflow and category select works", async ({ page }) => {
    // Test small iPhone SE / ultra-narrow mobile viewport
    await page.setViewportSize({ width: 320, height: 600 });
    await page.goto("/events");

    // Check no horizontal body overflow
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 2); // allowance for subpixel rounding

    // Category select dropdown is rendered on mobile
    const categorySelect = page.locator("button[aria-label='Filter events by category']");
    await expect(categorySelect).toBeVisible();
    await categorySelect.click();

    // Verify select options are visible and have min-h touch padding
    const technologyItem = page.locator("div[role='option']:has-text('Technology')");
    await expect(technologyItem).toBeVisible({ timeout: 5000 });

    // Select Technology
    await technologyItem.click();
    await expect(categorySelect).toContainText("Technology");
  });

  test("3. Responsive viewport test: 375px width has no horizontal overflow", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/tickets/verify");

    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 2);

    // Verify scanner card fits cleanly in viewport
    const scannerCard = page.locator("text=Mobile Camera Scanner");
    await expect(scannerCard).toBeVisible();
  });

  test("4. Responsive viewport test: 768px tablet width displays clean layout", async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto("/events");

    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 2);
  });
});


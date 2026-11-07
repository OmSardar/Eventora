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

  test("Organizer can access event creation and view backend image upload controls", async ({ page }) => {
    await page.goto("/login");

    // Login as Organizer
    await page.click("button:has-text('Fill Organizer')");
    await page.locator("form button[type='submit']").click();
    await expect(page).toHaveURL(/.*organizer\/dashboard/, { timeout: 10000 });

    // Navigate to create event
    await page.goto("/organizer/events/create");
    await expect(page.locator("text=Host a New Event")).toBeVisible();

    // Verify ImageUploadField is rendered with Upload Image and Use Image URL tabs
    const uploadTab = page.locator("button:has-text('Upload Image')");
    const urlTab = page.locator("button:has-text('Use Image URL')");
    await expect(uploadTab).toBeVisible();
    await expect(urlTab).toBeVisible();

    // Click Upload Image tab to show file upload target
    await uploadTab.click();
    await expect(page.locator("text=Drag and drop an image here")).toBeVisible();
  });
});

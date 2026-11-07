import { test, expect } from "@playwright/test";

test.describe("Authentication Journeys", () => {
  test("Organizer can log in with demo credentials and view dashboard", async ({ page }) => {
    await page.goto("/login");

    // Click demo autofill button
    await page.click("button:has-text('Fill Organizer')");

    // Click Sign In within the form
    await page.locator("form button[type='submit']").click();

    // Should redirect to organizer dashboard
    await expect(page).toHaveURL(/.*organizer\/dashboard/, { timeout: 10000 });
    await expect(page.locator("h1")).toContainText("Overview Dashboard");
  });

  test("Attendee can log in with demo credentials and view tickets", async ({ page }) => {
    await page.goto("/login");

    // Click demo attendee autofill
    await page.click("button:has-text('Fill Attendee')");
    await page.locator("form button[type='submit']").click();

    // Should redirect to attendee registrations
    await expect(page).toHaveURL(/.*attendee\/registrations/, { timeout: 10000 });
    await expect(page.locator("h1")).toContainText("My Booked Events");
  });
});


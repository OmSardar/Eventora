import { test, expect } from "@playwright/test";

test.describe("Payments, Notifications & Commercial Features", () => {
  test("Events browse page renders Free and Paid pricing badges", async ({ page }) => {
    await page.goto("/events");
    await expect(page.locator("h1")).toContainText("Discover Upcoming Events");

    // Check for both Free and Paid badges on event cards
    const freeBadges = page.locator("div:has-text('Free')");
    const paidBadges = page.locator("div:has-text('₹')");

    await expect(freeBadges.first()).toBeVisible({ timeout: 10000 });
    await expect(paidBadges.first()).toBeVisible({ timeout: 10000 });
  });

  test("Notification bell appears for authenticated user and toggles popover", async ({ page }) => {
    await page.goto("/login");

    // Login as Attendee
    await page.click("button:has-text('Fill Attendee')");
    await page.locator("form button[type='submit']").click();
    await expect(page).toHaveURL(/.*attendee\/registrations/, { timeout: 10000 });

    // Locate Notification Bell
    const bellBtn = page.locator("button[aria-label^='Notifications']").first();
    await expect(bellBtn).toBeVisible();

    // Click Notification Bell to open dropdown
    await bellBtn.click();
    const popover = page.locator("[data-testid='notification-popover']");
    await expect(popover).toBeVisible({ timeout: 5000 });
    await expect(popover).toContainText("Notifications");
  });

  test("Attendee can view SMS & Notification settings in registrations page", async ({ page }) => {
    await page.goto("/login");
    await page.click("button:has-text('Fill Attendee')");
    await page.locator("form button[type='submit']").click();
    await expect(page).toHaveURL(/.*attendee\/registrations/, { timeout: 10000 });

    // Expect SMS Settings Card
    await expect(page.locator("h3:has-text('SMS & Transactional Notifications')")).toBeVisible();
    const phoneInput = page.locator("input[type='tel']");
    await expect(phoneInput).toBeVisible();

    // Fill phone number and save
    await phoneInput.fill("9876543210");
    await page.click("button:has-text('Save Preferences')");
    await expect(page.locator("text=Notification preferences updated successfully!")).toBeVisible({
      timeout: 8000,
    });
  });

  test("Organizer dashboard displays Total Revenue metric and attendees table shows payment columns", async ({
    page,
  }) => {
    await page.goto("/login");

    // Login as Organizer
    await page.click("button:has-text('Fill Organizer')");
    await page.locator("form button[type='submit']").click();
    await expect(page).toHaveURL(/.*organizer\/dashboard/, { timeout: 10000 });

    // Verify Total Revenue Metric Card
    const revenueCard = page.locator("text=Total Revenue");
    await expect(revenueCard).toBeVisible();
    await expect(page.locator("text=Gross ticket sales")).toBeVisible();

    // Navigate to My Events and view Attendees of an event with bookings
    await page.goto("/organizer/events");
    await expect(page.locator("h1")).toContainText("My Hosted Events");

    const attendeesLink = page
      .locator("a[href*='/attendees']")
      .filter({ hasText: /Attendees \([1-9]/ })
      .first();
    await attendeesLink.click();
    await expect(page).toHaveURL(/.*attendees/, { timeout: 10000 });

    // Verify attendees table headers include Ticket & Price
    await expect(page.locator("th:has-text('Ticket & Price')")).toBeVisible();
  });
});

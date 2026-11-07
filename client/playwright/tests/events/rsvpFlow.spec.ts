import { test, expect } from "@playwright/test";

test.describe("Free RSVP Flow & Resend Email Confirmation", () => {
  test("Events page displays RSVP badges and seat availability", async ({ page }) => {
    await page.goto("/events");
    await expect(page.locator("h1")).toContainText("Discover Upcoming Events");

    // Check for RSVP badges
    const rsvpBadges = page.locator("div:has-text('RSVP')");
    await expect(rsvpBadges.first()).toBeVisible({ timeout: 10000 });
  });

  test("Notification bell displays in-app notifications for authenticated attendee", async ({ page }) => {
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

  test("Attendee completes RSVP and sees Resend email confirmation alert", async ({ page }) => {
    // Generate a fresh attendee to ensure unbooked status on all events
    const uniqueId = Date.now();
    await page.goto("/register");
    await page.locator("input[placeholder*='Alex Rivera' i], input#name, input[name='name']").fill(`Attendee_${uniqueId}`);
    await page.locator("input[type='email']").fill(`attendee_${uniqueId}@example.com`);
    await page.locator("input[type='password']").fill("SecurePassword@123");
    await page.click("button:has-text('Attendee')");
    await page.locator("form button[type='submit']").click();
    await expect(page).toHaveURL(/.*events/, { timeout: 10000 });

    // Click on an event that has seats left
    const eventWithSeats = page.locator("div.group").filter({ hasText: /seats left/i }).first();
    const viewDetailsBtn = eventWithSeats.locator("a:has-text('View Event Details')");
    await viewDetailsBtn.click();
    await expect(page).toHaveURL(/\/events\/[a-f0-9]+/, { timeout: 10000 });

    // Ensure Confirm My RSVP button is visible
    const rsvpButton = page.locator("button:has-text('Confirm My RSVP')").first();
    await expect(rsvpButton).toBeVisible({ timeout: 5000 });

    // Click RSVP button
    await rsvpButton.click();

    // Verify registration success message and Resend email notification
    await expect(page.locator("text=Registration Successful!")).toBeVisible({ timeout: 10000 });
    await expect(page.locator("text=A confirmation email has been scheduled")).toBeVisible();
    await expect(page.locator("text=Confirmation email on the way via Resend")).toBeVisible();

    // View My Tickets link
    await page.click("a:has-text('View My Tickets')");
    await expect(page).toHaveURL(/.*attendee\/registrations/, { timeout: 10000 });

    // Verify Free RSVP and Email Sent tags
    await expect(page.locator("text=Free RSVP").first()).toBeVisible();
    await expect(page.locator("text=Email Sent").first()).toBeVisible();
  });

  test("Organizer dashboard displays events and attendee roster without payment columns", async ({
    page,
  }) => {
    await page.goto("/login");

    // Login as Organizer
    await page.click("button:has-text('Fill Organizer')");
    await page.locator("form button[type='submit']").click();
    await expect(page).toHaveURL(/.*organizer\/dashboard/, { timeout: 10000 });

    // Verify Metric Cards: Total Events, Attendees Confirmed, Total Capacity, Pending Cancellations
    await expect(page.locator("text=Total Events")).toBeVisible();
    await expect(page.locator("text=Attendees Confirmed")).toBeVisible();
    await expect(page.locator("text=Total Capacity")).toBeVisible();
    await expect(page.locator("text=Pending Cancellations")).toBeVisible();

    // Verify Total Revenue is NOT present
    await expect(page.locator("text=Total Revenue")).not.toBeVisible();

    // Navigate to attendee roster for an event with bookings
    await page.goto("/organizer/events");
    const attendeesLink = page
      .locator("a[href*='/attendees']")
      .filter({ hasText: /Attendees \([1-9]/ })
      .first();
    await attendeesLink.click();
    await expect(page).toHaveURL(/.*attendees/, { timeout: 10000 });

    // Verify attendee table headers
    await expect(page.locator("th:has-text('Attendee Name')")).toBeVisible();
    await expect(page.locator("th:has-text('Email')")).toBeVisible();
    await expect(page.locator("th:has-text('Registration Date')")).toBeVisible();
    await expect(page.locator("th:has-text('Status')")).toBeVisible();

    // Verify "Ticket & Price" column is NOT present
    await expect(page.locator("th:has-text('Ticket & Price')")).not.toBeVisible();
  });
});

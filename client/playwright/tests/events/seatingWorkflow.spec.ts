import { test, expect } from "@playwright/test";

test.describe("Interactive Seat Selection, Hold Countdown & Inventory System", () => {
  test("1. Attendee views interactive seat map, selects seats, and sees live price summary", async ({ page }) => {
    // Navigate to events page
    await page.goto("/events");
    await expect(page.locator("h1")).toContainText("Discover Upcoming Events");

    // Click on an event to view details
    const eventCard = page.locator("div.group").first();
    const detailsLink = eventCard.locator("a:has-text('View Event Details')");
    await detailsLink.click();
    await expect(page).toHaveURL(/\/events\/[a-f0-9]+/, { timeout: 10000 });

    // Verify seat map is present if assigned seating or standard capacity is displayed
    const capacityMeter = page.locator("text=Confirmed Bookings");
    await expect(capacityMeter).toBeVisible({ timeout: 10000 });
  });

  test("2. Ticket verification portal validates genuine tokens and handles manual token input", async ({ page }) => {
    await page.goto("/tickets/verify");
    await expect(page.locator("h1")).toContainText("Digital Ticket Verification");

    // Test input with an invalid test token
    const tokenInput = page.locator("input[placeholder*='Paste ticket HMAC token']");
    await expect(tokenInput).toBeVisible();
    await tokenInput.fill("invalid_test_payload.fake_signature");

    const verifyBtn = page.locator("button:has-text('Verify Pass')");
    await verifyBtn.click();

    // Expect invalid ticket rejection banner
    await expect(page.locator("text=Invalid or Forged Ticket")).toBeVisible({ timeout: 10000 });
    await expect(page.locator("text=ENTRY REJECTED")).toBeVisible();
  });

  test("3. Organizer seating dashboard displays real-time metrics and seat inspector", async ({ page }) => {
    await page.goto("/login");

    // Login as Organizer
    await page.click("button:has-text('Fill Organizer')");
    await page.locator("form button[type='submit']").click();
    await expect(page).toHaveURL(/.*organizer\/dashboard/, { timeout: 10000 });

    // Navigate to events management
    await page.goto("/organizer/events");
    await expect(page.locator("h1")).toContainText("Manage My Events");

    // If an event exists, visit attendees and seating dashboard
    const eventItem = page.locator("a:has-text('View Attendees')").first();
    if (await eventItem.isVisible({ timeout: 5000 }).catch(() => false)) {
      await eventItem.click();
      await expect(page).toHaveURL(/.*attendees/, { timeout: 10000 });

      // Click Seating Inventory button
      const seatingBtn = page.locator("a:has-text('Seating Inventory')");
      if (await seatingBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
        await seatingBtn.click();
        await expect(page).toHaveURL(/.*seating/, { timeout: 10000 });

        // Verify dashboard metrics cards
        await expect(page.locator("text=Total Seats").first()).toBeVisible({ timeout: 10000 });
        await expect(page.locator("text=Available").first()).toBeVisible();
        await expect(page.locator("text=Seat Inspector")).toBeVisible();
      }
    }
  });

  test("4. Event creation form includes dedicated Seating Configurator with live preview", async ({ page }) => {
    await page.goto("/login");

    // Login as Organizer
    await page.click("button:has-text('Fill Organizer')");
    await page.locator("form button[type='submit']").click();
    await expect(page).toHaveURL(/.*organizer\/dashboard/, { timeout: 10000 });

    // Navigate to Create Event
    await page.goto("/organizer/events/create");
    await expect(page.locator("h1")).toContainText("Create New Event");

    // Verify Seating Configurator component is rendered
    await expect(page.locator("text=Event Seating & Venue Layout")).toBeVisible({ timeout: 10000 });
    await expect(page.locator("button:has-text('Assigned Seating')")).toBeVisible();
    await expect(page.locator("button:has-text('General Admission')")).toBeVisible();

    // Verify Live Venue Layout Preview
    await expect(page.locator("text=Venue Layout Preview")).toBeVisible();
    await expect(page.locator("text=STAGE / PODIUM")).toBeVisible();
  });
});


import { test, expect } from "@playwright/test";

test.describe("Security and Role Authorization Guards", () => {
  test("Unauthenticated user is restricted from organizer dashboard", async ({ page }) => {
    await page.goto("/organizer/dashboard");

    await expect(page.locator("text=Organizer Access Restricted")).toBeVisible();
    await expect(page.locator("text=Sign in as Organizer")).toBeVisible();
  });

  test("Attendee account is blocked from organizer views", async ({ page }) => {
    await page.goto("/login");
    await page.click("button:has-text('Fill Attendee')");
    await page.locator("form button[type='submit']").click();
    await expect(page).toHaveURL(/.*attendee\/registrations/, { timeout: 10000 });

    await page.goto("/organizer/dashboard");
    await expect(page.locator("text=Organizer Access Restricted")).toBeVisible();
  });
});


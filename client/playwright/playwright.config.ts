import { defineConfig, devices } from "@playwright/test";
import path from "path";

const baseURL = process.env.PLAYWRIGHT_TEST_BASE_URL || "http://localhost:3000";
const serverCwd = path.resolve(__dirname, "../../server");
const clientCwd = path.resolve(__dirname, "..");

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  timeout: 30000,
  reporter: process.env.CI
    ? [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]]
    : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: [
    {
      command: "node src/server.js",
      cwd: serverCwd,
      url: "http://localhost:5000/api/v1/health",
      reuseExistingServer: !process.env.CI,
      timeout: 60000,
      env: {
        ...process.env,
        PORT: "5000",
        NODE_ENV: "test",
        MONGODB_URI: process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/eventora",
        ALLOWED_ORIGINS: "http://localhost:3000,http://127.0.0.1:3000",
        SESSION_SECRET: process.env.SESSION_SECRET || "ci-test-session-secret-key-min-32-chars!",
        AUTO_VERIFY_TEST_ACCOUNTS: "true",
      },
    },
    {
      command: "npm run start",
      cwd: clientCwd,
      url: "http://localhost:3000",
      reuseExistingServer: !process.env.CI,
      timeout: 60000,
      env: {
        ...process.env,
        PORT: "3000",
        NEXT_PUBLIC_API_URL: "http://localhost:5000/api/v1",
        INTERNAL_API_URL: "http://localhost:5000/api/v1",
        NEXT_PUBLIC_SITE_URL: baseURL,
      },
    },
  ],
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        baseURL,
      },
    },
  ],
});

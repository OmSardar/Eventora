import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  timeout: 30000,
  reporter: "list",
  use: {
    baseURL: process.env.PLAYWRIGHT_TEST_BASE_URL || "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  webServer: [
    {
      command: "node src/server.js",
      cwd: "../server",
      url: "http://localhost:5000/api/v1/health",
      reuseExistingServer: true,
      timeout: 15000,
      env: {
        PORT: "5000",
        NODE_ENV: "test",
        MONGODB_URI: "mongodb://127.0.0.1:27017/eventora",
        ALLOWED_ORIGINS: "http://localhost:3000,http://127.0.0.1:3000",
      },
    },
    {
      command: "npm run start -- -p 3000",
      url: "http://localhost:3000",
      reuseExistingServer: true,
      timeout: 20000,
      env: {
        NEXT_PUBLIC_API_URL: "http://localhost:5000/api/v1",
      },
    },
  ],
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});

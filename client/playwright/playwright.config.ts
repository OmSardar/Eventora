import { defineConfig, devices } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const baseURL = process.env.PLAYWRIGHT_TEST_BASE_URL || "http://localhost:3000";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  timeout: 30000,
  reporter: "list",
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  webServer: [
    {
      command: "node src/server.js",
      cwd: path.resolve(__dirname, "../../server"),
      url: "http://localhost:5000/api/v1/health",
      reuseExistingServer: true,
      timeout: 20000,
      env: {
        ...process.env,
        PORT: "5000",
        NODE_ENV: "test",
        MONGODB_URI: "mongodb://127.0.0.1:27017/eventora",
        ALLOWED_ORIGINS: "http://localhost:3000,http://127.0.0.1:3000",
      },
    },
    {
      command: "npm run start",
      cwd: path.resolve(__dirname, ".."),
      url: "http://localhost:3000",
      reuseExistingServer: true,
      timeout: 25000,
      env: {
        ...process.env,
        NEXT_PUBLIC_API_URL: "http://localhost:5000/api/v1",
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

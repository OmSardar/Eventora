# Playwright Root Documentation (`client/playwright`)

## A. Directory Overview
The `client/playwright` directory configures and executes the automated end-to-end browser testing infrastructure for Eventora. It defines web server lifecycle hooks, browser projects, viewport sizes, network timeouts, and test discovery paths.

## B. Directory Structure
```text
client/playwright/
├── playwright.md        # This documentation file
├── playwright.config.ts # Global Playwright configuration file
└── tests/               # Playwright test specs (auth, authorization, events, seo)
    └── tests.md
```

## C. File-by-File Documentation

### 1. `playwright.config.ts`
- **File Type:** TypeScript Configuration File (`.ts`)
- **Primary Responsibility:** Configures Playwright test runner.
- **Key Settings:**
  - `testDir: './tests'`: Spec discovery directory.
  - `baseURL: 'http://localhost:3000'`: Target application URL.
  - `workers: 1`, `fullyParallel: false`: Sequential execution for reliable session isolation.
  - `timeout: 30000`: 30-second per-test ceiling.
  - `webServer`: Dual background processes launching the Express backend (port 5000, `NODE_ENV=test`) and Next.js client (port 3000), using `reuseExistingServer: true`.
  - `projects`: Configured for Desktop Chromium.

## D. Child Directory Documentation

1. **[`tests/`](tests/tests.md)**
   - 17 automated E2E browser tests across authentication, authorization, events, Free RSVP, and SEO.
   - [Documentation](tests/tests.md)

## E. Execution Command
```bash
npm run test:e2e --prefix client
```

## F. Related Documentation
- [Client Root Documentation (`client/client_root.md`)](../client_root.md)
- [Root Project README (`README.md`)](../../README.md)


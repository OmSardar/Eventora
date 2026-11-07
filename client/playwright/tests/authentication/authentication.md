# Playwright Authentication Tests Documentation (`client/playwright/tests/authentication`)

## A. Directory Overview
This directory contains end-to-end browser tests verifying user authentication journeys, demo account autofill buttons, and session cookie exchanges.

## B. Directory Structure
```text
client/playwright/tests/authentication/
├── authentication.md    # This documentation file
└── auth.spec.ts         # Authentication user journey tests
```

## C. File-by-File Documentation

### 1. `auth.spec.ts`
- **File Type:** Playwright Test Spec (`.spec.ts`)
- **Primary Responsibility:** Verifies login flows with demo credentials.
- **Test Scenarios (2 tests):**
  1. Organizer can log in with demo credentials (`organizer@eventora.demo`) and view the organizer dashboard.
  2. Attendee can log in with demo credentials (`attendee@eventora.demo`) and view their tickets.
- **Dependencies:** `@playwright/test`.

## D. Child Directory Documentation
No child subdirectories exist in this directory.

## E. Execution Command
```bash
npx playwright test playwright/tests/authentication
```

## F. Related Documentation
- [Playwright Tests Root (`client/playwright/tests/tests.md`)](../tests.md)
- [Client Root Documentation (`client/client_root.md`)](../../../client_root.md)


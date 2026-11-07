# Playwright Authorization Tests Documentation (`client/playwright/tests/authorization`)

## A. Directory Overview
This directory contains end-to-end security tests verifying client-side and server-side route guards and Role-Based Access Control (RBAC).

## B. Directory Structure
```text
client/playwright/tests/authorization/
├── authorization.md     # This documentation file
└── roleGuard.spec.ts    # Role authorization and route guard tests
```

## C. File-by-File Documentation

### 1. `roleGuard.spec.ts`
- **File Type:** Playwright Test Spec (`.spec.ts`)
- **Primary Responsibility:** Validates route protection policies.
- **Test Scenarios (2 tests):**
  1. Unauthenticated visitors attempting to access `/organizer/dashboard` are redirected to `/login`.
  2. Authenticated attendees attempting to access `/organizer/dashboard` or `/organizer/events` are blocked and redirected to public/attendee views.
- **Dependencies:** `@playwright/test`.

## D. Child Directory Documentation
No child subdirectories exist in this directory.

## E. Execution Command
```bash
npx playwright test playwright/tests/authorization
```

## F. Related Documentation
- [Playwright Tests Root (`client/playwright/tests/tests.md`)](../tests.md)
- [Client Root Documentation (`client/client_root.md`)](../../../client_root.md)


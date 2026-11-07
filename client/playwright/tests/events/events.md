# Playwright Events Tests Documentation (`client/playwright/tests/events`)

## A. Directory Overview
This directory contains end-to-end tests covering event discovery, category filtering, backend banner upload controls, free RSVP execution, Resend email confirmation alerts, and organizer attendee rosters.

## B. Directory Structure
```text
client/playwright/tests/events/
├── events.md            # This documentation file
├── events.spec.ts       # Landing page, browse filters, and organizer upload controls
└── rsvpFlow.spec.ts     # Free RSVP flow, in-app notifications, and roster verification
```

## C. File-by-File Documentation

### 1. `events.spec.ts`
- **File Type:** Playwright Test Spec (`.spec.ts`)
- **Primary Responsibility:** Validates event browsing and authoring UI.
- **Test Scenarios (3 tests):**
  1. Landing page displays value proposition and featured event cards.
  2. Browse events page allows category filtering (Tech, Design, All).
  3. Organizer can access `/organizer/events/create` and view backend-only image upload controls (Upload Image tab, drag-and-drop target, Use Image URL tab).

### 2. `rsvpFlow.spec.ts`
- **File Type:** Playwright Test Spec (`.spec.ts`)
- **Primary Responsibility:** Validates complete Free RSVP user journey.
- **Test Scenarios (4 tests):**
  1. Events page displays RSVP badges and seat availability.
  2. Notification bell displays in-app notifications for authenticated attendee.
  3. Attendee completes Free RSVP and sees Resend email confirmation alert.
  4. Organizer dashboard displays events and attendee roster without payment columns.

## D. Child Directory Documentation
No child subdirectories exist in this directory.

## E. Execution Command
```bash
npx playwright test playwright/tests/events
```

## F. Related Documentation
- [Playwright Tests Root (`client/playwright/tests/tests.md`)](../tests.md)
- [Client Root Documentation (`client/client_root.md`)](../../../client_root.md)


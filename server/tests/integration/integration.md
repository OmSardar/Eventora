# Server Integration Tests Documentation (`server/tests/integration`)

## A. Directory Overview
The `server/tests/integration` directory contains end-to-end integration test suites executing against a live MongoDB database. These tests verify critical transactional operations, race-condition immunity, capacity floor enforcement, in-app notifications, and Resend email confirmation deduplication.

## B. Directory Structure
```text
server/tests/integration/
├── integration.md                         # This documentation file
├── concurrencyAndBusinessRules.test.js    # Flash crowd race conditions and capacity floor
├── eventsAndRegistrations.test.js         # Event lifecycle, bookings, and cancellation workflow
├── notifications.test.js                  # In-app notification creation and read state
└── registrationEmail.test.js              # Post-commit email dispatch, idempotency & resilience
```

## C. File-by-File Documentation

### 1. `concurrencyAndBusinessRules.test.js`
- **File Type:** Node.js Native Test (`node:test`, `supertest`)
- **Primary Responsibility:** Verifies atomic concurrency guarantees and capacity floors.
- **Test Scenarios:**
  - **Flash Crowd Race Condition:** Fires concurrent RSVP requests competing for a single remaining seat; verifies exactly 1 succeeds and all others receive `400 Bad Request (Sold Out)`.
  - **Double-Booking Immunity:** Asserts an attendee cannot register more than once for an event.
  - **Capacity Floor Protection:** Asserts organizers cannot reduce an event's seat limit below current booked count.
  - **Past Event Rejection:** Rejects bookings on past-dated events.

### 2. `eventsAndRegistrations.test.js`
- **File Type:** Node.js Native Test (`node:test`, `supertest`)
- **Primary Responsibility:** Full event and booking lifecycle verification.
- **Test Scenarios:**
  - Event creation, listing, updating, and details retrieval.
  - Attendee booking confirmation and digital ticket generation.
  - Attendee cancellation request submission.
  - Organizer approval of cancellation request and automatic seat return.
  - Organizer rejection of cancellation request.

### 3. `notifications.test.js`
- **File Type:** Node.js Native Test (`node:test`, `supertest`)
- **Primary Responsibility:** In-app notification feed verification.
- **Test Scenarios:**
  - Generating notification upon event booking and event cancellation.
  - Querying unread notifications for authenticated user.
  - Marking individual and all notifications as read.

### 4. `registrationEmail.test.js`
- **File Type:** Node.js Native Test (`node:test`)
- **Primary Responsibility:** Resend email confirmation resilience and deduplication.
- **Test Scenarios:**
  - Dispatches email after successful seat booking.
  - **Atomic Deduplication:** Verifies `confirmationEmailSent: true` flag prevents duplicate emails on retry.
  - **Provider Error Isolation:** Simulates Resend API 500 error; verifies registration remains confirmed and database is not rolled back.

## D. Child Directory Documentation
No child subdirectories exist in this directory.

## E. Execution Flow
Run via:
```bash
npm run test:integration --prefix server
```

## F. Related Documentation
- [Tests Parent Directory (`server/tests/tests.md`)](../tests.md)
- [Server Root Documentation (`server/server_root.md`)](../../server_root.md)


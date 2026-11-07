# Automated Testing Strategy — Eventora

## 1. Testing Pyramid

Eventora employs a comprehensive test pyramid comprising unit, integration, security, and end-to-end tests:

```text
       ▲
      / \     Playwright E2E Tests (Full User Journeys, Both Roles)
     /   \    -----------------------------------------------------
    /     \   Integration Tests (Atomic Booking, Past Event, Capacity)
   /       \  -------------------------------------------------------
  /         \ Security Tests (Ownership Bypass, CSRF, Origin, Role Guards)
 /           \-----------------------------------------------------------
/             \ Unit Tests (Argon2id Hashing, Zod Validation Schemas, Models)
```

## 2. Test Execution Commands

```bash
# Run all backend tests (Unit, Integration, Security)
npm test --prefix server

# Run individual suites
npm run test:unit --prefix server
npm run test:integration --prefix server
npm run test:security --prefix server

# Run Playwright E2E tests
npm run test:e2e --prefix client
```

## 3. Verified Scenarios
- **Unit Tests (11 tests):**
  - Argon2id hashing & salt generation
  - Valid hash verification
  - Rejection of invalid passwords
  - Safe null/empty handling
  - Zod registration password complexity & email constraints
  - Zod role restrictions (ORGANIZER vs ATTENDEE)
  - Zod event future date & seat limit constraints
- **Integration Tests (11 tests):**
  - Organizer creates event
  - Past date event creation rejection
  - Attendee booking & atomic seat decrement
  - Duplicate booking rejection via compound index
  - Capacity floor enforcement (`seatLimit >= seatsBooked`)
  - Organizer attendee roster retrieval
  - Attendee ticket retrieval
  - Concurrent race condition: 3 simultaneous requests competing for 1 seat (zero overbooking)
  - Sold out / full event rejection
  - Cancelled event registration rejection
  - Past event registration rejection
- **Security Tests (24 tests):**
  - Unauthenticated access rejection (401)
  - Role guard violation rejection (403)
  - Cross-organizer resource tampering isolation (403)
  - CSRF missing token rejection (403)
  - CSRF invalid token rejection (403)
  - Origin / Referer validation rejection (403)
  - Attendee privacy isolation: attendee cannot access attendee roster
  - Attendee privacy isolation: attendee cannot view other attendees' tickets
  - Cancellation tampering prevention: attendee cannot cancel another's ticket
  - Idle session expiry (30-minute inactivity timeout enforcement)
  - Absolute session expiry (24-hour max session lifetime enforcement)
  - Rate limiting: requests below configured threshold succeed
  - Rate limiting: excess requests return HTTP 429 with Retry-After header
  - Rate limiting: distinct client IPs/users receive isolated rate-limit buckets
  - Rate limiting: shared MongoDB collection (`rate_limits`) stores state with TTL
  - Rate limiting: sensitive endpoints cannot be bypassed via rapid replay
  - Cloudinary: unauthenticated user cannot request upload signature (401)
  - Cloudinary: attendee role forbidden from requesting upload signature (403)
  - Cloudinary: authenticated organizer receives signed parameters without API secret leakage
  - Cloudinary: event creation with verified Cloudinary asset metadata persists both image and bannerUrl
  - Cloudinary: event creation with legacy bannerUrl automatically normalizes image object
  - Cloudinary: malicious image URL schemes (`javascript:`) rejected by Zod validation (400)
- **Playwright End-to-End Tests (6 tests):**
  - Organizer login with 1-click demo credentials and redirect to dashboard
  - Attendee login with 1-click demo credentials and redirect to booked tickets
  - Unauthenticated route guard blocking access to organizer views
  - Attendee role guard blocking access to organizer views
  - Landing page marketing presentation, GSAP animations, and featured events
  - Live category filtering and event search on the discovery catalog


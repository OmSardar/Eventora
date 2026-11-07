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
- **Unit (11 tests):** Argon2id hashing, valid hash verification, rejection of invalid password, null safety, Zod authentication schema constraints, event schema future date constraints, seat limit boundaries.
- **Integration (7 tests):** Organizer creates event, rejection of past dates, attendee booking, rejection of duplicate attendee booking, rejection of seat limit reduction below bookings, organizer attendee roster view, attendee ticket retrieval.
- **Security (8 tests):** Unauthenticated rejection, attendee role rejection on event creation, organizer role rejection on attendee booking, ownership isolation between different organizers, CSRF missing token rejection, CSRF invalid token rejection, untrusted origin rejection.

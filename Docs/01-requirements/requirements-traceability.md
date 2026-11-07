# Requirements Traceability Matrix (RTM) — Eventora

| Requirement ID | Specification Description | Backend Component | Frontend Component | Test Verification |
|---|---|---|---|---|
| **AUTH-01** | Attendee & Organizer Registration | `authService.register` | `/register/page.tsx` | `tests/unit/validation.test.js`, `tests/integration/eventsAndRegistrations.test.js` |
| **AUTH-02** | Role Immutability | `User.js` (`immutable: true`) | Read-only badges | `tests/security/accessControlAndSecurity.test.js` |
| **AUTH-03** | Argon2id Password Hashing | `password.js` | `registerSchema` | `tests/unit/password.test.js` |
| **AUTH-04** | MongoStore Session Persistence | `sessionConfig.js` | `providers.tsx` (credentials) | `tests/integration/eventsAndRegistrations.test.js` |
| **AUTH-05** | Session Fixation Defense | `authController.login` | Session cookie rotation | `tests/integration/eventsAndRegistrations.test.js` |
| **AUTH-06** | Idle & Absolute Expiry | `sessionExpiryMiddleware.js` | Auto redirect on 401 | `tests/security/accessControlAndSecurity.test.js` |
| **EVT-01** | Event Creation | `eventService.createEvent` | `/organizer/events/create/page.tsx` | `tests/integration/eventsAndRegistrations.test.js` |
| **EVT-02** | Reject Past Dates | `eventValidation.js`, service | Zod min current date | `tests/unit/validation.test.js`, `tests/integration/eventsAndRegistrations.test.js` |
| **EVT-03** | Strict Ownership Check | `eventService.updateEvent` | Protected route guard | `tests/security/accessControlAndSecurity.test.js` |
| **EVT-04** | Capacity Reduction Floor | `eventService.updateEvent` | Min validator in edit | `tests/integration/eventsAndRegistrations.test.js` |
| **EVT-05** | Event Cancellation | `eventService.cancelEvent` | Cancel button & modal | `tests/security/accessControlAndSecurity.test.js` |
| **EVT-06** | Organizer Attendee Roster | `registrationService.getEventAttendees` | `/events/[eventId]/attendees/page.tsx` | `tests/integration/eventsAndRegistrations.test.js` |
| **RSVP-01** | Atomic Seat Allocation | `registrationService.registerForEvent` | RSVP button | `tests/integration/eventsAndRegistrations.test.js` |
| **RSVP-02** | Sold-out Protection | `Event.findOneAndUpdate ($lt)` | "Sold Out" UI State | `tests/integration/eventsAndRegistrations.test.js` |
| **RSVP-03** | Unique Registration Guarantee | Compound Unique Index | Error banner & Ticket link | `tests/integration/eventsAndRegistrations.test.js` |
| **SEC-01** | Synchronizer CSRF Token | `securityMiddleware.js` | `api.ts` auto-header | `tests/security/accessControlAndSecurity.test.js` |
| **SEC-02** | Origin / Referer Enforce | `originCheckMiddleware` | Browser default header | `tests/security/accessControlAndSecurity.test.js` |
| **SEC-03** | Distributed Rate Limiting | `MongoRateLimitStore.js` | HTTP 429 handler | `tests/security/accessControlAndSecurity.test.js` |
| **SEC-04** | Redacted Structured Logging | `logger.js` (Pino) | - | Verified log outputs |

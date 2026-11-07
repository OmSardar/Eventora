# STRIDE Threat Model & Security Architecture — Eventora

## 1. STRIDE Threat Analysis

| STRIDE Category | Threat Description | Architectural Mitigation | Implementation Verification |
|---|---|---|---|
| **Spoofing** | Attacker impersonates an attendee or organizer by forging user IDs in requests. | All actor identification is derived strictly from server-side verified sessions (`req.session.user.id`). Client input is never trusted for identity. | `tests/security/accessControlAndSecurity.test.js` |
| **Tampering** | Attacker modifies event details belonging to another organizer. | Strict ownership validation in `eventService.updateEvent` checks `event.organizerId === req.user.id`. | Verified with HTTP 403 test |
| **Repudiation** | An organizer denies canceling an event or attendee denies booking. | Persistent immutable `audit_logs` collection records actor, action, timestamp, IP, and outcome. | `AuditLog.js` recording |
| **Information Disclosure** | Leakage of password hashes, session IDs, or private attendee rosters. | `passwordHash` marked `select: false` on Mongoose schema. Pino logger automatically redacts sensitive headers and bodies. Attendee rosters restricted to event owner. | `logger.js` redaction & unit tests |
| **Denial of Service** | Flooding registration endpoint to exhaust event capacity or database connections. | Distributed MongoDB rate limiter restricts booking attempts per IP. JSON payloads restricted to 50KB. | `rateLimiter.js` & connection pool limits |
| **Elevation of Privilege** | Attendee attempts to call organizer event creation endpoint. | `requireRole(ROLES.ORGANIZER)` middleware rejects unauthorized roles with HTTP 403. Roles are immutable on User schema. | Verified with HTTP 403 test |

---

## 2. Cryptographic Controls
- **Password Storage:** Argon2id with OWASP parameters (19 MiB memory, 2 iterations, 1 parallelism thread).
- **CSRF Defense:** Synchronizer token pattern storing cryptographically secure random bytes (`crypto.randomBytes(32)`) in the server session, validated via timing-safe comparison (`crypto.timingSafeEqual`).
- **Session ID:** Cryptographically random, signed, delivered via HttpOnly, SameSite cookies.


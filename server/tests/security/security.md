# Server Security Tests Documentation (`server/tests/security`)

## A. Directory Overview
The `server/tests/security` directory contains penetration and security hardening test suites. These tests aggressively verify defense-in-depth mechanisms, including CSRF protection, Origin inspection, Role-Based Access Control, session expiration, privacy isolation, distributed rate limiting, and the backend-only Cloudinary upload boundary.

## B. Directory Structure
```text
server/tests/security/
├── security.md                         # This documentation file
├── accessControlAndSecurity.test.js    # CSRF tokens, Origin checks, Role authorization
├── cloudinaryAndUploads.test.js        # Magic bytes inspection, SVG/exe rejection, asset cleanup
├── rateLimiting.test.js                # Distributed MongoDB rate limit throttling
└── sessionExpiryAndPrivacy.test.js     # Idle and absolute session timeouts, attendee roster privacy
```

## C. File-by-File Documentation

### 1. `accessControlAndSecurity.test.js`
- **File Type:** Node.js Native Test (`node:test`, `supertest`)
- **Primary Responsibility:** Validates HTTP hardening and RBAC boundaries.
- **Coverage:**
  - Enforces `X-CSRF-Token` on state-changing requests (`POST`, `PATCH`, `DELETE`).
  - Verifies Origin/Referer headers match `ALLOWED_ORIGINS`.
  - Blocks unauthenticated users from organizer and attendee endpoints (401 Unauthorized).
  - Blocks attendees from organizer routes and vice versa (403 Forbidden).
  - Verifies role immutability upon registration.

### 2. `cloudinaryAndUploads.test.js`
- **File Type:** Node.js Native Test (`node:test`, `supertest`)
- **Primary Responsibility:** Validates backend image upload security controls (15 scenarios).
- **Coverage:**
  - Allows valid JPEG, PNG, and WebP banner uploads to owned events.
  - Allows pre-creation banner uploads for draft events.
  - Blocks unauthenticated users (401) and non-organizers (403).
  - Blocks uploads to non-existent events (404) or events owned by another organizer (403).
  - Rejects missing files and payloads exceeding 5MB (400).
  - Cryptographically inspects binary magic bytes: rejects SVGs disguised as JPEG, executables (`MZ`/ELF) disguised as PNG, and spoofed MIME types.
  - Verifies old Cloudinary asset destruction upon banner replacement.
  - Verifies newly uploaded Cloudinary asset cleanup if database save fails.

### 3. `rateLimiting.test.js`
- **File Type:** Node.js Native Test (`node:test`, `supertest`)
- **Primary Responsibility:** Throttling verification across auth and registration endpoints.
- **Coverage:**
  - Verifies HTTP 429 Too Many Requests response after exceeding rate limit quota.
  - Confirms presence of RFC `Retry-After` header.
  - Verifies distributed key isolation in MongoDB `rate_limits` collection.

### 4. `sessionExpiryAndPrivacy.test.js`
- **File Type:** Node.js Native Test (`node:test`, `supertest`)
- **Primary Responsibility:** Session timeouts and cross-user data isolation.
- **Coverage:**
  - Destroys sessions exceeding 30-minute idle inactivity timeout.
  - Destroys sessions exceeding 24-hour absolute session duration.
  - Verifies attendees can only view their own tickets.
  - Verifies organizers cannot view attendee rosters for events they do not own.

## D. Child Directory Documentation
No child subdirectories exist in this directory.

## E. Execution Flow
Run via:
```bash
npm run test:security --prefix server
```

## F. Related Documentation
- [Tests Parent Directory (`server/tests/tests.md`)](../tests.md)
- [Server Root Documentation (`server/server_root.md`)](../../server_root.md)


# Server Tests Root Documentation (`server/tests`)

## A. Directory Overview
The `server/tests` directory contains the automated test suites for the Eventora backend. Engineered using the native Node.js 22 test runner (`node:test`) and Supertest for HTTP assertions, the test pyramid spans unit tests, integration tests against MongoDB, and security verification suites.

## B. Directory Structure
```text
server/tests/
├── tests.md             # This documentation file
├── unit/                # Pure isolated unit tests (hashing, validation, email templates)
│   ├── unit.md
│   ├── emailService.test.js
│   ├── password.test.js
│   └── validation.test.js
├── integration/         # Database-backed integration tests (concurrency, RSVP, notifications)
│   ├── integration.md
│   ├── concurrencyAndBusinessRules.test.js
│   ├── eventsAndRegistrations.test.js
│   ├── notifications.test.js
│   └── registrationEmail.test.js
└── security/            # Security penetration tests (CSRF, RBAC, magic bytes, rate limiting)
    ├── security.md
    ├── accessControlAndSecurity.test.js
    ├── cloudinaryAndUploads.test.js
    ├── rateLimiting.test.js
    └── sessionExpiryAndPrivacy.test.js
```

## C. Test Pyramid & Metrics

| Test Layer | Directory | Test Files | Total Tests | Execution Environment |
|---|---|---|---|---|
| **Unit** | [`unit/`](unit/unit.md) | 3 | 11 | In-memory, zero IO |
| **Integration** | [`integration/`](integration/integration.md) | 4 | 13 | Live MongoDB test database |
| **Security** | [`security/`](security/security.md) | 4 | 44 | Live MongoDB & HTTP Supertest pipeline |
| **Total Server Tests** | | **11** | **68** | **100% Passing** |

## D. Child Directory Documentation

1. **[`unit/`](unit/unit.md)**
   - Argon2id password hashing, Zod schema validation, Resend email HTML/plain-text rendering.
   - [Documentation](unit/unit.md)

2. **[`integration/`](integration/integration.md)**
   - Flash crowd atomic booking, past-dated event rejection, capacity floor protection, Resend email deduplication & error resilience.
   - [Documentation](integration/integration.md)

3. **[`security/`](security/security.md)**
   - CSRF synchronizer tokens, Origin checks, Role authorization guards, idle/absolute session expiry, rate limiting, and backend-only Cloudinary upload validation (magic bytes, SVG/executable rejection, asset replacement & cleanup).
   - [Documentation](security/security.md)

## E. Execution Commands
```bash
# Run all server test suites (68 tests)
npm test --prefix server

# Run individual suites
npm run test:unit --prefix server
npm run test:integration --prefix server
npm run test:security --prefix server
```

## F. Related Documentation
- [Server Root Documentation (`server/server_root.md`)](../server_root.md)
- [Root Project README (`README.md`)](../../README.md)


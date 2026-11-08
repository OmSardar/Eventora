# Eventora Backend REST API (`server/`)

Production-ready, highly secure REST API powering **Eventora** — built with **Node.js 22 LTS**, **Express.js 4**, and **MongoDB Atlas** (via **Mongoose 8**).

---

## 1. Architecture & Design Principles

The backend is built as a **Modular Monolith** adhering to **Vertical Slice Architecture**. Each business capability encapsulates its routes, controllers, services, models, and domain logic within an independent module:

```text
server/
├── src/
│   ├── infrastructure/        # Cross-cutting platform adapters
│   │   ├── cloudinary/        # Backend-only Cloudinary media streaming SDK
│   │   ├── database/          # Mongoose connection & replica set topology checks
│   │   ├── email/             # Resend API transactional email service
│   │   ├── logging/           # Pino structured logger with PII masking
│   │   ├── security/          # Argon2id hashing, AES-256-GCM, GeoIP & device parser
│   │   └── session/           # Express-session & MongoStore TTL persistence
│   ├── modules/               # Vertical feature slices
│   │   ├── audit/             # Immutable compliance audit logging
│   │   ├── authentication/    # Auth, session rotation, TOTP & email MFA
│   │   ├── bookings/          # Multi-seat reservations, cryptographic tickets
│   │   ├── events/            # Event lifecycle, capacity floors, cancellations
│   │   ├── notifications/     # In-app notification alerts and feed
│   │   ├── payments/          # Razorpay orders, HMAC webhooks, refund worker
│   │   ├── registrations/     # Free RSVP, attendee registrations, calendar .ics
│   │   ├── seating/           # Assigned seating, seat layouts, hold expiration worker
│   │   └── users/             # User profiles and organizer roster lookups
│   ├── scripts/               # Database seeder (`seed.js`)
│   ├── shared/                # Kernel: constants, error hierarchy, middleware, Zod schemas, utils
│   │   ├── constants/         # Status enums (Event, Booking, Seat, Payment, Refund)
│   │   ├── errors/            # RFC-compliant AppError classes (BadRequest, NotFound, etc.)
│   │   ├── middleware/        # Auth, CSRF, CORS, RateLimit, ErrorHandler, Upload
│   │   ├── utils/             # RFC 5545 icsGenerator, sanitizers
│   │   └── validation/        # Zod request validators
│   ├── app.js                 # Express application pipeline configuration
│   └── server.js              # HTTP server bootstrap, background workers & graceful shutdown
├── tests/                     # 212 automated tests across unit, integration, and security suites
│   ├── integration/           # Multi-agent HTTP integration tests (104 tests)
│   ├── security/              # Session expiry, CSRF, rate limit & RBAC tests (34 tests)
│   └── unit/                  # Crypto, RFC 5545, worker & email unit tests (74 tests)
├── .env.example               # Environment template with safe placeholders
└── package.json               # ESM module manifest and npm scripts
```

---

## 2. Models & Database Relationships

Eventora uses **MongoDB Atlas** clustered replica sets with strict schema-level data invariants:

| Model | Collection | Primary Responsibility & Key Invariants |
|---|---|---|
| `User` | `users` | Accounts, Argon2id password hashes, roles (`ATTENDEE`, `ORGANIZER`), MFA secrets (AES-256-GCM encrypted), email verification tokens. |
| `Event` | `events` | Event title, description, UTC `eventDate`, venue, `seatLimit`, `seatsBooked`, `status` (`PUBLISHED`, `CANCELLED`, `DRAFT`), seating type (`GENERAL_ADMISSION`, `ASSIGNED_SEATING`), layout config. |
| `Registration` | `registrations` | Attendee RSVP records. Compound unique index `{ eventId: 1, attendeeId: 1 }` prevents double-bookings. Tracks `status` (`CONFIRMED`, `CANCELLATION_REQUESTED`, `CANCELLED`). |
| `Booking` | `bookings` | Multi-seat order records linking `eventId`, `attendeeId`, `seatIds`, `ticketToken`, `bookingReference`, and payment details. |
| `EventSeat` | `eventseats` | Physical seat inventory for assigned seating events. Compound unique index `{ eventId: 1, seatLabel: 1 }`. Status: `AVAILABLE`, `HELD`, `BOOKED`, `BLOCKED`. |
| `SeatHold` | `seatholds` | 10-minute temporary seat hold records (`status: ACTIVE`, `RELEASED`, `EXPIRED`, `CONVERTED`). |
| `SeatReservation` | `seatreservations`| 10-minute hold records for General Admission paid events during Razorpay checkout. |
| `Payment` | `payments` | Razorpay payment records tracking `orderId`, `paymentId`, `amount`, `status` (`CREATED`, `CAPTURED`, `REFUND_PENDING`, `REFUNDED`), and `refundStatus`. |
| `RefundOperation` | `refundoperations`| Durable, idempotent refund records (`refundOpId`, `paymentId`, `retryCount`, `status: INITIATED, PENDING, PROCESSED, FAILED, MANUAL_RECONCILIATION_REQUIRED`). |
| `Notification` | `notifications` | In-app alerts for attendees (`EVENT_CANCELLED`, `BOOKING_CONFIRMED`, `CANCELLATION_APPROVED`, etc.). |
| `AuditLog` | `auditlogs` | Append-only security audit trail recording actors, actions, timestamps, and IP addresses. |
| `WebhookEvent` | `webhookevents` | Razorpay webhook idempotency deduplication store. |

---

## 3. API Routes & Versioning

All API endpoints are versioned under `/api/v1`:

### Public & Health
- `GET /api/v1/health` — System status, database connection, and environment mode.
- `GET /api/v1/auth/csrf` — Issues synchronizer CSRF tokens.

### Authentication (`/api/v1/auth`)
- `POST /register` — Account registration with Argon2id hashing and verification email dispatch.
- `POST /login` — Authenticates user, regenerates session ID, tracks GeoIP/device, sends login alerts.
- `POST /logout` — Destroys server-side session and clears session cookie.
- `GET /me` — Returns current authenticated user and session metadata.
- `POST /forgot-password` — Issues single-use password reset token.
- `POST /reset-password` — Verifies token and updates password.
- `POST /change-password` — Authenticated password change requiring current password verification.
- `POST /verify-email/request` & `POST /verify-email/confirm` — Email verification lifecycle.
- `POST /mfa/totp/setup` & `POST /mfa/totp/verify` — RFC 6238 Authenticator app setup and activation.
- `POST /mfa/totp/disable` — Disables TOTP using password authentication.
- `POST /mfa/email/send-otp` & `POST /mfa/email/verify-otp` — Email-based one-time password flow.
- `POST /mfa/recovery/use` — Single-use recovery code authentication.

### Events (`/api/v1/events`)
- `GET /` — Catalog discovery with keyword search, category filters, and pagination.
- `GET /:eventId` — Detailed event metadata and real-time remaining seat inventory.
- `POST /` — Organizer event creation with capacity floor validation.
- `PATCH /:eventId` — Organizer event editing (cannot reduce seat limit below currently booked count).
- `POST /:eventId/cancel` — **Atomic event cancellation** cascading to registrations, bookings, seat holds, refunds, in-app notifications, and Resend emails.
- `GET /organizer/my-events` — Organizer dashboard event roster.
- `GET /:eventId/attendees` — Organizer private attendee roster.
- `POST /banner` & `POST /:eventId/banner` — Backend-only Cloudinary image upload with magic-bytes validation.

### Registrations & Calendar (`/api/v1/registrations` & `/api/v1/events/:eventId/registrations`)
- `POST /events/:eventId/registrations` — Free RSVP with hardware document locking preventing overselling.
- `GET /registrations/me` — Attendee's registrations with populated booking and seat metadata.
- `GET /registrations/:registrationId/calendar` (alias `.ics`) — **RFC 5545 .ics calendar pass download** (strictly verifies attendee ownership and blocks cancelled events).
- `POST /registrations/:registrationId/cancellation-request` — Attendee two-phase cancellation request.
- `GET /organizer/cancellation-requests` — Organizer pending cancellation queue.
- `POST /cancellation-requests/:requestId/approve` — Organizer cancellation approval (releases seats).
- `POST /cancellation-requests/:requestId/reject` — Organizer cancellation rejection.

### Seating & Interactive Reservation (`/api/v1/seating`)
- `GET /events/:eventId/layout` — Layout sections, rows, and physical seat inventory.
- `POST /events/:eventId/holds` — Creates 10-minute temporary seat hold across multiple seats.
- `DELETE /holds/:holdId` — Manually releases an active seat hold.
- `POST /holds/:holdId/book` — Finalizes free multi-seat booking from an active hold.
- `POST /tickets/validate` — Organizer gate scan QR verification (`verifyAndRedeemTicket`).

### Payments & Razorpay (`/api/v1/payments`)
- `POST /create-order` — Creates Razorpay order with 10-minute `SeatReservation` hold.
- `POST /verify` — Browser checkout verification via timing-safe HMAC-SHA256 signature check.
- `POST /webhook` — Authoritative server-to-server webhook ingestion (`payment.captured`, `refund.processed`, `refund.failed`).

### Notifications (`/api/v1/notifications`)
- `GET /` — Authenticated user's in-app notification feed.
- `GET /unread-count` — Real-time badge counter.
- `PATCH /:id/read` — Marks single notification as read.
- `PATCH /mark-all-read` — Batch marks all unread notifications.

---

## 4. Background Workers & Graceful Shutdown

The backend runs two resilient background workers with automated lifecycle management:

1. **Seat Hold Expiration Worker (`holdExpirationWorker.js`):**
   - Runs every 30 seconds.
   - Reclaims expired `SeatHold` records (`heldUntil < now`), releasing held seats back to `AVAILABLE`.
   - Safely skips seats blocked due to event cancellation.

2. **Refund Reconciliation Worker (`refundReconciliationWorker.js`):**
   - Runs every 60 seconds.
   - Polls eligible `RefundOperation` records (`status: INITIATED, PENDING, FAILED` where `nextRetryAt <= now`).
   - Verifies authoritative refund status against Razorpay API.
   - Enforces exponential backoff ($2^{\text{retryCount}} \times 60\text{s}$) and transitions to `MANUAL_RECONCILIATION_REQUIRED` after max retries.
   - Non-overlapping execution mutex (`isSweepRunning`) prevents concurrent race conditions.

### Graceful Teardown
On `SIGTERM` or `SIGINT`:
- Stops both background workers (`stopHoldExpirationWorker()`, `stopRefundReconciliationWorker()`).
- Stops accepting new HTTP connections via `server.close()`.
- Disconnects gracefully from MongoDB via `mongoose.connection.close()`.

---

## 5. Security Controls

- **Argon2id Password Cryptography:** OWASP-compliant parameter configuration with minimum 10-character policy requiring uppercase, number, and special symbol.
- **Stateful MongoStore Sessions:** `httpOnly: true`, `secure: true` in production, `sameSite: none` (cross-domain) or `lax` (local), automatic 30-minute idle expiry and 24-hour absolute expiry.
- **Session Fixation Defense:** Calls `req.session.regenerate()` upon login and privilege elevation.
- **Synchronizer Token CSRF Protection:** Cryptographic CSRF tokens paired with strict Origin header validation.
- **CORS Exact-Origin Matching:** Dynamically authorizes trusted frontend domains (including Vercel preview wildcards) and blocks unauthorized cross-origin requests.
- **Distributed Rate Limiting:** Configured on MongoDB stores for authentication, event mutations, banner uploads, ticket scanning, and payment webhooks.
- **Backend-Only Cloudinary Uploads:** In-memory Multer buffer inspection with cryptographic magic-bytes verification (JPEG, PNG, WebP only; rejects malicious SVGs and HTML).
- **HMAC Ticket Verification:** QR code tickets use cryptographic HMAC-SHA256 signatures bound to registration and booking references.

---

## 6. Testing Strategy & Execution

Eventora maintains **212 automated backend tests** running on Node.js native test runner (`node:test`):

```bash
# Run all backend test suites (unit + integration + security)
npm test --prefix server

# Run unit tests only (74 tests: crypto, email, RFC 5545, seating math, refund worker)
npm run test:unit --prefix server

# Run integration tests only (104 tests: full HTTP flows, concurrency, seating, cancellations)
npm run test:integration --prefix server

# Run security tests only (34 tests: RBAC, session expiry, CSRF, rate limits)
npm run test:security --prefix server
```

---

## 7. Local Development Setup

### Prerequisites
- Node.js 22 LTS or higher
- MongoDB instance (local community server or free MongoDB Atlas replica set URI)

### Setup Steps
```bash
# 1. Install dependencies
cd server
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env with your local settings (MONGODB_URI, SESSION_SECRET, etc.)

# 3. Seed demo accounts and events (Optional)
npm run seed

# 4. Start development server with live reload
npm run dev
# Server boots at http://localhost:5000
```


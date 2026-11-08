# Eventora — Complete Repository Structure & Architectural Layout

This document provides a comprehensive mapping of the Eventora codebase, delineating file organization, architectural boundaries, cross-layer interactions, and component responsibilities across the root, client, server, and documentation directories.

---

## 1. High-Level Directory Overview

```
EVENTORA/
├── .env.example                               # Master template for all environment variables
├── .gitignore                                 # Git ignore patterns for node_modules, build artifacts, env files
├── README.md                                  # Primary project architectural guide (30 sections)
│
├── client/                                    # Frontend application (Next.js 14 App Router, TypeScript)
│   ├── .env.example                           # Frontend-specific environment variable template
│   ├── .eslintrc.json                         # ESLint rules and Next.js Core Web Vitals config
│   ├── next.config.mjs                        # Next.js bundler and runtime settings
│   ├── package.json                           # Frontend dependencies and npm lifecycle scripts
│   ├── playwright.config.ts                   # Playwright end-to-end testing configuration
│   ├── postcss.config.mjs                     # PostCSS plugins configuration (Tailwind)
│   ├── tailwind.config.ts                     # Tailwind CSS design system configuration
│   ├── tsconfig.json                          # TypeScript compiler settings (strict mode, path aliases)
│   ├── client_root.md                         # Reference architecture notes
│   ├── README.md                              # Comprehensive frontend guide
│   ├── public/                                # Static client assets (favicons, SVG icons, manifests)
│   ├── playwright/                            # End-to-end Playwright tests, fixtures, and helpers
│   └── src/                                   # Application source code
│       ├── app/                               # Next.js 14 App Router routes & layouts
│       ├── components/                        # Modular React components
│       ├── context/                           # React Context providers (Auth, Socket, Theme)
│       ├── hooks/                             # Custom React hooks
│       ├── lib/                               # Core libraries (API client, CSRF, utils)
│       └── types/                             # Centralized TypeScript interface declarations
│
├── server/                                    # Backend application (Node.js 22, Express.js, MongoDB)
│   ├── .env.example                           # Server environment variable template (zero secrets)
│   ├── jest.config.js                         # Jest test runner settings (unit, integration, security)
│   ├── package.json                           # Backend dependencies and test scripts
│   ├── server_root.md                         # Reference architecture notes
│   ├── README.md                              # Comprehensive backend guide
│   ├── scripts/                               # Maintenance and database seeding utilities
│   ├── tests/                                 # 35 test suites covering 212 automated tests
│   │   ├── unit/                              # 74 unit tests (services, utils, models)
│   │   ├── integration/                       # 104 integration tests (auth, events, tickets, seating)
│   │   └── security/                          # 34 security tests (CSRF, RBAC, tamper protection)
│   └── src/                                   # Express application source code
│       ├── server.js                          # Application entry point, server startup & shutdown
│       ├── config/                            # External service adapters & DB connection
│       ├── middleware/                        # Express middleware (auth, RBAC, CSRF, validation)
│       ├── models/                            # Mongoose database models & schemas
│       ├── modules/                           # Vertical-slice business domains
│       ├── utils/                             # Shared utility libraries (crypto, QR, ICS, formatting)
│       └── workers/                           # Autonomous background workers (seat holds, refunds)
│
└── Docs/                                      # Complete project documentation and audit evidence
    ├── README.md                              # Documentation directory index and navigational map
    ├── REPOSITORY_STRUCTURE.md                # This architectural mapping file
    ├── REPOSITORY_CLEANUP_REPORT.md           # Cleanup actions and dependency audit report
    ├── DOCUMENTATION_AUDIT_REPORT.md          # Documentation synchronization audit report
    ├── FINAL_INTEGRATION_VERIFICATION.md      # Test outputs and build verification results
    ├── Architecture.md                        # Master system architecture specification
    ├── High-Level Design (HLD).md             # High-level architecture and system components
    ├── Low-Level Design (LLD).md              # Low-level service and module design
    ├── Database Design & Schema Specification.md # Mongoose schemas and index definitions
    ├── Threat Model & Security Specification.md  # STRIDE analysis and security architecture
    ├── API_Contracts.md                       # REST API endpoint specifications
    ├── API_Testing_Checklist.md               # API testing verification checklist
    ├── Edge_Cases_and_Failure_Modes.md        # Concurrency and failure handling strategies
    ├── Logging_and_Audit_Trail_Specification.md  # Observability and audit logging specs
    ├── Performance_and_Scalability_Architecture.md # Scaling strategies and bottleneck analysis
    ├── Project_Development_Plan.md            # Milestones and project delivery plan
    ├── Design Decisions & Justifications.md   # Architectural trade-off decisions
    ├── Design System Document.md              # UI/UX design tokens and standards
    └── [Audit Artifacts]                     # Historical compliance, cancellation, and verification reports
```

---

## 2. Frontend (`client/`) Structure

The frontend is built on Next.js 14 utilizing the App Router with TypeScript strict mode and Tailwind CSS.

### 2.1 Route Map (`client/src/app`)

| Route Path | Type | Protected | Role / Purpose |
| :--- | :--- | :--- | :--- |
| `/` | Static | No | Landing page with featured events and hero section |
| `/events` | Static | No | Event catalog with search, category filtering, and pagination |
| `/events/[eventId]` | Dynamic | No | Event details, venue information, pricing tiers, and booking initiation |
| `/login` | Static | No | Attendee / Organizer credentials authentication |
| `/register` | Static | No | User onboarding with role selection (`ATTENDEE` / `ORGANIZER`) |
| `/forgot-password` | Static | No | Password reset email trigger |
| `/verify-email` | Static | No | Email verification token handler |
| `/attendee/dashboard` | Static | Yes | Attendee overview: quick stats, upcoming events |
| `/attendee/registrations` | Static | Yes | Ticket viewer, cancellation triggers, .ics calendar downloads |
| `/settings/security` | Static | Yes | Session revocation, password modification |
| `/organizer/dashboard` | Static | Yes | Organizer analytics, revenue summary, active events |
| `/organizer/events` | Static | Yes | Organizer event management console |
| `/organizer/events/create` | Static | Yes | Event creation wizard (metadata, tiers, seating toggle) |
| `/organizer/events/[eventId]/edit` | Dynamic | Yes | Event editing, pricing tier adjustment, cancellation control |
| `/organizer/events/[eventId]/seating` | Dynamic | Yes | Interactive visual seat grid editor |
| `/organizer/events/[eventId]/attendees`| Dynamic | Yes | Guest list, attendee check-in status, ticket verification |
| `/tickets/verify` | Static | Yes | Real-time QR scanner and cryptographic signature validator |
| `/robots.txt` | Static | No | Search engine indexing rules |
| `/sitemap.xml` | Static | No | Search engine XML sitemap |
| `/_not-found` | Static | No | Custom 404 page |

### 2.2 Component Hierarchy (`client/src/components`)

- `common/`: Reusable primitives (`Navbar.tsx`, `Footer.tsx`, `Pagination.tsx`, `LoadingSkeleton.tsx`, `Modal.tsx`, `Toast.tsx`).
- `events/`: Event display widgets (`EventCard.tsx`, `EventFilter.tsx`, `EventGrid.tsx`, `EventHero.tsx`).
- `seating/`: Interactive seating layout (`SeatGrid.tsx`, `SeatLegend.tsx`, `TierSelector.tsx`, `SeatReservationTimer.tsx`).
- `tickets/`: Ticket visualization and utilities (`TicketCard.tsx`, `TicketDetailsModal.tsx`, `QRViewer.tsx`, `CalendarDownloadButton.tsx`).
- `notifications/`: In-app notification center (`NotificationBell.tsx`, `NotificationDropdown.tsx`, `NotificationItem.tsx`).

### 2.3 Core Libraries (`client/src/lib`)

- `api.ts`: Central Axios instance configured with `withCredentials: true`, automated CSRF token fetching via `/csrf-token`, and unified error normalization.
- `utils.ts`: Tailwind class mergers (`clsx`, `tailwind-merge`), date formatters (`date-fns`), and currency formatters.
- `constants.ts`: System-wide constants, event categories, and status enums.

---

## 3. Backend (`server/`) Structure

The backend follows an Express.js vertical-slice modular architecture where each domain manages its own routing, controller logic, and business services.

### 3.1 Domain Modules (`server/src/modules`)

1. **`auth/` (`authRoutes.js`, `authController.js`, `authService.js`)**:
   - Manages user lifecycle, Argon2id password hashing, Express server-side sessions, and role checks.
2. **`events/` (`eventRoutes.js`, `eventController.js`, `eventService.js`)**:
   - Manages event creation, updates, lifecycle transitions (`DRAFT`, `PUBLISHED`, `CANCELLED`), searching, and cascading cancellations.
3. **`registrations/` (`registrationRoutes.js`, `registrationController.js`, `registrationService.js`)**:
   - Handles RSVPs, ticket generation, QR HMAC signing (`ticketVerificationService.js`), and RFC 5545 iCalendar generation (`calendarService.js`).
4. **`seating/` (`seatingRoutes.js`, `seatingController.js`, `seatingService.js`)**:
   - Manages seat layout persistence, real-time hold acquisition (`holdSeats`), atomic release (`releaseHold`), and hold-to-booking conversions.
5. **`payments/` (`paymentRoutes.js`, `paymentController.js`, `paymentService.js`)**:
   - Interacts with Razorpay SDK: order generation, webhook signature verification (`rzp_signature`), payment reconciliation, and automated refund operations.
6. **`notifications/` (`notificationRoutes.js`, `notificationController.js`, `notificationService.js`)**:
   - Delivers in-app notifications and transactional emails using Resend SDK with HTML fallback templates.
7. **`analytics/` (`analyticsRoutes.js`, `analyticsController.js`, `analyticsService.js`)**:
   - Generates organizer aggregation pipelines for gross revenue, attendance ratios, and sales velocity.

### 3.2 Database Models (`server/src/models`)

- `User.js`: Identity, roles (`ATTENDEE`, `ORGANIZER`, `ADMIN`), Argon2id password hash, email verification status.
- `Event.js`: Event metadata, dates, venue, capacity, pricing tiers, seating configuration flag, and lifecycle status.
- `Registration.js`: Attendee registration record linking User and Event, tracking payment status and cancellation status.
- `Ticket.js`: Individual ticket instance with unique alphanumeric code, seat assignment, cryptographic QR hash, and check-in timestamp.
- `EventSeat.js`: Physical seat entity (`row`, `number`, `tier`, `status`: `AVAILABLE`, `HOLD`, `BOOKED`, `BLOCKED`).
- `SeatHold.js`: Ephemeral 10-minute hold tracking user, event, seat IDs, and strict expiration timestamp (`expiresAt`).
- `Booking.js`: Financial transaction mapping registration to Razorpay order and payment IDs.
- `RefundOperation.js`: Idempotent state machine tracking refund attempts, status (`INITIATED`, `PROCESSED`, `FAILED`), error tracking, and retry backoff.
- `Notification.js`: In-app notification records tracking recipient, category, message, and read/unread status.

### 3.3 Autonomous Background Workers (`server/src/workers`)

1. **`seatHoldWorker.js`**:
   - Polls every 30 seconds for expired `SeatHold` records.
   - Atomically transitions corresponding `EventSeat` documents back to `AVAILABLE`.
2. **`refundReconciliationWorker.js`**:
   - Runs every 60 seconds.
   - Inspects `RefundOperation` documents in `INITIATED` or retryable `FAILED` state where `nextRetryAt <= now`.
   - Queries the Razorpay API idempotently to verify refund execution and reconciles database state.

---

## 4. Test Suite Layout (`server/tests/` and `client/playwright/`)

### Backend Automated Suites (212 Tests across 35 Suites)

- `server/tests/unit/` (74 tests):
  - Service-level isolation tests for auth, event validation, payment signature calculation, QR HMAC generation, RFC 5545 calendar folding, and seat reservation logic.
- `server/tests/integration/` (104 tests):
  - In-memory MongoDB tests exercising complete HTTP routes: registration flows, organizer event management, seating hold race conditions, webhook ingestion, event cancellation cascade, and .ics calendar downloads.
- `server/tests/security/` (34 tests):
  - Verification of CSRF token enforcement, RBAC route gating, NoSQL injection resistance, XSS input sanitization, and payment signature tamper protection.

### Frontend Playwright Suites (`client/playwright/tests/`)

- Functional and end-to-end integration tests covering user registration, organizer event publishing, seat selection flow, ticket display, and cancellation status verification.


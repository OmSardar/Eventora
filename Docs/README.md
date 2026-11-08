# Eventora Technical Documentation Index (`Docs/`)

Welcome to the central technical documentation repository for **Eventora**, a production-grade Event Booking and RSVP Management platform.

This directory contains specifications, architectural designs, security threat models, database schemas, test strategies, and audit reports.

---

## Master Document Map

```text
Docs/
├── 01-requirements/           # Business and functional requirements
│   ├── SRS.md                 # Software Requirements Specification (A1-G3 compliance)
│   └── requirements-traceability.md # End-to-end requirement-to-code traceability matrix
├── 02-system-design/          # System and software architecture
│   ├── architecture.md        # High-level architecture overview and data flows
│   ├── HLD.md                 # High-Level System Design (monolith, networking, deployment)
│   └── LLD.md                 # Low-Level Component Design (modules, services, pipelines)
├── 03-database-design/        # MongoDB schemas and performance indexing
│   ├── database-schema.md     # Mongoose models, data dictionaries, schema validations
│   └── indexes.md             # Compound indexes, unique constraints, and performance tuning
├── 04-api-documentation/      # Complete REST API specification
│   ├── API.md                 # Markdown API reference (endpoints, payloads, error codes)
│   └── openapi.yaml           # OpenAPI 3.0 / Swagger specification
├── 05-security/               # Security policies, threat model, and defense-in-depth
│   ├── threat-model.md        # STRIDE threat modeling and mitigation strategies
│   └── rate-limiting-policy.md# Distributed rate-limiting policies and thresholds
├── 06-testing/                # Quality assurance and verification
│   └── test-strategy.md       # Unit, integration, security, and Playwright E2E strategy
├── 07-deployment/             # Production deployment and CI/CD
│   └── deployment-guide.md    # Render, Vercel, MongoDB Atlas, and DNS setup guide
├── 08-seo/                    # Technical SEO and social sharing
│   └── seo-implementation.md  # JSON-LD structured schemas, sitemaps, and robots.txt
├── 09-production-readiness/   # Verification reports and audit trails
│   ├── final-checklist.md     # Production release verification checklist
│   ├── system-audit.md        # Initial compliance and security audit
│   ├── mfa-and-verification-architecture.md # Two-factor authentication & recovery codes
│   ├── notification-architecture.md         # In-app notification delivery architecture
│   ├── razorpay-test-mode-implementation.md # Payment gateway integration
│   ├── razorpay-test-mode-audit.md          # Payment idempotency and webhook audit
│   ├── razorpay-refund-correction-report.md # Automated refund state machine report
│   ├── backend-image-upload-audit.md        # Backend-only Cloudinary streaming audit
│   └── scope-correction-and-email-audit.md  # Resend transactional email audit
├── 10-seat-booking/           # Interactive seating & reservation subsystem
│   ├── README.md              # Seating subsystem navigation guide
│   ├── SEAT_BOOKING_ARCHITECTURE.md # Multi-seat reservation architecture
│   ├── DATABASE_DESIGN.md     # EventSeat, SeatHold, and Booking schemas
│   ├── API_SPECIFICATION.md   # Seating API contract and DTOs
│   ├── BOOKING_STATE_MACHINE.md # Seat and Booking lifecycle transitions
│   ├── CONCURRENCY_STRATEGY.md# MongoDB transaction strategy and race condition defense
│   ├── MIGRATION_PLAN.md      # Backward compatibility and migration plan
│   └── TEST_PLAN.md           # 20-client concurrency simulation test plan
└── security/                  # Repository integrity reports
    └── GIT_HISTORY_CLEANUP_REPORT.md # Git history hygiene verification
```

---

## Detailed Directory Breakdown

### 1. Requirements & Traceability (`Docs/01-requirements/`)
- [`SRS.md`](./01-requirements/SRS.md): Comprehensive Software Requirements Specification detailing functional requirements for Accounts/Auth (A1-A12), Events (B1-B10), Registrations (C1-C10), Seating (D1-D6), Payments (E1-E8), Security (F1-F12), and Non-Functional targets (G1-G8).
- [`requirements-traceability.md`](./01-requirements/requirements-traceability.md): Bidirectional traceability matrix mapping every SRS requirement directly to its implementation files, models, routes, and automated tests.

### 2. System Design (`Docs/02-system-design/`)
- [`architecture.md`](./02-system-design/architecture.md): Overall architectural blueprint, component boundaries, and request-response lifecycles.
- [`HLD.md`](./02-system-design/HLD.md): High-Level Design describing frontend, backend, database replica sets, external gateways (Razorpay, Resend, Cloudinary), and network security.
- [`LLD.md`](./02-system-design/LLD.md): Low-Level Design detailing Express middleware pipelines, service interfaces, error handling hierarchies, and token cryptosystems.

### 3. Database Design (`Docs/03-database-design/`)
- [`database-schema.md`](./03-database-design/database-schema.md): Data dictionary for all MongoDB collections (`users`, `events`, `registrations`, `bookings`, `eventseats`, `seatholds`, `payments`, `refundoperations`, `notifications`, `auditlogs`, `webhookevents`).
- [`indexes.md`](./03-database-design/indexes.md): Index inventory, compound unique constraints, text search indexes, and TTL indexes for automated expiration.

### 4. API Documentation (`Docs/04-api-documentation/`)
- [`API.md`](./04-api-documentation/API.md): Comprehensive REST API contract with request headers, body schemas, response payloads, HTTP status codes, and error formats.
- [`openapi.yaml`](./04-api-documentation/openapi.yaml): OpenAPI 3.0 specification file for import into Postman, Swagger UI, or API gateways.

### 5. Security & Threat Modeling (`Docs/05-security/`)
- [`threat-model.md`](./05-security/threat-model.md): Comprehensive STRIDE threat model evaluating Spoofing, Tampering, Repudiation, Information Disclosure, Denial of Service, and Elevation of Privilege across all architectural layers.
- [`rate-limiting-policy.md`](./05-security/rate-limiting-policy.md): Distributed rate-limiting specifications across authentication, mutations, file uploads, ticket gate scans, and webhook callbacks.

### 6. Testing Strategy (`Docs/06-testing/`)
- [`test-strategy.md`](./06-testing/test-strategy.md): Test pyramid, mocking policies, isolation strategies, 20-client concurrent race condition simulation, and automated regression suites.

### 7. Deployment & CI/CD (`Docs/07-deployment/`)
- [`deployment-guide.md`](./07-deployment/deployment-guide.md): Production deployment manual for Render (Backend Web Service), Vercel (Next.js Frontend), MongoDB Atlas (Replica Set), custom domains, SSL, and GitHub Actions CI.

### 8. Interactive Seating Subsystem (`Docs/10-seat-booking/`)
- Complete engineering specifications for interactive seat selection, temporary 10-minute seat holds, multi-seat atomic reservations, background hold reclamation, and gate-side QR ticket validation.

---

## Cross-Cutting Implementation Reference

| Concern | Primary Technical Document |
|---|---|
| **P1 Event Cancellation Lifecycle** | [`Docs/09-production-readiness/system-audit.md`](./09-production-readiness/system-audit.md) |
| **Refund Reconciliation Worker** | [`Docs/10-seat-booking/CONCURRENCY_STRATEGY.md`](./10-seat-booking/CONCURRENCY_STRATEGY.md) |
| **Add to Calendar (.ics) Download** | [`Docs/04-api-documentation/API.md`](./04-api-documentation/API.md) |
| **Interactive Seating Map** | [`Docs/10-seat-booking/SEAT_BOOKING_ARCHITECTURE.md`](./10-seat-booking/SEAT_BOOKING_ARCHITECTURE.md) |
| **Gate Ticket Verification** | [`Docs/10-seat-booking/API_SPECIFICATION.md`](./10-seat-booking/API_SPECIFICATION.md) |


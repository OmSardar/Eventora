# Eventora — Interactive Seat Selection & Reservation System
## Production-Grade Feature Upgrade

Welcome to the architectural and engineering documentation for Eventora's Interactive Seat Selection & Reservation System.

### Directory Contents

| Document | Purpose |
|---|---|
| [`SEAT_BOOKING_ARCHITECTURE.md`](./SEAT_BOOKING_ARCHITECTURE.md) | High-level system architecture, component boundaries, and end-to-end booking flow diagrams |
| [`DATABASE_DESIGN.md`](./DATABASE_DESIGN.md) | Entity relationship diagrams, MongoDB schemas (`EventSeat`, `SeatHold`, `Booking`, `Event`), indexing, and data invariants |
| [`API_SPECIFICATION.md`](./API_SPECIFICATION.md) | Complete REST API contract for organizers and attendees, error codes, and request/response DTOs |
| [`BOOKING_STATE_MACHINE.md`](./BOOKING_STATE_MACHINE.md) | State transitions for Seats (`AVAILABLE`, `HELD`, `BOOKED`, `BLOCKED`) and Bookings (`PENDING_PAYMENT`, `CONFIRMED`, `CANCELLED`) |
| [`CONCURRENCY_STRATEGY.md`](./CONCURRENCY_STRATEGY.md) | Multi-seat atomic claims, MongoDB replica set transactions, optimistic locking, and conflict resolution under high concurrency |
| [`MIGRATION_PLAN.md`](./MIGRATION_PLAN.md) | Backward compatibility strategy, legacy general-admission events, zero data loss, and migration workflows |
| [`TEST_PLAN.md`](./TEST_PLAN.md) | Comprehensive test matrix: unit tests, integration tests, 20-client concurrency simulation, and Playwright E2E suites |

---

### Core Architectural Principles

1. **Backend Authoritative**: The frontend never calculates availability or prices; all decisions, holds, and prices are enforced by MongoDB transactions.
2. **Atomic Multi-Seat Claims**: Selecting multiple seats succeeds completely or fails atomically; no partial holds are ever created.
3. **Deterministic Seat Identification**: Seats are physical inventory records (`A1`, `B2`, etc.) with unique compound indexes `(eventId, seatLabel)`.
4. **Resilient 10-Minute Hold Lifecycle**: Temporary reservations expire server-side via both proactive sweeps and scheduled background reconciliation.
5. **Durable Payment & Refund Consistency**: Razorpay test-mode integration verifies cryptographic HMAC signatures, handles late payments, prevents double bookings, and guarantees idempotent cancellation refunds.


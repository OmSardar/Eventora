# Test Plan & Verification Strategy

## 1. Test Matrix Overview

| Test Level | Scope | Framework | Coverage Target |
|---|---|---|---|
| **Unit Tests** | Seat generation, category pricing, hold countdown math, ticket HMAC signing | Node.js Test Runner | > 90% service coverage |
| **Integration Tests** | Seat generation, map retrieval, 10m holds, voluntary release, booking creation, cancellation | Node.js Test Runner + Mongo In-Memory | Full lifecycle |
| **Concurrency Tests** | 20 parallel attendees contending for seat A1, overlapping multi-seat sets | Node.js Test Runner + `Promise.all` | 100% collision detection, 0 double bookings |
| **Playwright E2E Tests** | 50-seat generation, visual selection, hold countdown, checkout, tickets, organizer dashboard | Playwright | Full user journey |

---

## 2. Concurrency Simulation Specification

### Test Scenario: 20 Concurrent Attendees Contending for Seat A1
1. **Setup**:
   - Create event with 50 seats (A1 to E10).
   - Generate 20 unique authenticated attendee accounts.
2. **Execution**:
   - Fire 20 simultaneous `createSeatHold({ seatIds: [A1] })` requests using `Promise.all`.
3. **Assertions**:
   - Exactly **1** request receives HTTP `201 Created` with an active hold.
   - Exactly **19** requests receive HTTP `409 Conflict` (`ERR_SEAT_UNAVAILABLE` or `ERR_CONCURRENT_HOLD_COLLISION`).
   - Database verification: exactly 1 `EventSeat` record has `status: HELD`.
   - SeatHold collection: exactly 1 active hold for seat A1.

### Test Scenario: Overlapping Multi-Seat Sets
1. **Setup**:
   - User 1 requests `[A1, A2]`
   - User 2 requests `[A2, A3]`
2. **Execution**:
   - Both requests dispatched concurrently.
3. **Assertions**:
   - Exactly one user successfully claims their requested pair.
   - The other user receives a 409 conflict, and **none** of their requested seats are locked (all-or-nothing atomicity).

---

## 3. End-to-End Playwright Scenarios

1. **Organizer Setup**:
   - Navigate to `/organizer/events/create`.
   - Configure 50 seats (5 rows of 10).
   - Submit event creation.
   - Verify 50 seats rendered on the map.
2. **Attendee Selection & Hold**:
   - Attendee visits event page `/events/:id`.
   - Selects seat `A1` and `A2`.
   - Clicks "Hold & Proceed to Checkout".
   - 10:00 countdown timer starts.
3. **Real-time Map State**:
   - Second browser opens seat map; verifies `A1` and `A2` are disabled and marked "Held".
4. **Checkout & Confirmation**:
   - Attendee completes checkout.
   - Seats transition to "Booked".
   - Digital Ticket displays with confirmed seat labels and unguessable QR verification payload.
5. **Organizer Dashboard**:
   - Organizer visits `/organizer/events/:id/seating`.
   - Sees booked seats, attendee name, reference, and revenue.


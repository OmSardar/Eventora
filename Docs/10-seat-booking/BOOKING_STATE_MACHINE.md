# Booking & Seat Inventory State Machines

## 1. EventSeat State Machine

```mermaid
stateDiagram-v2
    [*] --> AVAILABLE : Seat Generated

    AVAILABLE --> HELD : Hold Acquired (10m TTL)
    AVAILABLE --> BLOCKED : Organizer Blocks Seat

    BLOCKED --> AVAILABLE : Organizer Unblocks Seat

    HELD --> AVAILABLE : Hold Expires (Worker Sweep)
    HELD --> AVAILABLE : Attendee Releases Hold Early
    HELD --> BOOKED : Payment Confirmed / Booking Created

    BOOKED --> AVAILABLE : Booking Cancelled & Approved (Refund Processed)

    note right of HELD
      Requires:
      - holdId != null
      - heldBy != null
      - heldUntil > NOW
    end note

    note right of BOOKED
      Requires:
      - bookingId != null
      - holdId == null
      - heldUntil == null
    end note
```

### Transition Validation Rules
| From State | To State | Trigger | Preconditions |
|---|---|---|---|
| `AVAILABLE` | `HELD` | `createSeatHold` | Event published, future date, seat unreserved |
| `HELD` | `AVAILABLE` | `expireStaleHolds` or `releaseSeatHold` | Hold expired or requested by hold owner |
| `HELD` | `BOOKED` | `verifyAndConfirmPayment` | Hold active, valid signature, atomic transaction |
| `AVAILABLE` | `BLOCKED` | `toggleSeatBlock` | Organizer owns event, seat currently unbooked |
| `BLOCKED` | `AVAILABLE` | `toggleSeatBlock` | Organizer owns event, unblock requested |
| `BOOKED` | `AVAILABLE` | `processCancellationDecision` | Cancellation approved; refund dispatched |

---

## 2. SeatHold State Machine

```mermaid
stateDiagram-v2
    [*] --> ACTIVE : Hold Created (expiresAt = now + 10m)

    ACTIVE --> CONSUMED : Checkout Complete & Payment Verified
    ACTIVE --> RELEASED : Attendee Cancels / Navigates Away
    ACTIVE --> EXPIRED : Current Time > expiresAt (Sweeper)

    CONSUMED --> [*]
    RELEASED --> [*]
    EXPIRED --> [*]
```

### Invariants:
- A hold in `CONSUMED`, `RELEASED`, or `EXPIRED` can **never** transition back to `ACTIVE`.
- `expiresAt` is calculated strictly by the server and immutable once created.
- An expired hold cannot be used to confirm a booking.

---

## 3. Booking State Machine

```mermaid
stateDiagram-v2
    [*] --> PENDING_PAYMENT : Order Created

    PENDING_PAYMENT --> CONFIRMED : Payment Captured / Free RSVP Verified
    PENDING_PAYMENT --> CANCELLED : Hold Expired without Payment

    CONFIRMED --> CANCELLATION_REQUESTED : Attendee Requests Cancellation
    CANCELLATION_REQUESTED --> CANCELLED : Organizer Approves & Refund Processed
    CANCELLATION_REQUESTED --> CONFIRMED : Organizer Rejects Cancellation
```

---

## 4. Payment State Machine

```mermaid
stateDiagram-v2
    [*] --> CREATED : Order Created on Gateway
    CREATED --> CAPTURED : Signature Verified / Webhook Captured
    CREATED --> FAILED : Payment Failed / Verification Mismatch
    CAPTURED --> REFUND_PENDING : Cancellation Approved / Capacity Reconciled
    REFUND_PENDING --> REFUNDED : Gateway Confirms Refund
```


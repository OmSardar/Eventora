# Seat Booking Architecture Specification

## 1. Architectural Overview

The Eventora Seat Booking System transitions Eventora from a capacity-counter ticketing model to an authoritative, individual-inventory seat reservation engine.

```mermaid
flowchart TD
    subgraph Client ["Frontend (Next.js App Router)"]
        SM["SeatMap Component"]
        HC["Hold Countdown (10m)"]
        BS["Booking Summary & Checkout"]
        DT["Digital Tickets & QR Display"]
        OD["Organizer Seating Dashboard"]
    end

    subgraph API ["Express REST API Gateway"]
        AuthMiddleware["Auth & RBAC Middleware"]
        CSRF["CSRF & Origin Guard"]
        RateLimit["Rate Limiting Policy"]
        SeatingRouter["/api/v1/events/:id/seats"]
        BookingRouter["/api/v1/bookings"]
        PaymentRouter["/api/v1/payments"]
    end

    subgraph Domain ["Business Logic Services"]
        SeatService["seatingService.js"]
        BookingService["bookingService.js"]
        PaymentService["paymentService.js"]
        ExpirationWorker["holdExpirationWorker.js"]
        TicketService["ticketService.js"]
    end

    subgraph DataStore ["MongoDB Atlas"]
        EventSeatCol[("EventSeats Collection")]
        SeatHoldCol[("SeatHolds Collection")]
        BookingCol[("Bookings Collection")]
        EventCol[("Events Collection")]
        PaymentCol[("Payments Collection")]
    end

    SM -->|1. Request Seat Map| SeatingRouter
    SM -->|2. Request 10m Hold| SeatingRouter
    BS -->|3. Create Order / Reserve| PaymentRouter
    BS -->|4. Verify Payment| PaymentRouter
    OD -->|Manage / Block / Inspect| SeatingRouter

    SeatingRouter --> SeatService
    BookingRouter --> BookingService
    PaymentRouter --> PaymentService
    ExpirationWorker --> SeatService

    SeatService --> EventSeatCol
    SeatService --> SeatHoldCol
    BookingService --> BookingCol
    PaymentService --> PaymentCol
    PaymentService --> EventCol
```

---

## 2. End-to-End Workflows

### 2.1 Seat Lifecycle Workflow

```mermaid
stateDiagram-v2
    [*] --> AVAILABLE : Organizer Generates Seats
    AVAILABLE --> HELD : Attendee Selects & Holds (10m TTL)
    HELD --> AVAILABLE : Hold Expires (Timeout) or Attendee Releases
    HELD --> BOOKED : Payment Verified & Booking Confirmed
    AVAILABLE --> BLOCKED : Organizer Blocks Seat
    BLOCKED --> AVAILABLE : Organizer Unblocks Seat
    BOOKED --> AVAILABLE : Organizer Approves Cancellation (Seat Released)
    BOOKED --> [*] : Event Finished
```

---

### 2.2 Seat Hold Workflow

```mermaid
sequenceDiagram
    autonumber
    actor Attendee
    participant Frontend as Next.js Client
    participant API as Express API
    participant Service as seatingService
    participant DB as MongoDB Atlas

    Attendee->>Frontend: Selects seats A1, A2
    Frontend->>API: POST /api/v1/events/:id/seat-holds { seatIds: [A1_id, A2_id] }
    API->>Service: createSeatHold(eventId, attendeeId, seatIds)
    Note over Service,DB: Starts MongoDB Transaction
    Service->>DB: Find seats where _id IN [A1_id, A2_id]
    Service->>DB: Verify every seat is AVAILABLE
    alt Any seat is BLOCKED, BOOKED, or HELD by another
        Service-->>Frontend: 409 Conflict (ERR_SEAT_UNAVAILABLE)
    else All requested seats available
        Service->>DB: Create SeatHold (status: ACTIVE, expiresAt: now + 10m)
        Service->>DB: UpdateMany EventSeat (status: HELD, holdId, heldBy, heldUntil)
        Note over Service,DB: Commits Transaction
        Service-->>Frontend: 201 Created { holdId, expiresAt, totalAmount, seatLabels }
        Frontend->>Attendee: Display 10:00 Countdown Timer
    end
```

---

### 2.3 Booking & Payment Verification Workflow

```mermaid
sequenceDiagram
    autonumber
    actor Attendee
    participant Frontend as Next.js Client
    participant API as Express API
    participant Razorpay as Razorpay Gateway
    participant PaymentSvc as paymentService
    participant DB as MongoDB Atlas
    participant Email as Resend Email Service

    Attendee->>Frontend: Clicks "Proceed to Payment"
    Frontend->>API: POST /api/v1/payments/create-order { eventId, holdId }
    API->>PaymentSvc: createOrderWithSeatHold()
    PaymentSvc->>Razorpay: orders.create({ amount, receipt, notes })
    Razorpay-->>PaymentSvc: { id: "order_xyz", amount, currency }
    PaymentSvc->>DB: Create Payment (status: CREATED, orderId: "order_xyz")
    PaymentSvc-->>Frontend: { orderId: "order_xyz", keyId, amount }
    Frontend->>Razorpay: Open Razorpay Checkout Modal
    Attendee->>Razorpay: Completes Test Payment
    Razorpay-->>Frontend: { razorpay_payment_id, razorpay_signature }
    Frontend->>API: POST /api/v1/payments/verify { orderId, paymentId, signature }
    API->>PaymentSvc: verifyAndConfirmPayment()
    PaymentSvc->>PaymentSvc: Verify HMAC-SHA256 signature
    PaymentSvc->>DB: Update Payment (CAPTURED)
    PaymentSvc->>DB: Create confirmed Booking & update Registration
    PaymentSvc->>DB: Update EventSeats (status: BOOKED, bookingId)
    PaymentSvc->>DB: Update SeatHold (status: CONSUMED)
    PaymentSvc->>Email: Schedule Branded Confirmation Email (non-blocking)
    PaymentSvc-->>Frontend: 200 OK { booking, digitalTickets }
    Frontend->>Attendee: Displays Confirmed Digital Ticket & QR Code
```

---

### 2.4 Automatic Hold Expiration Sweep

```mermaid
flowchart TD
    Start["Scheduled Worker (30s) / On-demand Pre-sweep"] --> FindStale["Query SeatHold: status=ACTIVE AND expiresAt <= NOW"]
    FindStale --> HasStale{"Stale Holds Found?"}
    HasStale -- No --> Idle["Sleep / Return"]
    HasStale -- Yes --> LoopHold["Iterate each Stale Hold"]
    LoopHold --> TransHold["Atomically transition SeatHold: ACTIVE -> EXPIRED"]
    TransHold --> ReleaseSeats["EventSeat.updateMany: holdId=hold._id AND status=HELD -> status=AVAILABLE"]
    ReleaseSeats --> LogAudit["Structured Audit Log: SEAT_HOLD_EXPIRED"]
    LogAudit --> NextHold{"More Holds?"}
    NextHold -- Yes --> LoopHold
    NextHold -- No --> Done["Completed Sweep"]
```


# Low-Level Design (LLD) — Eventora

## 1. Domain Entities & Schemas

### 1.1 User Entity
- **Attributes:**
  - `_id`: ObjectId
  - `name`: String (2-100 chars)
  - `email`: String (RFC 5322 compliant, lowercase)
  - `normalizedEmail`: String (Unique index, normalized lowercase trimmed)
  - `passwordHash`: String (Argon2id format `$argon2id$v=19$m=...`, `select: false`)
  - `role`: Enum `['ATTENDEE', 'ORGANIZER']`, `immutable: true`
  - `createdAt`, `updatedAt`: Timestamps

### 1.2 Event Entity
- **Attributes:**
  - `_id`: ObjectId
  - `title`: String (3-200 chars)
  - `description`: String (10-5000 chars)
  - `eventDate`: Date (Must be future-dated)
  - `venue`: String (3-300 chars)
  - `seatLimit`: Integer (>= 1, max 100,000)
  - `seatsBooked`: Integer (>= 0, default 0)
  - `organizerId`: ObjectId -> User (`index: true`)
  - `status`: Enum `['DRAFT', 'PUBLISHED', 'CANCELLED']`
  - `category`: String
  - `bannerUrl`: String
- **Virtuals:**
  - `remainingSeats`: `max(0, seatLimit - seatsBooked)`
  - `isPast`: `eventDate < Date.now()`

### 1.3 Registration Entity
- **Attributes:**
  - `_id`: ObjectId
  - `eventId`: ObjectId -> Event (`index: true`)
  - `attendeeId`: ObjectId -> User (`index: true`)
  - `status`: Enum `['CONFIRMED', 'CANCELLATION_REQUESTED', 'CANCELLED', 'REJECTED']`
  - `cancellationReason`: String (max 500 chars)
  - `decisionNote`: String (max 500 chars)
  - `decidedBy`: ObjectId -> User
  - `decidedAt`: Date
- **Indexes:**
  - `{ eventId: 1, attendeeId: 1 }` (Unique compound index)
  - `{ attendeeId: 1, createdAt: -1 }`
  - `{ eventId: 1, status: 1 }`

---

## 2. Concurrency & Atomic Seat Allocation Algorithm

```mermaid
sequenceDiagram
    autonumber
    actor Attendee
    participant Router as Registration Controller
    participant Service as Registration Service
    participant Mongo as MongoDB Engine

    Attendee->>Router: POST /api/v1/events/:eventId/registrations
    Note over Router: Validates Session & CSRF Token
    Router->>Service: registerForEvent(eventId, attendeeId)
    Service->>Mongo: Check existing Registration (eventId, attendeeId)
    alt Already Registered
        Mongo-->>Service: Registration Found
        Service-->>Router: ConflictError (HTTP 409)
        Router-->>Attendee: "You are already registered for this event."
    else Not Registered
        Service->>Mongo: Event.findOneAndUpdate({ _id: eventId, status: PUBLISHED, eventDate > now, $expr: { $lt: [seatsBooked, seatLimit] } }, { $inc: { seatsBooked: 1 } })
        alt Seats Full or Inactive
            Mongo-->>Service: null
            Service-->>Router: BadRequestError (HTTP 400)
            Router-->>Attendee: "Event is sold out. No seats remaining."
        else Seat Reserved Atomically
            Mongo-->>Service: updatedEvent (seatsBooked + 1)
            Service->>Mongo: Registration.create({ eventId, attendeeId, status: CONFIRMED })
            alt Unique Index Violation (Concurrent attempt)
                Mongo-->>Service: MongoError code 11000
                Service->>Mongo: Event.findByIdAndUpdate(eventId, { $inc: { seatsBooked: -1 } })
                Service-->>Router: ConflictError (HTTP 409)
            else Insertion Successful
                Mongo-->>Service: newRegistration
                Service->>Mongo: AuditLog.create(...)
                Service-->>Router: Success (HTTP 201)
                Router-->>Attendee: Registration Confirmed
            end
        end
    end
```

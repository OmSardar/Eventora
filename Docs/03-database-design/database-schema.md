# Database Schema & Data Dictionary — Eventora

## 1. Schema Specifications

```mermaid
erDiagram
    User ||--o{ Event : creates
    User ||--o{ Registration : registers
    Event ||--o{ Registration : contains
    User ||--o{ AuditLog : acts
    Event ||--o{ AuditLog : target

    User {
        ObjectId _id PK
        string name
        string email
        string normalizedEmail UK
        string passwordHash
        string role
        date createdAt
        date updatedAt
    }

    Event {
        ObjectId _id PK
        string title
        string description
        date eventDate
        string venue
        int seatLimit
        int seatsBooked
        ObjectId organizerId FK
        string status
        string category
        string bannerUrl
        date createdAt
        date updatedAt
    }

    Registration {
        ObjectId _id PK
        ObjectId eventId FK
        ObjectId attendeeId FK
        string status
        string cancellationReason
        string decisionNote
        ObjectId decidedBy FK
        date decidedAt
        date createdAt
        date updatedAt
    }

    AuditLog {
        ObjectId _id PK
        string action
        ObjectId actorId FK
        string actorRole
        ObjectId resourceId
        string resourceType
        string status
        string ipAddress
        string userAgent
        object details
        date timestamp
    }
```

## 2. Invariants & Business Rules
1. `Event.seatsBooked` must never exceed `Event.seatLimit`.
2. `Event.seatsBooked` can never be decremented below 0.
3. Compound uniqueness on `Registration`: `{ eventId: 1, attendeeId: 1 }` prevents double booking.
4. `User.role` is immutable.

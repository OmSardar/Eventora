# Database Index Optimization Strategy — Eventora

| Collection | Index Fields | Index Type | Business Purpose |
|---|---|---|---|
| `users` | `{ normalizedEmail: 1 }` | Unique | Enforces case-insensitive email uniqueness and fast auth lookups |
| `events` | `{ organizerId: 1, createdAt: -1 }` | Compound | Fast organizer dashboard event listing sorted by recency |
| `events` | `{ status: 1, eventDate: 1 }` | Compound | Public browsing of published events ordered chronologically |
| `events` | `{ title: "text", description: "text", venue: "text" }` | Text | High-performance full-text search across title, venue, and description |
| `registrations` | `{ eventId: 1, attendeeId: 1 }` | Unique Compound | **Critical Invariant:** Guarantees attendee cannot register twice |
| `registrations` | `{ attendeeId: 1, createdAt: -1 }` | Compound | Attendee "My Registrations" portal sorted by booking date |
| `registrations` | `{ eventId: 1, status: 1 }` | Compound | Fast organizer attendee roster generation |
| `rate_limits` | `{ _id: 1, expiresAt: 1 }` | Compound / TTL | Automatic key expiration and clean up of rate limiting store |
| `audit_logs` | `{ timestamp: -1 }` | Single | Auditing compliance and incident forensics |
| `audit_logs` | `{ actorId: 1 }`, `{ resourceId: 1 }` | Single | Actor and resource tracking |


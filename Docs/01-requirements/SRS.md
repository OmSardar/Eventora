# Software Requirements Specification (SRS) — Eventora

**Document Version:** 1.0.0  
**Status:** Approved  
**Classification:** Core Technical Assignment  

---

## 1. Introduction

### 1.1 Purpose
This document specifies the software requirements for **Eventora**, an enterprise-grade event booking and RSVP management platform. Eventora delivers high-concurrency event publishing, atomic capacity allocation, and zero-trust identity isolation.

### 1.2 Scope
Eventora provides an end-to-end event experience for two distinct roles:
1. **Organizers:** Create, publish, modify, and cancel events, monitor live capacity utilization, review verified attendee rosters, and manage cancellation approvals.
2. **Attendees:** Discover public events, review detailed itineraries, reserve seats via atomic state transitions, view personalized digital tickets, and submit cancellation requests.

---

## 2. Overall Description

### 2.1 User Classes and Characteristics
- **Guest / Public:** Unauthenticated visitor able to browse published events, search, and inspect event itineraries.
- **Attendee:** Authenticated participant with personal booking history, capable of reserving available seats. Cannot create or edit events.
- **Organizer:** Authenticated event creator with administrative authority over their own events and attendee rosters. Cannot RSVP as an attendee.

### 2.2 Operating Environment
- **Client Runtime:** Modern web browsers (Chrome, Edge, Firefox, Safari) with responsive mobile support.
- **Frontend Stack:** Next.js 14 App Router, React 18, TypeScript, Tailwind CSS, TanStack Query, next-themes.
- **Backend Stack:** Node.js 22 LTS, Express.js ES Modules, Mongoose, MongoStore.
- **Persistence:** MongoDB Atlas (Replica Set with transaction support) and local MongoDB.

---

## 3. Mandatory Functional Requirements

### 3.1 Authentication & Identity (AUTH)
- **AUTH-01:** System shall support registration for Attendee and Organizer roles.
- **AUTH-02:** User roles shall be strictly immutable post-registration.
- **AUTH-03:** Passwords must be hashed using Argon2id with memoryCost 19456 KiB, timeCost 2, and parallelism 1.
- **AUTH-04:** Sessions must be stored server-side in MongoDB (`sessions` collection) with HttpOnly, SameSite cookies.
- **AUTH-05:** System shall regenerate session IDs upon login and registration to mitigate session fixation attacks.
- **AUTH-06:** Enforce idle expiration (30 minutes) and absolute expiration (24 hours).

### 3.2 Event Management (EVT)
- **EVT-01:** Organizers can create events with Title, Description, Date & Time, Venue, and Seat Limit.
- **EVT-02:** New events must be future-dated. Past dates must be rejected with HTTP 400.
- **EVT-03:** Organizers can update only their own events. Modification of other organizers' events must return HTTP 403.
- **EVT-04:** Capacity reduction below currently confirmed registrations must be rejected with HTTP 400.
- **EVT-05:** Organizers can cancel their own events. Cancelled events cease accepting registrations immediately.
- **EVT-06:** Organizers can view attendee rosters (names and emails) for their owned events only.

### 3.3 RSVP & Booking (RSVP)
- **RSVP-01:** System shall atomically reserve seats using MongoDB conditional operations (`$expr: { $lt: ['$seatsBooked', '$seatLimit'] }`).
- **RSVP-02:** Capacity limits must never be breached, regardless of concurrent request volume.
- **RSVP-03:** An attendee can register only once per event, guaranteed by compound unique index `{ eventId: 1, attendeeId: 1 }`.
- **RSVP-04:** Sold-out, cancelled, or past events must reject booking attempts.
- **RSVP-05:** Attendees can view their active tickets via `/api/v1/registrations/me`.

### 3.4 Security & Defense (SEC)
- **SEC-01:** Synchronizer CSRF tokens verified on all state-changing HTTP operations.
- **SEC-02:** Origin and Referer validation enforcing allowed domains.
- **SEC-03:** Rate limiting backed by shared distributed MongoDB storage.
- **SEC-04:** Structured JSON logging with automatic credential and cookie redaction via Pino.


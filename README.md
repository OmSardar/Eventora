# EVENTORA — Production Event Booking & RSVP Platform

Eventora is a production-quality event booking and RSVP management platform built with Next.js 14, Express.js, and MongoDB. Engineered with vertical slice architecture, atomic concurrency control, zero-trust security boundaries, and a clean monochrome design system.

---

## 1. Quick Start & Demo Accounts

For instant evaluation, two pre-configured demo accounts are provided with pre-seeded events and bookings:

| Role | Email | Password | Primary Capabilities |
|---|---|---|---|
| **Organizer** | `organizer@eventora.demo` | `Organizer@123` | Host events, edit events, view attendee names and emails, cancel events, approve cancellations |
| **Attendee** | `attendee@eventora.demo` | `Attendee@123` | Discover upcoming events, reserve seats with atomic guarantees, view digital tickets, request cancellations |

> **Note:** The login page features **1-Click Demo Fill buttons** that automatically populate these credentials for quick review.

To reset or seed demo data at any time:
```bash
npm run seed --prefix server
```

---

## 2. Technology Stack

### Frontend
- **Framework:** Next.js 14 (App Router)
- **Library:** React 18, TypeScript (Strict)
- **Styling:** Tailwind CSS & shadcn/ui minimal tokens
- **Animations:** GSAP
- **State Management:** TanStack Query (React Query v5)
- **Forms & Validation:** React Hook Form & Zod
- **Icons:** Lucide React
- **Theme:** `next-themes` (Full Light & Dark modes)

### Backend
- **Runtime:** Node.js 22 LTS (ES Modules)
- **Web Framework:** Express.js 4
- **Database Engine:** MongoDB & Mongoose 8
- **Session Store:** `express-session` with `connect-mongo`
- **Password Security:** Argon2id (`argon2`)
- **HTTP Hardening:** Helmet (Restrictive CSP), CORS (Exact origins)
- **CSRF Defense:** Synchronizer token pattern & Origin header inspection
- **Rate Limiting:** Distributed MongoDB-backed store (`rate_limits`)
- **Logging:** Structured JSON logging with Pino & automatic sensitive data redaction

---

## 3. Key Architecture & Business Rules

1. **Vertical Slice Architecture:** Code is organized by business feature (`authentication`, `events`, `registrations`, `cancellations`), preventing sprawling coupling.
2. **Atomic Concurrency Guarantee:** Seat reservations use atomic MongoDB expressions:
   ```javascript
   Event.findOneAndUpdate({
     _id: eventId,
     status: 'PUBLISHED',
     eventDate: { $gt: new Date() },
     $expr: { $lt: ['$seatsBooked', '$seatLimit'] }
   }, { $inc: { seatsBooked: 1 } })
   ```
   Capacity limits cannot be breached even under high concurrency flash crowds.
3. **Double-Booking Immunity:** A unique compound index `{ eventId: 1, attendeeId: 1 }` guarantees an attendee can never register more than once for an event.
4. **Role Immutability:** User roles are sealed upon registration and can never be modified via profile endpoints.
5. **Capacity Floor Protection:** Organizers cannot reduce an event's seat limit below the currently booked seat count.
6. **Cancellation Approval Workflow:** Attendee cancellation requests require organizer approval before the seat is released back to the event.

---

## 4. Local Installation & Setup

### Prerequisites
- Node.js >= 20.0.0 (Tested on Node.js 22.18.0)
- npm >= 10.0.0
- MongoDB instance running locally (port 27017) or MongoDB Atlas URI

### 1. Clone & Install
```bash
# Clone the repository
git clone <repo-url>
cd EVENTORA

# Install root, backend, and frontend dependencies
npm run install:all
```

### 2. Configure Environment Variables
Create `server/.env` (or copy from `server/.env.example`):
```env
PORT=5000
NODE_ENV=development
MONGODB_URI=mongodb://127.0.0.1:27017/eventora
SESSION_SECRET=eventora-super-secret-development-key-minimum-32-chars-long!
ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
LOG_LEVEL=info
```

Create `client/.env.local`:
```env
NEXT_PUBLIC_API_URL=http://localhost:5000/api/v1
```

### 3. Seed Database
```bash
npm run seed --prefix server
```

### 4. Run Development Servers
In separate terminal windows or run together:
```bash
# Start Backend REST API (Port 5000)
npm run dev:server

# Start Frontend Next.js Client (Port 3000)
npm run dev:client
```
Visit `http://localhost:3000` to access the application.

---

## 5. Automated Testing

Eventora includes 26+ automated backend tests (unit, integration, security) and Playwright E2E suites:

```bash
# Run all backend tests
npm test --prefix server

# Run individual test suites
npm run test:unit --prefix server        # Password hashing & Zod schema validation
npm run test:integration --prefix server # Atomic booking, capacity reduction, duplicate rejection
npm run test:security --prefix server    # CSRF, origin check, unauthenticated & role restrictions

# Run Playwright E2E tests
npm run test:e2e --prefix client
```

---

## 6. Project Structure

```text
EVENTORA/
├── client/
│   ├── src/
│   │   ├── app/
│   │   │   ├── (public)/          # Landing page, /events, /events/[eventId]
│   │   │   ├── (auth)/            # /login, /register
│   │   │   ├── (organizer)/       # /organizer/dashboard, events, create, edit, attendees
│   │   │   ├── (attendee)/        # /attendee/registrations
│   │   │   ├── layout.tsx         # Root layout with ThemeProvider & Navbar/Footer
│   │   │   └── providers.tsx      # QueryClient & AuthContext
│   │   ├── components/            # ui/, layout/, shared/ (EventCard)
│   │   ├── features/              # AuthContext and domain hooks
│   │   ├── lib/                   # api client, utils
│   │   └── types/                 # TypeScript interfaces
│   └── playwright/                # E2E test suites
│
├── server/
│   ├── src/
│   │   ├── modules/               # authentication/, users/, events/, registrations/, audit/
│   │   ├── infrastructure/        # database/, session/, logging/, security/
│   │   ├── shared/                # middleware/, errors/, validation/, constants/
│   │   ├── app.js                 # Express application & security pipeline
│   │   └── server.js              # Server entry point & graceful shutdown
│   └── tests/                     # unit/, integration/, security/
│
├── Docs/                          # Complete technical documentation & architecture
└── README.md
```

---

## 7. Deployment Guide

- **Frontend:** Deployed on Vercel with environment variable `NEXT_PUBLIC_API_URL`.
- **Backend:** Deployed on Render with environment variables `MONGODB_URI`, `SESSION_SECRET`, `ALLOWED_ORIGINS`.
- **Database:** Hosted on MongoDB Atlas Replica Set (supporting multi-document transactions and conditional atomic updates).

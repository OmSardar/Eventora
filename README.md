# EVENTORA — Production Event Booking & RSVP Platform

Eventora is a production-quality event booking and RSVP management platform built with Next.js 14, Express.js, and MongoDB. Engineered with vertical slice architecture, atomic concurrency control, zero-trust security boundaries, transactional email confirmations via Resend, and a clean monochrome design system.

---

## 1. Quick Start & Demo Accounts

For instant evaluation, two pre-configured demo accounts are provided with pre-seeded events and bookings:

| Role | Email | Password | Primary Capabilities |
|---|---|---|---|
| **Organizer** | `organizer@eventora.demo` | `Organizer@123` | Host events, edit events, view attendee names and emails, cancel events, approve cancellations |
| **Attendee** | `attendee@eventora.demo` | `Attendee@123` | Discover upcoming events, reserve seats with atomic guarantees, receive Resend transactional email confirmations, view digital tickets, request cancellations |

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
- **Smooth Scrolling & Animations:** Lenis & GSAP ScrollTrigger
- **State Management:** TanStack Query (React Query v5)
- **Forms & Validation:** React Hook Form & Zod
- **Icons:** Lucide React
- **Theme:** `next-themes` (Full Light & Dark modes)

### Backend
- **Runtime:** Node.js 22 LTS (ES Modules)
- **Web Framework:** Express.js 4
- **Database Engine:** MongoDB & Mongoose 8
- **Session Store:** `express-session` with `connect-mongo`
- **Transactional Email:** Resend API (`resend`) with non-blocking error isolation and atomic idempotency
- **Password Security:** Argon2id (`argon2`)
- **HTTP Hardening:** Helmet (Restrictive CSP), CORS (Exact origins)
- **CSRF Defense:** Synchronizer token pattern & Origin header inspection
- **Rate Limiting:** Distributed MongoDB-backed store (`rate_limits`)
- **Image Uploads:** Backend-only Cloudinary server SDK integration (Multer memory storage, cryptographic magic bytes inspection, zero client credentials, automatic asset lifecycle & cleanup)
- **Logging:** Structured JSON logging with Pino & automatic sensitive data redaction

---

## 3. Key Architecture & Business Rules

1. **Vertical Slice Architecture:** Code is organized by business feature (`authentication`, `events`, `registrations`, `cancellations`, `notifications`), preventing sprawling coupling.
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
4. **Resend Transactional Email Confirmations:**
   - Dispatched non-blockingly **after** seat allocation commits.
   - Guaranteed atomic deduplication via `confirmationEmailSent: { $ne: true }`.
   - Complete responsive HTML template with plain-text fallback.
   - Resilient error handling (upstream provider failures never roll back or cancel confirmed registrations).
   - Mock simulation mode when `RESEND_API_KEY` is omitted or in test environments.
5. **Role Immutability:** User roles are sealed upon registration and can never be modified via profile endpoints.
6. **Capacity Floor Protection:** Organizers cannot reduce an event's seat limit below the currently booked seat count.
7. **Cancellation Approval Workflow:** Attendee cancellation requests require organizer approval before the seat is released back to the event.
8. **Backend-Only Cloudinary Upload Architecture:**
   - Next.js client has zero Cloudinary credentials, imports zero Cloudinary SDKs, and performs no client-side signature fetching or direct calls to Cloudinary.
   - Images are uploaded strictly as `multipart/form-data` to authenticated backend endpoints (`POST /api/v1/events/:eventId/banner` or `POST /api/v1/events/banner`).
   - Express backend validates `ORGANIZER` role and verifies event ownership before accepting payloads.
   - Strict binary magic bytes verification allows genuine JPEG, PNG, and WebP files (max 5MB), rejecting SVGs, HTML, executables, and spoofed MIME types.
   - Assets are streamed to Cloudinary via server-side SDK using server-generated public IDs (`eventora/events/banner_...`).
   - Previous Cloudinary assets are deleted upon banner replacement, and newly uploaded assets are purged if database persistence fails.

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

# Resend Transactional Email (Runs in mock mode when key is placeholder or test)
RESEND_API_KEY=re_placeholder_replace_with_live_key
EMAIL_FROM=Eventora <onboarding@resend.dev>
APP_BASE_URL=http://localhost:3000

# Cloudinary backend integration (never exposed to frontend/browser)
CLOUDINARY_CLOUD_NAME=your_cloudinary_cloud_name
CLOUDINARY_API_KEY=your_cloudinary_api_key
CLOUDINARY_API_SECRET=your_cloudinary_api_secret
```

Create `client/.env.local`:
```env
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_API_URL=http://localhost:5000/api/v1
INTERNAL_API_URL=http://localhost:5000/api/v1
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

Eventora includes **85 automated tests** passing at 100% across the backend and frontend suites:

```bash
# Run all backend tests (68/68 passing across Unit, Integration, and Security)
npm test --prefix server

# Run individual backend test suites
npm run test:unit --prefix server        # 11 tests: Password hashing, Zod validation, Resend email template rendering
npm run test:integration --prefix server # 13 tests: Atomic booking, race conditions, full event, capacity floor, in-app notifications, Resend email idempotency & resilience
npm run test:security --prefix server    # 44 tests: CSRF, origin check, role guards, privacy isolation, rate limiting, backend-only Cloudinary uploads (magic bytes, MIME spoofing, SVG/exe rejection, replacement & cleanup)

# Run Playwright E2E & SEO tests (17/17 passing)
npm run test:e2e --prefix client         # 17 tests: Auth journeys, role authorization, events discovery, Free RSVP & Resend email confirmation flow, backend banner upload controls, Organizer attendee roster, metadata, canonicals, OG tags, JSON-LD schemas, robots.txt & sitemap.xml
```

---

## 6. Technical SEO & Brand Identity System

Eventora is engineered with enterprise-grade technical SEO using native Next.js App Router metadata conventions:

- **Canonical URL & Metadata Base:** Governed by `NEXT_PUBLIC_SITE_URL` via `siteConfig.ts` with strict root `metadataBase`.
- **Social Graph Sharing:** Pre-rendered 1200x630 Open Graph and Twitter summary cards (`/og-image.png`).
- **Dynamic Event Metadata (`generateMetadata`):** Server-side fetched event titles, descriptions, canonical links, and social images, with graceful fallback on missing or cancelled events.
- **Strict Noindex Controls:** Private and sensitive application routes (`/login`, `/register`, `/attendee/*`, `/organizer/*`) enforce `noindex, nofollow` directives to prevent indexing.
- **Attendee Privacy:** Attendee rosters, email addresses, and booking records are strictly omitted from public metadata and search crawler schemas.
- **Structured Data (Schema.org):** Safe anti-XSS JSON-LD rendering for `WebSite`, `Organization`, and `Event` (reflecting actual start dates, venues, organizers, and dynamic `InStock` / `SoldOut` capacity states).
- **Dynamic Metadata Routes:** Native `/robots.txt` and `/sitemap.xml` dynamically querying live published events.
- **Brand Icon System:** Minimal monochrome geometric ticket beacon monogram rendered in:
  - `client/public/favicon.svg` (adaptive to `@media (prefers-color-scheme: dark)`)
  - `client/public/favicon.ico` (multi-resolution 16/32/48 binary ICO)
  - `client/public/icon.png` (512x512 high-resolution icon)
  - `client/public/apple-icon.png` (180x180 iOS touch icon)
  - `client/public/site.webmanifest` (PWA application manifest)

Full documentation available in [`Docs/08-seo/seo-implementation.md`](file:///D:/THE%20OMS%20DEVS/WEB%20DEVS/MERN%20PROJECTS/PERSONAL/EVENTORA/Docs/08-seo/seo-implementation.md).

---

## 7. Project Structure

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
│   │   ├── lib/                   # api client, utils, siteConfig
│   │   └── types/                 # TypeScript interfaces
│   └── playwright/                # E2E test suites (17 tests)
│
├── server/
│   ├── src/
│   │   ├── modules/               # authentication/, users/, events/, registrations/, notifications/
│   │   ├── infrastructure/        # database/, session/, logging/, email/ (Resend), cloudinary/
│   │   ├── shared/                # middleware/ (uploadMiddleware), validation/ (fileValidation), errors/
│   │   ├── app.js                 # Express application & security pipeline
│   │   └── server.js              # Server entry point & graceful shutdown
│   └── tests/                     # unit/, integration/, security/ (68 tests)
│
├── Docs/                          # Complete technical documentation & architecture
└── README.md
```

---

## 8. Deployment Guide

- **Frontend:** Deployed on Vercel with environment variable `NEXT_PUBLIC_API_URL`.
- **Backend:** Deployed on Render with environment variables `MONGODB_URI`, `SESSION_SECRET`, `ALLOWED_ORIGINS`, `RESEND_API_KEY`.
- **Database:** Hosted on MongoDB Atlas Replica Set (supporting multi-document transactions and conditional atomic updates).

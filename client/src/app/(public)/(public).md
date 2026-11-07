# Public Route Group Documentation (`client/src/app/(public)`)

## A. Directory Overview
The `client/src/app/(public)` directory contains the public-facing route group of the Eventora application. Route groups in Next.js App Router (marked with parentheses) organize routes without affecting the URL pathname. This group holds the landing page (`/`), event catalog (`/events`), and individual event detail pages (`/events/[eventId]`).

## B. Directory Structure
```text
client/src/app/(public)/
├── (public).md          # This documentation file
├── page.tsx             # Application homepage / landing page route
└── events/              # Event catalog and dynamic detail routes
    ├── events.md
    ├── page.tsx
    └── [eventId]/
        ├── [eventId].md
        └── page.tsx
```

## C. File-by-File Documentation

### 1. `page.tsx`
- **File Type:** Next.js App Router Root Page (`.tsx`)
- **Primary Responsibility:** Root landing page (`/`).
- **Features:**
  - Server-side pre-fetching of initial upcoming published events (`GET /api/v1/events?limit=6`).
  - Passes data to `LandingView` for instant hydration and zero layout shift.
  - Generates canonical metadata for the homepage.
- **Dependencies:** `LandingView` from `@/components/landing/LandingView`, `@/lib/api`.

## D. Child Directory Documentation

1. **[`events/`](events/events.md)**
   - Event browsing and individual event reservation routes.
   - [Documentation](events/events.md)

## E. Related Documentation
- [App Root Documentation (`client/src/app/app.md`)](../app.md)
- [Client Root Documentation (`client/client_root.md`)](../../client_root.md)


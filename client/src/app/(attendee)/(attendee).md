# Attendee Route Group Documentation (`client/src/app/(attendee)`)

## A. Directory Overview
The `client/src/app/(attendee)` directory is a Next.js route group establishing client-side role authorization for attendees. Its layout ensures that unauthenticated visitors are redirected to `/login`, and organizers attempting to access attendee routes are redirected to their organizer dashboard.

## B. Directory Structure
```text
client/src/app/(attendee)/
├── (attendee).md        # This documentation file
├── layout.tsx           # Role guard layout component (`requireAttendee`)
└── attendee/            # Attendee routes (dashboard, registrations)
    ├── attendee.md
    ├── dashboard/
    └── registrations/
```

## C. File-by-File Documentation

### 1. `layout.tsx`
- **File Type:** React Client Component (`"use client"`)
- **Primary Responsibility:** Role authorization guard for attendees.
- **Implementation Logic:**
  - Consumes `useAuth()`.
  - While `isLoading: true`, renders accessible skeleton loading state.
  - If `user === null`, redirects to `/login`.
  - If `user.role === 'ORGANIZER'`, redirects to `/organizer/dashboard`.
  - Enforces `noindex, nofollow` to prevent private booking data from being indexed by search engines.

## D. Child Directory Documentation

1. **[`attendee/`](attendee/attendee.md)**
   - Houses attendee sub-routes (`/attendee/dashboard`, `/attendee/registrations`).
   - [Documentation](attendee/attendee.md)

## E. Related Documentation
- [App Root Documentation (`client/src/app/app.md`)](../app.md)
- [Client Root Documentation (`client/client_root.md`)](../../client_root.md)


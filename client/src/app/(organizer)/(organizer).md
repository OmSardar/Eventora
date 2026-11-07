# Organizer Route Group Documentation (`client/src/app/(organizer)`)

## A. Directory Overview
The `client/src/app/(organizer)` directory is a Next.js route group establishing client-side role authorization for organizers. Its layout protects all `/organizer/*` routes, redirecting unauthenticated visitors to `/login` and attendees to `/events`.

## B. Directory Structure
```text
client/src/app/(organizer)/
├── (organizer).md       # This documentation file
├── layout.tsx           # Role guard layout component (`requireOrganizer`)
└── organizer/           # Organizer portal routes (dashboard, events)
    ├── organizer.md
    ├── dashboard/
    └── events/
```

## C. File-by-File Documentation

### 1. `layout.tsx`
- **File Type:** React Client Component (`"use client"`)
- **Primary Responsibility:** Role authorization guard for organizers.
- **Implementation Logic:**
  - Consumes `useAuth()`.
  - While `isLoading: true`, renders skeleton loading state.
  - If `user === null`, redirects to `/login`.
  - If `user.role !== 'ORGANIZER'`, redirects to `/events`.
  - Enforces `noindex, nofollow` metadata to protect organizer management interfaces from search engine indexing.

## D. Child Directory Documentation

1. **[`organizer/`](organizer/organizer.md)**
   - Houses organizer sub-routes (`/organizer/dashboard`, `/organizer/events/*`).
   - [Documentation](organizer/organizer.md)

## E. Related Documentation
- [App Root Documentation (`client/src/app/app.md`)](../app.md)
- [Client Root Documentation (`client/client_root.md`)](../../client_root.md)


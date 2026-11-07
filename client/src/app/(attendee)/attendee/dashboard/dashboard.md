# Attendee Dashboard Route Documentation (`client/src/app/(attendee)/attendee/dashboard`)

## A. Directory Overview
This directory defines the attendee overview dashboard (`/attendee/dashboard`). It serves as an immediate redirection and summary view for logged-in attendees, routing them to their confirmed tickets and booking history.

## B. Directory Structure
```text
client/src/app/(attendee)/attendee/dashboard/
├── dashboard.md         # This documentation file
└── page.tsx             # Attendee dashboard page component
```

## C. File-by-File Documentation

### 1. `page.tsx`
- **File Type:** Next.js App Router Page (`.tsx`)
- **Primary Responsibility:** Overview redirect to attendee registrations.
- **Exported Symbols:**
  - `default AttendeeDashboardPage()`: Redirects or presents quick links to `/attendee/registrations` and `/events`.

## D. Child Directory Documentation
No child subdirectories exist in this directory.

## E. Related Documentation
- [Attendee Parent Documentation (`client/src/app/(attendee)/attendee/attendee.md`)](../attendee.md)
- [Attendee Route Group (`client/src/app/(attendee)/(attendee).md`)](../../(attendee).md)


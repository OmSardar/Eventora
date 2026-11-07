# Attendee Registrations Route Documentation (`client/src/app/(attendee)/attendee/registrations`)

## A. Directory Overview
This directory defines the attendee ticket management route (`/attendee/registrations`). It displays the logged-in attendee's active and historical event registrations, renders digital QR-style ticket passes, provides email confirmation alerts, and allows attendees to initiate cancellation requests.

## B. Directory Structure
```text
client/src/app/(attendee)/attendee/registrations/
├── registrations.md     # This documentation file
└── page.tsx             # Registrations list and cancellation dialog component
```

## C. File-by-File Documentation

### 1. `page.tsx`
- **File Type:** React Client Component (`"use client"`)
- **Primary Responsibility:** Manages and renders the attendee's ticket portfolio.
- **Features:**
  - Queries `GET /api/v1/registrations/me` using TanStack Query.
  - Displays confirmed tickets with event date, venue, status badges, and digital ticket identifiers.
  - Interactive Cancellation Dialog: Opens modal prompt allowing attendee to submit a cancellation reason (`POST /api/v1/registrations/:registrationId/cancellation-request`).
  - Automatically updates ticket state to `CANCELLATION_REQUESTED` pending organizer review.

## D. Child Directory Documentation
No child subdirectories exist in this directory.

## E. Related Documentation
- [Attendee Parent Documentation (`client/src/app/(attendee)/attendee/attendee.md`)](../attendee.md)
- [Attendee Route Group (`client/src/app/(attendee)/(attendee).md`)](../../(attendee).md)


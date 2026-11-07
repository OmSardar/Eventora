# Event Attendees Route Documentation (`client/src/app/(organizer)/organizer/events/[eventId]/attendees`)

## A. Directory Overview
This directory defines the organizer attendee roster route (`/organizer/events/[eventId]/attendees`). It provides event organizers with a private, authenticated roster of confirmed attendees for their events, including attendee names, emails, and registration timestamps.

## B. Directory Structure
```text
client/src/app/(organizer)/organizer/events/[eventId]/attendees/
├── attendees.md         # This documentation file
└── page.tsx             # Attendee roster table component
```

## C. File-by-File Documentation

### 1. `page.tsx`
- **File Type:** React Client Component (`"use client"`)
- **Primary Responsibility:** Displays attendee roster table.
- **Features:**
  - Queries `GET /api/v1/events/:eventId/attendees`.
  - Enforces organizer ownership verification via backend.
  - Displays attendee names, emails, registration dates, and status badges.
  - Excludes all payment or transaction columns, maintaining clean Free RSVP alignment.

## D. Child Directory Documentation
No child subdirectories exist in this directory.

## E. Related Documentation
- [Organizer Event Management (`client/src/app/(organizer)/organizer/events/[eventId]/[eventId].md`)](../[eventId].md)
- [Organizer Route Group (`client/src/app/(organizer)/(organizer).md`)](../../../../(organizer).md)


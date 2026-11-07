# Organizer Events Directory Documentation (`client/src/app/(organizer)/organizer/events`)

## A. Directory Overview
The `client/src/app/(organizer)/organizer/events` directory manages the event administrative section of the organizer portal (`/organizer/events`). It includes the event list, event creator, and dynamic event management sub-routes.

## B. Directory Structure
```text
client/src/app/(organizer)/organizer/events/
├── events.md            # This documentation file
├── page.tsx             # Organizer events listing view
├── create/              # New event authoring route
│   ├── create.md
│   └── page.tsx
└── [eventId]/           # Dynamic event operations (attendees, edit)
    ├── [eventId].md
    ├── attendees/
    └── edit/
```

## C. File-by-File Documentation

### 1. `page.tsx`
- **File Type:** React Client Component (`"use client"`)
- **Primary Responsibility:** Lists all events created by the logged-in organizer.
- **Features:**
  - Queries `GET /api/v1/events/organizer/my-events`.
  - Displays grid of organizer event cards with actions to edit, view attendees, or cancel.

## D. Child Directory Documentation

1. **[`create/`](create/create.md)**: Host new event form with banner upload.
2. **[`[eventId]/`]([eventId]/[eventId].md)**: Dynamic routes for attendee rosters and editing.

## E. Related Documentation
- [Organizer Portal (`client/src/app/(organizer)/organizer/organizer.md`)](../organizer.md)
- [Organizer Route Group (`client/src/app/(organizer)/(organizer).md`)](../../(organizer).md)


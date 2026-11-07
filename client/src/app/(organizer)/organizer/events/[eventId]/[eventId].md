# Organizer Dynamic Event Directory Documentation (`client/src/app/(organizer)/organizer/events/[eventId]`)

## A. Directory Overview
This directory represents the dynamic path container (`/organizer/events/[eventId]`) for an individual event managed by an organizer. It groups the attendee roster (`attendees/`) and event modification form (`edit/`).

## B. Directory Structure
```text
client/src/app/(organizer)/organizer/events/[eventId]/
├── [eventId].md         # This documentation file
├── attendees/           # Attendee roster sub-route
│   ├── attendees.md
│   └── page.tsx
└── edit/                # Event edit form sub-route
    ├── edit.md
    └── page.tsx
```

## C. File-by-File Documentation
There are no direct source files in this path container; logic is divided into the two sub-routes documented below.

## D. Child Directory Documentation

1. **[`attendees/`](attendees/attendees.md)**: Attendee names, emails, and booking dates roster.
2. **[`edit/`](edit/edit.md)**: Event editing and banner replacement form.

## E. Related Documentation
- [Organizer Events Directory (`client/src/app/(organizer)/organizer/events/events.md`)](../events.md)
- [Organizer Route Group (`client/src/app/(organizer)/(organizer).md`)](../../../(organizer).md)


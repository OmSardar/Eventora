# Public Events Route Documentation (`client/src/app/(public)/events`)

## A. Directory Overview
This directory defines the public event catalog route (`/events`). It enables visitors and attendees to browse, search, and filter published events across categories.

## B. Directory Structure
```text
client/src/app/(public)/events/
├── events.md            # This documentation file
├── page.tsx             # Public events catalog page component
└── [eventId]/           # Dynamic individual event detail route
    └── [eventId].md
```

## C. File-by-File Documentation

### 1. `page.tsx`
- **File Type:** Next.js App Router Page (`.tsx`)
- **Primary Responsibility:** Mounts `EventsBrowseView` with metadata title "Browse Events | Eventora".
- **Exported Symbols:**
  - `metadata`: Static Next.js metadata object (`title: 'Browse Events'`, canonical `/events`).
  - `default EventsPage()`: Renders `EventsBrowseView`.
- **Dependencies:** `EventsBrowseView` from `@/components/events/EventsBrowseView`.

## D. Child Directory Documentation

1. **[`[eventId]/`]([eventId]/[eventId].md)**
   - Dynamic route for viewing individual event details and RSVP reservation.
   - [Documentation]([eventId]/[eventId].md)

## E. Related Documentation
- [Public Route Group (`client/src/app/(public)/(public).md`)](../(public).md)
- [Client App Root Documentation (`client/src/app/app.md`)](../../app.md)


# Organizer Portal Documentation (`client/src/app/(organizer)/organizer`)

## A. Directory Overview
The `client/src/app/(organizer)/organizer` directory groups all organizer management views under the `/organizer/*` URL path, containing the overview dashboard and event administration sub-routes.

## B. Directory Structure
```text
client/src/app/(organizer)/organizer/
├── organizer.md         # This documentation file
├── dashboard/           # Main organizer dashboard and cancellation approvals
│   ├── dashboard.md
│   └── page.tsx
└── events/              # Event lists, creator, and dynamic management
    ├── events.md
    ├── page.tsx
    ├── create/
    └── [eventId]/
```

## C. File-by-File Documentation
There are no direct source files in this path container; logic is divided into the two sub-routes documented below.

## D. Child Directory Documentation

1. **[`dashboard/`](dashboard/dashboard.md)**: Main organizer dashboard and cancellation approval interface.
2. **[`events/`](events/events.md)**: Event management, creation form, attendee rosters, and editing.

## E. Related Documentation
- [Organizer Route Group (`client/src/app/(organizer)/(organizer).md`)](../(organizer).md)
- [Client App Root Documentation (`client/src/app/app.md`)](../../app.md)


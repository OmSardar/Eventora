# Event Creation Route Documentation (`client/src/app/(organizer)/organizer/events/create`)

## A. Directory Overview
This directory defines the event creation page route (`/organizer/events/create`). It enables authenticated organizers to author new events with title, description, venue, future date, seat capacity, category, and banner image.

## B. Directory Structure
```text
client/src/app/(organizer)/organizer/events/create/
├── create.md            # This documentation file
└── page.tsx             # Event creation form with ImageUploadField
```

## C. File-by-File Documentation

### 1. `page.tsx`
- **File Type:** React Client Component (`"use client"`)
- **Primary Responsibility:** Hosts new event creation workflow.
- **Features:**
  - Client-side validation using React Hook Form and Zod.
  - Mounts `ImageUploadField` configured for pre-creation draft uploads (`POST /api/v1/events/banner`).
  - Submits payload to `POST /api/v1/events`.
  - Redirects to `/organizer/dashboard` on success with optimistic query invalidation.

## D. Child Directory Documentation
No child subdirectories exist in this directory.

## E. Related Documentation
- [Organizer Events Directory (`client/src/app/(organizer)/organizer/events/events.md`)](../events.md)
- [Organizer Route Group (`client/src/app/(organizer)/(organizer).md`)](../../../(organizer).md)


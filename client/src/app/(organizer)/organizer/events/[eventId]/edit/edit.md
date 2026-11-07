# Event Edit Route Documentation (`client/src/app/(organizer)/organizer/events/[eventId]/edit`)

## A. Directory Overview
This directory defines the event editing route (`/organizer/events/[eventId]/edit`). It allows organizers to modify event details, adjust seat limits (enforcing capacity floor rules), and upload or replace event banner images using the backend-only Cloudinary integration.

## B. Directory Structure
```text
client/src/app/(organizer)/organizer/events/[eventId]/edit/
├── edit.md              # This documentation file
└── page.tsx             # Event edit form component with ImageUploadField
```

## C. File-by-File Documentation

### 1. `page.tsx`
- **File Type:** React Client Component (`"use client"`)
- **Primary Responsibility:** Event update form.
- **Features:**
  - Queries `GET /api/v1/events/:eventId` to pre-populate form fields.
  - Mounts `ImageUploadField` bound with `eventId={eventId}` for existing asset replacement.
  - Enforces capacity floor: Rejects setting seat limit lower than already booked seats.
  - Submits updates via `PATCH /api/v1/events/:eventId` and redirects to organizer dashboard.

## D. Child Directory Documentation
No child subdirectories exist in this directory.

## E. Related Documentation
- [Organizer Event Management (`client/src/app/(organizer)/organizer/events/[eventId]/[eventId].md`)](../[eventId].md)
- [Organizer Route Group (`client/src/app/(organizer)/(organizer).md`)](../../../../(organizer).md)


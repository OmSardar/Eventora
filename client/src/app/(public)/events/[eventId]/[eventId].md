# Event Detail Route Documentation (`client/src/app/(public)/events/[eventId]`)

## A. Directory Overview
This directory represents the dynamic event details route (`/events/[eventId]`). It is responsible for server-side metadata generation (`generateMetadata`), dynamic Schema.org Event structured data injection, and rendering the interactive `EventDetailView`.

## B. Directory Structure
```text
client/src/app/(public)/events/[eventId]/
├── [eventId].md         # This documentation file
└── page.tsx             # Dynamic route page component with SSR metadata
```

## C. File-by-File Documentation

### 1. `page.tsx`
- **File Type:** Next.js App Router Dynamic Page (`.tsx`)
- **Primary Responsibility:** Fetches event by ID, generates canonical SEO tags, and mounts `EventDetailView`.
- **Exported Symbols:**
  - `generateMetadata({ params })`: Server-side async metadata function querying backend API for dynamic title, description, canonical link, and social image tags. Fallback metadata applied if event is missing or unverified.
  - `default EventDetailPage({ params })`: Async page component rendering `EventDetailView`.
- **Dependencies:** `EventDetailView` from `@/components/events/EventDetailView`, `@/lib/api`.

## D. Child Directory Documentation
No child subdirectories exist in this directory.

## E. Execution Flow
Request `/events/:eventId` -> `generateMetadata` fetches event for `<head>` -> `EventDetailPage` renders `EventDetailView` with live RSVP capability.

## F. Related Documentation
- [Events Route Documentation (`client/src/app/(public)/events/events.md`)](../events.md)
- [Public Route Group (`client/src/app/(public)/(public).md`)](../../(public).md)


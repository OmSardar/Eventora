# Organizer Dashboard Route Documentation (`client/src/app/(organizer)/organizer/dashboard`)

## A. Directory Overview
This directory defines the primary organizer command center (`/organizer/dashboard`). It presents high-level metrics (total hosted events, active attendees, pending cancellations), an events list with quick links to rosters and editing, and pending cancellation request reviews.

## B. Directory Structure
```text
client/src/app/(organizer)/organizer/dashboard/
├── dashboard.md         # This documentation file
└── page.tsx             # Organizer dashboard overview and cancellation approval interface
```

## C. File-by-File Documentation

### 1. `page.tsx`
- **File Type:** React Client Component (`"use client"`)
- **Primary Responsibility:** Organizer dashboard interface.
- **Features:**
  - KPI Stat Cards: Total Hosted Events, Total Attendees, Pending Cancellation Requests.
  - Pending Cancellations Section: Displays attendee cancellation requests with reasons; provides "Approve" (`POST /cancellation-requests/:id/approve`, releases seat) and "Reject" (`POST /cancellation-requests/:id/reject`) buttons.
  - Owned Events Table / Grid with action shortcuts.

## D. Child Directory Documentation
No child subdirectories exist in this directory.

## E. Related Documentation
- [Organizer Portal (`client/src/app/(organizer)/organizer/organizer.md`)](../organizer.md)
- [Organizer Route Group (`client/src/app/(organizer)/(organizer).md`)](../../(organizer).md)


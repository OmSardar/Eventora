# Playwright Test Suites Root Documentation (`client/playwright/tests`)

## A. Directory Overview
The `client/playwright/tests` directory contains the complete end-to-end (E2E) test suites for Eventora. Operating in headless Chromium via Playwright, these 17 automated tests verify full real-browser user journeys across authentication, role guards, event discovery, Free RSVPs, email confirmation alerts, organizer attendee rosters, and technical SEO metadata.

## B. Directory Structure
```text
client/playwright/tests/
├── tests.md             # This documentation file
├── authentication/      # Login journeys and demo account autofill
│   ├── authentication.md
│   └── auth.spec.ts
├── authorization/       # Route guards and role protection
│   ├── authorization.md
│   └── roleGuard.spec.ts
├── events/              # Event browsing, filters, upload controls, and Free RSVP flow
│   ├── events.md
│   ├── events.spec.ts
│   └── rsvpFlow.spec.ts
└── seo/                 # SEO metadata, OpenGraph, JSON-LD, robots.txt, sitemaps, brand icons
    ├── seo.md
    └── seoAndBranding.spec.ts
```

## C. Test Suite Summary & Metrics

| Test Suite | Spec File | Test Count | Scope |
|---|---|---|---|
| **Authentication** | [`auth.spec.ts`](authentication/authentication.md) | 2 | Organizer and Attendee demo login flows |
| **Authorization** | [`roleGuard.spec.ts`](authorization/authorization.md) | 2 | Unauthenticated and cross-role route blocks |
| **Events Discovery & Uploads**| [`events.spec.ts`](events/events.md) | 3 | Landing page, category filtering, backend banner upload UI |
| **Free RSVP Flow** | [`rsvpFlow.spec.ts`](events/events.md) | 4 | In-app alerts, atomic RSVP, Resend email notice, attendee rosters |
| **SEO & Branding** | [`seoAndBranding.spec.ts`](seo/seo.md) | 6 | Canonical URLs, OG tags, JSON-LD, robots.txt, sitemaps, brand assets |
| **Total Playwright Tests**| | **17** | **100% Passing** |

## D. Child Directory Documentation

1. **[`authentication/`](authentication/authentication.md)**: Login flows and demo credentials.
2. **[`authorization/`](authorization/authorization.md)**: Route protection and attendee/organizer barriers.
3. **[`events/`](events/events.md)**: Event catalog, backend image upload controls, and Free RSVP journeys.
4. **[`seo/`](seo/seo.md)**: Metadata, canonical tags, JSON-LD structured schemas, and brand icons.

## E. Execution Command
```bash
npm run test:e2e --prefix client
```

## F. Related Documentation
- [Playwright Root (`client/playwright/playwright.md`)](../playwright.md)
- [Client Root Documentation (`client/client_root.md`)](../../client_root.md)


# Eventora — SEO Architecture & Brand Icon Implementation

## 1. Executive Summary

This document details the complete technical SEO architecture, structured data framework, metadata strategy, dynamic sitemap/robots system, and brand icon implementation for **Eventora**.

The implementation adheres to modern Next.js App Router standards using the native Metadata API (`Metadata`, `MetadataRoute.Robots`, `MetadataRoute.Sitemap`, `generateMetadata`) without introducing unnecessary third-party SEO dependencies. All structured data strictly reflects verified platform data without fabricated reviews, ratings, or misleading business claims.

---

## 2. Technical SEO Architecture

### 2.1 Canonical URL & Metadata Base Strategy

- **Environment-Driven Domain**: Configured via `NEXT_PUBLIC_SITE_URL` with a resilient fallback in [`client/src/lib/siteConfig.ts`](file:///D:/THE%20OMS%20DEVS/WEB%20DEVS/MERN%20PROJECTS/PERSONAL/EVENTORA/client/src/lib/siteConfig.ts). Localhost is never hardcoded as the production canonical domain.
- **Root Metadata Base**: Defined in [`client/src/app/layout.tsx`](file:///D:/THE%20OMS%20DEVS/WEB%20DEVS/MERN%20PROJECTS/PERSONAL/EVENTORA/client/src/app/layout.tsx) via `metadataBase: new URL(siteUrl)`.
- **Title Template**: `%s | Eventora` with default `Eventora – Discover Events & Book Your Next Experience`. The homepage uses `title: { absolute: "Eventora – Discover Events & Book Your Next Experience" }` to prevent redundant brand appending.

### 2.2 Global Root Metadata Foundation

```typescript
export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: siteConfig.title,
    template: "%s | Eventora",
  },
  description: siteConfig.description,
  applicationName: "Eventora",
  authors: [{ name: "Eventora Team", url: siteUrl }],
  creator: "Eventora Team",
  publisher: "Eventora",
  keywords: ["events", "event booking", "RSVP platform", "ticket reservation", "tech conferences", "workshops"],
  alternates: { canonical: "/" },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: siteUrl,
    siteName: "Eventora",
    title: siteConfig.title,
    description: siteConfig.description,
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "Eventora – Discover Events & Book Your Next Experience" }],
  },
  twitter: {
    card: "summary_large_image",
    title: siteConfig.title,
    description: siteConfig.description,
    images: ["/og-image.png"],
    creator: "@eventora",
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/icon.png", type: "image/png", sizes: "512x512" },
    ],
    apple: [{ url: "/apple-icon.png", sizes: "180x180", type: "image/png" }],
  },
  manifest: "/site.webmanifest",
};
```

---

## 3. Route-by-Route Indexing & Metadata Policy

| Route | Page Purpose | Indexing Policy | Title / Metadata | Structured Data |
| :--- | :--- | :--- | :--- | :--- |
| `/` | Landing / Value Prop | `index, follow` | `Eventora – Discover Events & Book Your Next Experience` | `WebSite`, `Organization` |
| `/events` | Event Discovery Directory | `index, follow` | `Discover Upcoming Events \| Eventora` | N/A (collection view) |
| `/events/[eventId]` | Event Details & RSVP | `index, follow` (published) <br/> `noindex, nofollow` (draft/404) | Dynamic: `<Title> \| Eventora` <br/> Dynamic: `<Title> (Cancelled) \| Eventora` | `Event` (Schema.org) |
| `/login` | Attendee/Organizer Sign In | `noindex, nofollow` | `Sign In \| Eventora` | None |
| `/register` | Account Registration | `noindex, nofollow` | `Create an Account \| Eventora` | None |
| `/attendee/*` | Attendee Ticket Portal | `noindex, nofollow` | `Attendee Portal \| Eventora` | None |
| `/organizer/*` | Organizer Event Operations | `noindex, nofollow` | `Organizer Portal \| Eventora` | None |

### 3.1 Dynamic Event Metadata (`generateMetadata`)

- In [`client/src/app/(public)/events/[eventId]/page.tsx`](file:///D:/THE%20OMS%20DEVS/WEB%20DEVS/MERN%20PROJECTS/PERSONAL/EVENTORA/client/src/app/(public)/events/[eventId]/page.tsx):
  - Fetches the event server-side with Next.js ISR revalidation (`revalidate: 60`).
  - Sets canonical URL to `/events/${event._id}`.
  - Automatically appends `(Cancelled)` to title if event status is cancelled.
  - Generates Open Graph and Twitter cards using the event's uploaded banner image or Cloudinary asset.
  - Handles 404/deleted events with graceful `noindex` fallback.
  - **Attendee Privacy**: Strictly excludes attendee lists, names, and emails from all metadata and schema outputs.

---

## 4. Structured Data (JSON-LD)

Implemented via [`JsonLd.tsx`](file:///D:/THE%20OMS%20DEVS/WEB%20DEVS/MERN%20PROJECTS/PERSONAL/EVENTORA/client/src/components/seo/JsonLd.tsx) with anti-XSS serialization protection (`replace(/</g, '\\u003c')`).

### 4.1 WebSite & Organization Schema (Homepage)

```json
{
  "@context": "https://schema.org",
  "@type": "WebSite",
  "name": "Eventora",
  "url": "https://eventora.example.com",
  "description": "Discover, book, and host exceptional experiences...",
  "potentialAction": {
    "@type": "SearchAction",
    "target": {
      "@type": "EntryPoint",
      "urlTemplate": "https://eventora.example.com/events?search={search_term_string}"
    },
    "query-input": "required name=search_term_string"
  }
}
```

### 4.2 Event Schema (Individual Public Event Detail Page)

```json
{
  "@context": "https://schema.org",
  "@type": "Event",
  "name": "Global Tech Summit 2026",
  "description": "Annual conference on distributed systems and cloud architecture.",
  "startDate": "2026-12-15T09:00:00.000Z",
  "endDate": "2026-12-15T18:00:00.000Z",
  "eventStatus": "https://schema.org/EventScheduled",
  "eventAttendanceMode": "https://schema.org/OfflineEventAttendanceMode",
  "location": {
    "@type": "Place",
    "name": "Metropolis Convention Center, Hall B",
    "address": {
      "@type": "PostalAddress",
      "addressLocality": "Metropolis Convention Center, Hall B"
    }
  },
  "image": ["https://eventora.example.com/og-image.png"],
  "organizer": {
    "@type": "Organization",
    "name": "Eventora Tech Community"
  },
  "offers": {
    "@type": "Offer",
    "url": "https://eventora.example.com/events/6aeefd2023cf361e9c6b8958",
    "price": "0",
    "priceCurrency": "USD",
    "availability": "https://schema.org/InStock",
    "validFrom": "2026-11-07T10:00:00.000Z"
  }
}
```
*When confirmed bookings meet capacity, `availability` dynamically updates to `https://schema.org/SoldOut`.*

---

## 5. Dynamic Sitemap & Robots.txt

### 5.1 `/robots.txt`

Implemented in [`client/src/app/robots.ts`](file:///D:/THE%20OMS%20DEVS/WEB%20DEVS/MERN%20PROJECTS/PERSONAL/EVENTORA/client/src/app/robots.ts):

```text
User-Agent: *
Allow: /
Allow: /events
Allow: /events/*
Disallow: /login
Disallow: /register
Disallow: /attendee
Disallow: /attendee/*
Disallow: /organizer
Disallow: /organizer/*
Disallow: /api/*

Sitemap: https://eventora.example.com/sitemap.xml
```

### 5.2 `/sitemap.xml`

Implemented in [`client/src/app/sitemap.ts`](file:///D:/THE%20OMS%20DEVS/WEB%20DEVS/MERN%20PROJECTS/PERSONAL/EVENTORA/client/src/app/sitemap.ts):
- Statically includes homepage (`/`, priority `1.0`, daily) and event directory (`/events`, priority `0.9`, hourly).
- Dynamically queries public API for active events (`/events?limit=100`).
- Filters out unpublished `DRAFT` events.
- Emits absolute canonical URLs and last modified timestamps (`event.updatedAt || event.createdAt`).
- Resilient build-time error handling with fallback to static routes.

---

## 6. Favicon & Brand Icon System

Created with a modern SaaS aesthetic based on a geometric ticket beacon monogram that scales cleanly across micro (16x16) and macro (1200x630) resolutions:

| Asset | Path | Resolution | Format | Features |
| :--- | :--- | :---: | :---: | :--- |
| **Vector Favicon** | `client/public/favicon.svg` | Scalable | SVG | Dark/light browser tab adaptive via `@media (prefers-color-scheme: dark)` |
| **Multi-Res Favicon** | `client/public/favicon.ico` | 16x16, 32x32, 48x48 | Binary ICO | Real multi-frame binary ICO container |
| **Application Icon** | `client/public/icon.png` | 512x512 | PNG | High-density raster icon for PWA & modern displays |
| **Apple Touch Icon** | `client/public/apple-icon.png` | 180x180 | PNG | iOS Home Screen icon |
| **Social Open Graph** | `client/public/og-image.png` | 1200x630 | PNG | High-contrast 60fps-rendered dark canvas with brand mark, typography & value props |
| **Web Manifest** | `client/public/site.webmanifest` | N/A | JSON | PWA manifest defining application standalone mode and theme colors |

Assets were programmatically generated from vector SVG geometries using Chromium (`client/scripts/generate-assets.js`) to ensure zero distortion and valid binary PNG/ICO structures.

---

## 7. Automated Test & Verification Results

### 7.1 Playwright E2E & SEO Test Suite (`npm run test:e2e --prefix client`)

Executed in headless Chromium against production build on `http://localhost:3000`:

```text
Running 12 tests using 1 worker

  ok  1 [chromium] › auth.spec.ts: Organizer can log in with demo credentials and view dashboard (441ms)
  ok  2 [chromium] › auth.spec.ts: Attendee can log in with demo credentials and view tickets (436ms)
  ok  3 [chromium] › roleGuard.spec.ts: Unauthenticated user is restricted from organizer dashboard (245ms)
  ok  4 [chromium] › roleGuard.spec.ts: Attendee account is blocked from organizer views (463ms)
  ok  5 [chromium] › events.spec.ts: Landing page displays value proposition and featured events (329ms)
  ok  6 [chromium] › events.spec.ts: Browse events page allows filtering by category (303ms)
  ok  7 [chromium] › seoAndBranding.spec.ts: Homepage contains complete metadata, canonicals, OG tags, and JSON-LD (354ms)
  ok  8 [chromium] › seoAndBranding.spec.ts: Events listing page contains appropriate title, canonical, and social tags (265ms)
  ok  9 [chromium] › seoAndBranding.spec.ts: Authentication and private dashboard routes enforce noindex, nofollow (415ms)
  ok 10 [chromium] › seoAndBranding.spec.ts: Brand header logo links to homepage with accessible label (309ms)
  ok 11 [chromium] › seoAndBranding.spec.ts: Metadata routes and static brand assets return HTTP 200 (58ms)
  ok 12 [chromium] › seoAndBranding.spec.ts: Event detail page renders dynamic Event schema and meta without leaking attendee data (510ms)

  12 passed (5.0s)
```

### 7.2 Backend Test Suite (`npm test --prefix server`)

```text
# tests 46
# suites 10
# pass 46
# fail 0
# duration_ms 2508.6943
```

**Total Automated Suite: 58 / 58 passing (100% pass rate).**


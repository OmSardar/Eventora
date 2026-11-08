# Eventora Frontend Web Application (`client/`)

Modern, high-performance web application built with **Next.js 14 (App Router)**, **React 18**, and **TypeScript (Strict Mode)**.

---

## 1. Architecture & Framework Overview

The Eventora frontend delivers a responsive user interface for discovering events, reserving seats (Free RSVP or interactive seat selection), managing attendee tickets, reviewing in-app notifications, and providing organizers with event creation, attendee roster management, QR pass scanning, and Cloudinary media upload tools.

### Key Architectural Highlights
- **Next.js 14.2.23 App Router:** Leverages Server-Side Rendering (SSR) for catalog discovery and SEO metadata, alongside Client-Side Components (`"use client"`) for interactive flows.
- **Strict TypeScript Architecture:** Strict compiler rules (`tsconfig.json`), centralized domain types in `@/types`, and end-to-end type safety across API boundaries.
- **Monochrome Design System:** Styled using Tailwind CSS with minimal monochrome design tokens, fully theme-adaptive light and dark modes (`next-themes`), and smooth scrolling physics via **Lenis** and **GSAP ScrollTrigger**.
- **Interactive Seating Canvas:** Client-side SVG seating map supporting multi-seat selection, tier-based pricing, and real-time 10-minute hold countdown timers.
- **Calendar Pass (.ics) Download:** Native client download helper streaming RFC 5545 `.ics` calendar files directly into Google Calendar, Apple Calendar, and Outlook.
- **Camera-Based Gate Scanner:** Integrated `html5-qrcode` scanner on `/tickets/verify` allowing event organizers to validate ticket QR codes at venue check-in.

---

## 2. Directory & Route Structure

```text
client/
├── playwright/                # Playwright E2E browser automation suites
│   ├── tests/                 # Specs: auth, roleGuard, events, mobileScanner, rsvp, seating, seo
│   └── playwright.config.ts   # Multi-browser & webServer test configuration
├── public/                    # Static brand assets, favicon.svg, site.webmanifest, OG images
├── scripts/                   # Asset generation utilities (`generate-assets.js`)
├── src/
│   ├── app/                   # Next.js App Router Route Groups
│   │   ├── (attendee)/        # Attendee portal: /attendee/dashboard, /attendee/registrations
│   │   ├── (auth)/            # Auth routes: /login, /register, /verify-email, /forgot-password
│   │   ├── (organizer)/       # Organizer portal: /organizer/dashboard, /organizer/events/*
│   │   ├── (public)/          # Public routes: /, /events, /events/[eventId]
│   │   ├── settings/security/ # MFA settings: TOTP authenticator setup & recovery codes
│   │   ├── tickets/verify/    # Gate scanner check-in camera tool
│   │   ├── layout.tsx         # Root HTML layout with providers (Query, Theme, Auth)
│   │   ├── robots.ts          # Dynamic robots.txt SEO generator
│   │   └── sitemap.ts         # Dynamic sitemap.xml SEO generator
│   ├── components/            # Reusable UI component library
│   │   ├── auth/              # Role guards, login/register forms, MFA modals
│   │   ├── brand/             # Eventora logo and brand marks
│   │   ├── events/            # Event cards, catalog filters, banner upload dropzones
│   │   ├── landing/           # Hero section, feature grids, FAQ, footer
│   │   ├── layout/            # Navbar, footer, notification bell dropdown, theme toggle
│   │   ├── payments/          # Razorpay checkout modal
│   │   ├── seating/           # Interactive seat grid, legend, hold countdown
│   │   ├── tickets/           # Ticket details modal, printable pass, QR code display
│   │   └── ui/                # Minimal monochrome primitives (button, badge, card, modal, input)
│   ├── features/              # Feature-level contexts and hooks
│   │   └── authentication/    # AuthContext, session hooks, role gating
│   ├── lib/                   # Client utilities
│   │   ├── api.ts             # Centralized fetch client with CSRF token management
│   │   ├── calendar.ts        # RFC 5545 .ics calendar download helper
│   │   ├── env.ts             # Environment resolver (client vs internal SSR URLs)
│   │   ├── siteConfig.ts      # Canonical site metadata and OpenGraph configuration
│   │   └── utils.ts           # Tailwind `cn()` merger and date/time formatters
│   └── types/                 # Centralized TypeScript definitions and API contracts
├── .env.example               # Frontend environment template
├── next.config.mjs            # Image domains (Cloudinary, Unsplash) and build settings
├── package.json               # Frontend dependencies and scripts
├── tailwind.config.ts         # Tailwind theme configuration
└── tsconfig.json              # Strict TypeScript compiler options
```

---

## 3. State Management & Data Fetching

### 1. Server State (`TanStack React Query v5`)
- Used for caching, pagination, background refetching, and optimistic updates.
- Centralized query keys:
  - `["events", queryParams]` — Event discovery catalog.
  - `["event", eventId]` — Single event details and real-time seat inventory.
  - `["seating-layout", eventId]` — Physical seat layout and hold statuses.
  - `["my-registrations", user.id]` — Attendee RSVP roster.
  - `["organizer-events"]` — Organizer dashboard events.
  - `["notifications"]` & `["notifications-unread"]` — In-app alerts and badge count.

### 2. Client Session State (`AuthContext`)
- `AuthContext` provides global `user`, `isLoading`, `login()`, `logout()`, and `refreshUser()`.
- Automatically checks `/api/v1/auth/me` on mount with cookie credentials.

### 3. HTTP Client with CSRF Interception (`api.ts`)
- All mutating HTTP requests (`POST`, `PUT`, `PATCH`, `DELETE`) automatically fetch and cache a synchronizer CSRF token from `/api/v1/auth/csrf`.
- Passes `credentials: "include"` for cross-domain cookie session exchange.
- Automatically handles `401 Unauthorized` and redirect flows.

---

## 4. UI & Styling Conventions

- **Tailwind CSS + Minimalist Monochrome Design:** Built with dark-mode first design tokens using `bg-background`, `text-foreground`, and subtle border lines.
- **Accessible Primitives:** Built on Radix UI components (`@radix-ui/react-dropdown-menu`, `@radix-ui/react-select`, `@radix-ui/react-avatar`) with full keyboard navigation and ARIA attributes.
- **Lenis Smooth Scrolling:** Inertial scrolling configured in root layout, automatically disabled when `prefers-reduced-motion` is active.

---

## 5. Environment Variables

Create `.env` inside `client/` based on `client/.env.example`:

| Variable | Required | Description | Example |
|---|:---:|---|---|
| `NEXT_PUBLIC_SITE_URL` | Yes | Canonical frontend URL for metadata & OpenGraph | `https://eventora.omslabs.tech` |
| `NEXT_PUBLIC_API_URL` | Yes | Base URL for the Express REST API | `http://localhost:5000/api/v1` |
| `INTERNAL_API_URL` | No | Server-to-server API URL for Next.js SSR sitemaps | `http://localhost:5000/api/v1` |
| `NEXT_PUBLIC_RAZORPAY_KEY_ID` | Optional | Public Razorpay Key ID for browser checkout | `rzp_test_YourKeyId` |

---

## 6. Development & Build Commands

```bash
# 1. Install dependencies
cd client
npm install

# 2. Run local development server
npm run dev
# Application starts at http://localhost:3000

# 3. Run production build and type checking
npm run build
# Compiles 19 static and dynamic routes cleanly

# 4. Start production server locally
npm run start

# 5. Run ESLint code quality check
npm run lint

# 6. Run Playwright end-to-end tests
npm run test:e2e
```

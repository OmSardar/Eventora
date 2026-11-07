# Auth Route Group Documentation (`client/src/app/(auth)`)

## A. Directory Overview
The `client/src/app/(auth)` directory organizes authentication routes (`/login`, `/register`) under a shared layout shell that centers authentication cards and enforces strict crawler privacy headers.

## B. Directory Structure
```text
client/src/app/(auth)/
├── (auth).md            # This documentation file
├── layout.md            # Auth layout component
├── login/               # Login route
│   ├── login.md
│   └── page.tsx
└── register/            # Registration route
    ├── register.md
    └── page.tsx
```

## C. File-by-File Documentation

### 1. `layout.tsx`
- **File Type:** Next.js App Router Layout (`.tsx`)
- **Primary Responsibility:** Centered card container for authentication screens.
- **Exported Symbols:**
  - `metadata`: Global auth layout metadata enforcing `robots: { index: false, follow: false }`.
  - `default AuthLayout({ children })`: Shell rendering centered card container with subtle background gradients.

## D. Child Directory Documentation

1. **[`login/`](login/login.md)**: User login page with demo autofill.
2. **[`register/`](register/register.md)**: User account creation page.

## E. Related Documentation
- [App Root Documentation (`client/src/app/app.md`)](../app.md)
- [Client Root Documentation (`client/client_root.md`)](../../client_root.md)


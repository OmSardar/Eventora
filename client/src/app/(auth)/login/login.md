# Login Route Documentation (`client/src/app/(auth)/login`)

## A. Directory Overview
This directory defines the user login page route (`/login`). It renders `LoginForm` with 1-click evaluator demo account autofill buttons and enforces `noindex, nofollow` search crawler directives.

## B. Directory Structure
```text
client/src/app/(auth)/login/
├── login.md             # This documentation file
└── page.tsx             # Login route page component
```

## C. File-by-File Documentation

### 1. `page.tsx`
- **File Type:** Next.js App Router Page (`.tsx`)
- **Primary Responsibility:** Login page entry point.
- **Exported Symbols:**
  - `metadata`: `{ title: 'Sign In', robots: { index: false, follow: false } }`.
  - `default LoginPage()`: Mounts `LoginForm`.
- **Dependencies:** `LoginForm` from `@/components/auth/LoginForm`.

## D. Child Directory Documentation
No child subdirectories exist in this directory.

## E. Related Documentation
- [Auth Route Group (`client/src/app/(auth)/(auth).md`)](../(auth).md)
- [Client App Root Documentation (`client/src/app/app.md`)](../../app.md)


# Authentication Feature Documentation (`client/src/features/authentication`)

## A. Directory Overview
The `client/src/features/authentication` directory provides the client-side authentication state management layer. Implemented as a React Context provider, it initializes the current session on page load, exposes reactive authentication state (`user`, `isLoading`), and encapsulates login, registration, and logout operations.

## B. Directory Structure
```text
client/src/features/authentication/
├── authentication.md    # This documentation file
└── AuthContext.tsx      # React Context Provider (`AuthProvider`) and `useAuth` hook
```

## C. File-by-File Documentation

### 1. `AuthContext.tsx`
- **File Type:** React Client Component (`"use client"`)
- **Primary Responsibility:** Manages authenticated session state across the Next.js React tree.
- **Exported Symbols:**
  - `AuthProvider`: Context provider component wrapping child trees.
  - `useAuth()`: Custom hook accessing authentication state and action dispatchers.
- **State & Props:**
  - State: `user: User | null`, `isLoading: boolean`.
- **Exposed Methods:**
  - `login({ email, password })`: Calls `POST /auth/login`, updates `user` state, and returns user record.
  - `register(payload)`: Calls `POST /auth/register`, updates `user` state, and returns user record.
  - `logout()`: Calls `POST /auth/logout`, clears `user` state, resets CSRF token cache (`resetCsrfToken()`), and invalidates query cache.
  - `refetchUser()`: Re-queries `GET /auth/me` to refresh active session profile.
- **Dependencies:** React, `User` from `@/types`, `api`, `resetCsrfToken` from `@/lib/api`.
- **Used By:** `providers.tsx` (mounted at root), Navbar, login/register forms, role guard layouts.

## D. Child Directory Documentation
No child subdirectories exist in this directory.

## E. Internal Relationships
```mermaid
flowchart TD
    Providers["providers.tsx"] --> AuthProvider["AuthProvider (AuthContext.tsx)"]
    AuthProvider --> APIMe["GET /auth/me"]
    
    Navbar["Navbar.tsx"] -->|useAuth()| AuthProvider
    RoleGuards["Attendee/Organizer Layouts"] -->|useAuth()| AuthProvider
    LoginForm["LoginForm.tsx"] -->|login()| AuthProvider
```

## F. Execution Flow
1. App mounts `AuthProvider` in `providers.tsx`.
2. `fetchCurrentUser()` runs immediately on mount, querying `GET /auth/me`.
3. If valid session cookie exists, sets `user` state and `isLoading: false`.
4. Child routes inspect `useAuth()` to render authenticated navbars, attendee tickets, or redirect unauthorized visitors.

## G. External Dependencies and Integrations
- React Context and State hooks.
- `@/lib/api`.

## H. Important Implementation Notes
- **Cookie-Driven State:** Does not store tokens in `localStorage`. Relies strictly on HttpOnly session cookies managed by the browser.

## I. Related Documentation
- [Features Parent Directory (`client/src/features/features.md`)](../features.md)
- [Client Root Documentation (`client/client_root.md`)](../../client_root.md)


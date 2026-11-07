# Eventora Backend Application Root Documentation (`server/server_root.md`)

## 1. Application Overview
The Eventora backend is a production-grade, secure REST API engineered with Node.js 22 LTS, Express.js 4, and MongoDB Atlas (via Mongoose 8). It powers event lifecycle management, high-concurrency atomic seat reservation (RSVP), double-booking immunity, organizer attendee rosters, transactional email receipts via the Resend API, and secure backend-only Cloudinary media uploads.

The backend acts as an uncompromising security perimeter: all sessions, roles, file magic bytes, and concurrency controls are evaluated and enforced exclusively on the server.

---

## 2. Responsibilities and Architectural Boundaries
- **In Scope (Backend Responsibilities):**
  - Session lifecycle management using `express-session` backed by MongoDB (`connect-mongo`).
  - Cryptographic password hashing and verification using Argon2id.
  - Role-Based Access Control (`ATTENDEE` and `ORGANIZER` roles).
  - Event CRUD, search queries, pagination, and capacity floor enforcement.
  - High-concurrency seat reservation guarantees using conditional atomic MongoDB expressions.
  - Attendee cancellation requests and organizer approval/rejection workflows.
  - Transactional email confirmation receipts using the Resend API.
  - In-app notification creation, unread counts, and feed persistence.
  - Backend-only Cloudinary media uploads with binary magic bytes validation.
  - Multi-tier defense-in-depth: CSRF synchronizer tokens, CORS exact-origin matching, distributed MongoDB rate limiting, Helmet CSP headers.
- **Out of Scope (Frontend Responsibilities):**
  - UI state rendering, browser-level routing, animation (GSAP/Lenis), and search engine markup (SSR JSON-LD / metadata).

---

## 3. Technology Stack

| Technology | Actual Version | Responsibility in Backend |
|---|---|---|
| **Node.js** | 22 LTS (ESM) | Server runtime environment |
| **Express.js** | ^4.21.2 | HTTP web framework and routing |
| **MongoDB & Mongoose** | ^8.9.5 | Clustered database engine and Object Data Modeling (ODM) |
| **express-session** | ^1.18.1 | Stateful HTTP session management |
| **connect-mongo** | ^5.1.0 | MongoDB-backed session store with native TTL cleanup |
| **Argon2id (`argon2`)** | ^0.41.1 | OWASP-compliant password hashing algorithm |
| **Resend (`resend`)** | ^6.37.0 | Official SDK for transactional email confirmation delivery |
| **Cloudinary (`cloudinary`)**| ^2.11.0 | Official server-side SDK for media asset storage |
| **Multer (`multer`)** | ^2.5.0 | In-memory multipart/form-data upload parsing |
| **Helmet (`helmet`)** | ^8.0.0 | HTTP security headers & Restrictive CSP |
| **CORS (`cors`)** | ^2.8.5 | Cross-origin resource sharing with credentials support |
| **express-rate-limit** | ^7.5.0 | Rate limiting middleware framework |
| **Zod (`zod`)** | 3.25.76 | Runtime payload schema validation |
| **Pino (`pino`)** | ^9.6.0 | High-performance JSON logger with automated redaction |
| **Node Test Runner** | Native (Node 22) | Automated test execution framework (`node:test`) |
| **Supertest** | ^7.0.0 | HTTP integration test assertions |

---

## 4. Actual Folder Structure
```text
server/
├── server_root.md       # This root backend documentation
├── package.json         # Backend dependencies and test scripts
├── package-lock.json    # Deterministic dependency tree
├── .env.example         # Production and development environment template
├── src/                 # Application source code
│   ├── src.md           # Source root documentation
│   ├── app.js           # Express application & middleware pipeline
│   ├── server.js        # Bootstrap entry point & graceful shutdown
│   ├── infrastructure/  # External adapters, DB, logging, security, session, storage, email
│   │   └── infrastructure.md
│   ├── modules/         # Vertical slice feature modules (auth, events, registrations, notifs)
│   │   └── modules.md
│   ├── scripts/         # Database seeding and migration utilities
│   │   └── scripts.md
│   └── shared/          # Shared kernel (constants, errors, middleware, validation)
│       └── shared.md
└── tests/               # Test pyramid (Unit, Integration, Security)
    └── tests.md
```

---

## 5. Direct Child Files and Directory Breakdown

### Files
- **[`package.json`](file:///d:/THE%20OMS%20DEVS/WEB%20DEVS/MERN%20PROJECTS/PERSONAL/EVENTORA/server/package.json):** Declares backend metadata, production dependencies, test commands (`test`, `test:unit`, `test:integration`, `test:security`), and specifies `"type": "module"` and `"main": "src/server.js"`.
- **[`package-lock.json`](file:///d:/THE%20OMS%20DEVS/WEB%20DEVS/MERN%20PROJECTS/PERSONAL/EVENTORA/server/package-lock.json):** Exact pinned dependency versions supporting `npm ci`.
- **[`.env.example`](file:///d:/THE%20OMS%20DEVS/WEB%20DEVS/MERN%20PROJECTS/PERSONAL/EVENTORA/server/.env.example):** Comprehensive documentation of required environment variables.

### Directories
- **[`src/`](src/src.md):** Express application, server entry point, domain modules, infrastructure clients, and shared utilities.
- **[`tests/`](tests/tests.md):** 68 automated backend tests structured across unit, integration, and security suites.

---

## 6. Architecture and Internal Organization

Eventora is structured as a **Modular Monolith** employing **Vertical Slice Architecture** alongside a well-defined **Shared Kernel**.

```mermaid
flowchart TD
    subgraph Slices ["Vertical Feature Slices (server/src/modules)"]
        Auth["authentication/"]
        Events["events/"]
        Regs["registrations/"]
        Notifs["notifications/"]
        Users["users/"]
        Audit["audit/"]
    end

    subgraph Kernel ["Shared Kernel (server/src/shared)"]
        Middleware["middleware/ (Auth, CSRF, RateLimit, Upload, Errors)"]
        Validation["validation/ (Zod, Magic Bytes)"]
        Errors["errors/ (AppError hierarchy)"]
        Constants["constants/ (roles, status)"]
    end

    subgraph Infra ["Infrastructure Layer (server/src/infrastructure)"]
        DB["database/ (MongoDB Mongoose)"]
        SessionStore["session/ (MongoStore)"]
        SecurityTools["security/ (Argon2id, MongoRateLimitStore)"]
        EmailService["email/ (Resend API)"]
        MediaService["cloudinary/ (Server Cloudinary SDK)"]
        Logger["logging/ (Pino)"]
    end

    Slices --> Kernel
    Slices --> Infra
    Kernel --> Infra
```

---

## 7. Database Entity Relationships (ER Diagram)

```mermaid
erDiagram
    User ||--o{ Event : "organizes"
    User ||--o{ Registration : "books (attendee)"
    User ||--o{ Notification : "receives"
    Event ||--o{ Registration : "allocates seats for"
    Event ||--o{ Notification : "triggers"
    Registration ||--o{ Notification : "references"

    User {
        ObjectId _id PK
        string name
        string email
        string normalizedEmail UK
        string passwordHash
        string role "ATTENDEE | ORGANIZER (immutable)"
        Date createdAt
    }

    Event {
        ObjectId _id PK
        string title
        string description
        Date eventDate
        string venue
        number seatLimit
        number seatsBooked
        ObjectId organizerId FK
        string status "DRAFT | PUBLISHED | CANCELLED"
        string category
        object image "source, url, publicId, format, width, height, bytes"
    }

    Registration {
        ObjectId _id PK
        ObjectId eventId FK
        ObjectId attendeeId FK
        string status "CONFIRMED | CANCELLATION_REQUESTED | CANCELLED | REJECTED"
        string cancellationReason
        string decisionNote
        boolean confirmationEmailSent
        Date createdAt
    }

    Notification {
        ObjectId _id PK
        ObjectId userId FK
        string type
        string channel "IN_APP"
        string title
        string message
        ObjectId eventId FK
        ObjectId registrationId FK
        boolean isRead
        Date createdAt
    }
```

---

## 8. Critical Request and Execution Lifecycles

### 8.1 Express Middleware Lifecycle
```mermaid
sequenceDiagram
    autonumber
    participant Client as HTTP Client
    participant App as Express Pipeline (app.js)
    participant Rate as rateLimiter.js (MongoDB)
    participant Sec as securityMiddleware.js
    participant Auth as authMiddleware.js
    participant Val as validate.js / uploadMiddleware.js
    participant Handler as Route Controller
    participant Err as errorHandler.js

    Client->>App: Incoming Request (Cookie, Headers, Body)
    App->>App: trust proxy -> Helmet -> CORS -> cookieParser -> MongoStore
    App->>App: requestCorrelation -> sessionExpiryMiddleware
    App->>Rate: Check MongoDB distributed rate quota
    alt Rate Quota Exceeded
        Rate-->>Client: 429 Too Many Requests (Retry-After)
    end
    App->>Sec: originCheckMiddleware & verifyCsrfToken
    alt CSRF or Origin Check Fails
        Sec-->>Client: 403 Forbidden
    end
    App->>Auth: requireAuth & requireRole (if route is protected)
    alt Unauthenticated or Role Mismatch
        Auth-->>Client: 401 Unauthorized / 403 Forbidden
    end
    App->>Val: validate(Zod) / handleBannerUpload (Multer)
    alt Invalid Schema or Magic Bytes
        Val-->>Client: 400 Bad Request
    end
    App->>Handler: Execute Controller & Domain Service
    Handler-->>Client: 200 / 201 Success Response
    opt Unexpected Exception Thrown
        Handler->>Err: next(err)
        Err-->>Client: Formatted RFC Error Envelope
    end
```

### 8.2 Atomic Registration and Resend Email Receipt Flow
```mermaid
sequenceDiagram
    autonumber
    actor Attendee as Attendee Browser
    participant RegCtrl as registrationController.js
    participant RegSvc as registrationService.js
    participant DB as MongoDB Atlas
    participant Email as emailService.js
    participant Resend as Resend API

    Attendee->>RegCtrl: POST /events/:eventId/registrations (X-CSRF-Token)
    RegCtrl->>RegSvc: registerForEvent({ eventId, attendeeId })
    
    Note over RegSvc,DB: Atomic Conditional Reservation
    RegSvc->>DB: Event.findOneAndUpdate({ _id, status: 'PUBLISHED', $expr: { $lt: ['$seatsBooked', '$seatLimit'] } }, { $inc: { seatsBooked: 1 } })
    
    alt Event Sold Out
        DB-->>RegSvc: null (no document modified)
        RegSvc-->>RegCtrl: throw BadRequestError('Event is sold out.')
        RegCtrl-->>Attendee: 400 Bad Request
    else Seat Available
        DB-->>RegSvc: Updated Event Document
        RegSvc->>DB: Registration.create({ eventId, attendeeId, status: 'CONFIRMED' })
        alt Duplicate Registration Collision (E11000)
            DB-->>RegSvc: DuplicateKeyError
            RegSvc->>DB: Event.updateOne({ _id }, { $inc: { seatsBooked: -1 } }) (Rollback)
            RegSvc-->>RegCtrl: throw ConflictError('Already registered.')
            RegCtrl-->>Attendee: 409 Conflict
        else Registration Persisted
            DB-->>RegSvc: Confirmed Registration
            RegSvc-->>RegCtrl: Success Response
            RegCtrl-->>Attendee: 201 Created { registration }
            
            Note over RegSvc,Email: Non-Blocking Transactional Receipt
            RegSvc->>Email: sendRegistrationConfirmationEmail(async)
            Email->>DB: findOneAndUpdate({ _id, confirmationEmailSent: false }, { $set: true })
            alt Atomic Lock Acquired
                Email->>Resend: emails.send({ to: attendee.email, html, text })
                Resend-->>Email: 200 OK (id: msg_12345)
            end
        end
    end
```

### 8.3 Backend-Only Cloudinary Upload Flow
```mermaid
sequenceDiagram
    autonumber
    actor Organizer as Organizer Browser
    participant Client as Next.js Frontend
    participant Route as eventRoutes.js
    participant Mid as uploadMiddleware.js (Multer)
    participant Svc as eventService.js
    participant Val as fileValidation.js
    participant Cloud as Cloudinary Server SDK
    participant DB as MongoDB Atlas

    Organizer->>Client: Selects banner image (JPEG/PNG/WebP)
    Client->>Route: POST /api/v1/events/:eventId/banner (multipart/form-data)
    Route->>Route: Authenticate -> requireOrganizer -> rateLimiter -> csrfProtection
    Route->>Mid: handleBannerUpload (MemoryStorage, max 5MB)
    Mid->>Svc: uploadEventBanner({ eventId, file.buffer })
    Svc->>DB: Verify event ownership (event.organizerId === user._id)
    Svc->>Val: validateImageBuffer(buffer, declaredMimeType)
    Note over Val: Inspects cryptographic magic bytes.<br/>Rejects SVG, HTML, executables, scripts, and spoofed MIME types.
    Svc->>Cloud: upload_stream({ public_id: 'eventora/events/banner_...' })
    Cloud-->>Svc: { secure_url, public_id, width, height, bytes, format }
    Svc->>DB: Save image subdocument in Event model
    alt DB Save Succeeds
        opt Previous Banner Existed
            Svc->>Cloud: Destroy previous asset (uploader.destroy)
        end
        Svc-->>Client: 200 OK { success: true, data: { image } }
    else DB Save Fails
        Svc->>Cloud: Destroy newly uploaded asset (rollback cleanup)
        Svc-->>Client: 500 Error
    end
```

---

## 9. Configuration and Environment Variables

| Variable | Purpose | Required | Sensitive |
|---|---|---|---|
| `PORT` | HTTP port listener (default: 5000) | No | No |
| `NODE_ENV` | `development`, `test`, or `production` | Yes | No |
| `LOG_LEVEL` | Pino logging threshold (`info`, `debug`, `warn`, `error`) | No | No |
| `MONGODB_URI` | MongoDB Atlas Replica Set connection URI | **Yes** | **Yes** |
| `SESSION_SECRET` | 32+ character random string for signing session cookies | **Yes** | **Yes** |
| `ALLOWED_ORIGINS` | Comma-separated trusted frontend origins for CORS | **Yes** | No |
| `APP_BASE_URL` | Canonical frontend domain for digital ticket links in emails | **Yes** | No |
| `RESEND_API_KEY` | Official Resend API Key for transactional receipts | **Yes** | **Yes** |
| `EMAIL_FROM` | Verified sender address (e.g. `Eventora <onboarding@resend.dev>`) | **Yes** | No |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary account name | **Yes** | No |
| `CLOUDINARY_API_KEY` | Cloudinary server API key | **Yes** | **Yes** |
| `CLOUDINARY_API_SECRET` | Cloudinary server API secret (never sent to client) | **Yes** | **Yes** |

---

## 10. Testing Architecture
The backend is verified by **68 automated tests** passing at 100%:
- **11 Unit Tests (`npm run test:unit --prefix server`):** Argon2id cryptography, Zod schema validation, Resend email HTML and plain-text template interpolation.
- **13 Integration Tests (`npm run test:integration --prefix server`):** Concurrent flash crowds competing for the final remaining seat, past-event rejection, capacity floor protection, in-app notification state, Resend email deduplication, and error isolation.
- **44 Security Tests (`npm run test:security --prefix server`):** Synchronizer CSRF tokens, Origin header enforcement, RBAC guards, session timeouts, privacy boundaries, distributed rate limiting, and 15 image upload test cases (magic bytes, SVG Stored XSS blocking, executable rejection, MIME spoofing defense, asset replacement, rollback cleanup).

---

## 11. Links to Directory-Level Documentation
- **[Source Root Documentation (`server/src/src.md`)](src/src.md)**
- **[Shared Kernel Documentation (`server/src/shared/shared.md`)](src/shared/shared.md)**
  - [`constants/`](src/shared/constants/constants.md)
  - [`errors/`](src/shared/errors/errors.md)
  - [`middleware/`](src/shared/middleware/middleware.md)
  - [`validation/`](src/shared/validation/validation.md)
- **[Infrastructure Documentation (`server/src/infrastructure/infrastructure.md`)](src/infrastructure/infrastructure.md)**
  - [`cloudinary/`](src/infrastructure/cloudinary/cloudinary.md)
  - [`database/`](src/infrastructure/database/database.md)
  - [`email/`](src/infrastructure/email/email.md)
  - [`logging/`](src/infrastructure/logging/logging.md)
  - [`security/`](src/infrastructure/security/security.md)
  - [`session/`](src/infrastructure/session/session.md)
  - [`storage/`](src/infrastructure/storage/storage.md)
- **[Domain Modules Documentation (`server/src/modules/modules.md`)](src/modules/modules.md)**
  - [`audit/`](src/modules/audit/audit.md)
  - [`authentication/`](src/modules/authentication/authentication.md)
  - [`events/`](src/modules/events/events.md)
  - [`notifications/`](src/modules/notifications/notifications.md)
  - [`registrations/`](src/modules/registrations/registrations.md)
  - [`users/`](src/modules/users/users.md)
- **[Scripts Documentation (`server/src/scripts/scripts.md`)](src/scripts/scripts.md)**
- **[Tests Documentation (`server/tests/tests.md`)](tests/tests.md)**
  - [`unit/`](tests/unit/unit.md)
  - [`integration/`](tests/integration/integration.md)
  - [`security/`](tests/security/security.md)

---

## 12. Architectural Decisions and Trade-offs

1. **Stateful Sessions vs Stateless JWTs:**
   - *Decision:* Used `express-session` with `connect-mongo` and `HttpOnly` cookies.
   - *Rationale:* Eliminates the risk of token theft from browser `localStorage`. Allows instant server-side revocation on logout or timeout.
   - *Trade-off:* Requires database lookups for session resolution, mitigated via connection pooling and `touchAfter: 10 * 60` lazy timestamp updates.

2. **Atomic In-Database Concurrency vs Distributed Locks:**
   - *Decision:* Used MongoDB conditional atomic updates with `$expr: { $lt: ['$seatsBooked', '$seatLimit'] }`.
   - *Rationale:* Avoids introducing external Redis infrastructure while providing hardware-level document locking guarantees against overselling.

3. **Backend-Only Cloudinary Integration:**
   - *Decision:* All images uploaded as `multipart/form-data` to Express backend.
   - *Rationale:* Guarantees that clients never hold Cloudinary secrets or upload presets, and enables server-side binary magic-byte inspection (blocking SVGs and executables).
   - *Trade-off:* Image bytes traverse the backend server, mitigated by 5MB payload caps and memory buffering.


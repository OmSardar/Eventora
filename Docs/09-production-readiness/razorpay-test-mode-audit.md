# Eventora — Razorpay Test Mode Integration Audit

**Date:** November 7, 2026  
**Auditor:** Senior Software Architect, Security Engineer & Payment Systems Auditor  
**Project:** Eventora (Production Event Booking and RSVP Platform)  
**Target Environment:** Razorpay Test Mode (Render Backend & Vercel Frontend)  
**Audit Status:** COMPLETE — READ-ONLY INSPECTION PERFORMED  

---

## 1. Executive Summary & Current Implementation Status

This audit evaluates the codebase of **Eventora** to determine its readiness for reintroducing **Razorpay Test Mode** payment workflows for technical interview demonstration.

### High-Level Status:
- **Commercial Payments & Razorpay Integration Status:** **COMPLETELY ABSENT (PURGED)**.
- **Current Operational Scope:** Strictly a **Free RSVP Platform with limited capacity management** and **Resend transactional email confirmations**.
- **Razorpay Webhook Endpoint Status:** **DOES NOT EXIST**. There is no route registered on the Express server to receive incoming webhook events.
- **Webhook Ingestion Feasibility on Current Deployment:** **INCOMPATIBLE / BLOCKED**. Even if an external webhook request is dispatched to the backend, it will fail with `404 Not Found` (no route) or `403 Forbidden` due to global production `originCheckMiddleware` enforcing browser `Origin`/`Referer` headers.

---

## 2. Inventory of Existing vs. Missing Payment Files

### A. Existing Payment-Related Files
A comprehensive repository search for `razorpay` and `payment` identified **zero active payment runtime files**.
The only remaining references exist in:
1. Historical audit documentation (`Docs/09-production-readiness/scope-correction-and-email-audit.md`, `Docs/09-production-readiness/system-audit.md`, `Docs/09-production-readiness/final-checklist.md`).
2. Out-of-scope notices in [`README.md`](file:///d:/THE%20OMS%20DEVS/WEB%20DEVS/MERN%20PROJECTS/PERSONAL/EVENTORA/README.md) ("Paid ticketing and payment gateways intentionally omitted to maintain focused Free RSVP scope").
3. Playwright E2E assertion verifying that organizer attendee tables render *without* payment columns (`rsvpFlow.spec.ts`).

### B. Missing Files & Modules Required for Razorpay Restoration
To restore Razorpay Test Mode, the following modules and files (which previously existed in commit `231e1a6` before scope cleanup) must be reconstructed:

| Missing File / Module | Responsibility |
|---|---|
| `server/src/modules/payments/razorpayService.js` | Official Razorpay SDK initialization, order creation, checkout signature verification, webhook signature verification, and refunds. |
| `server/src/modules/payments/Payment.js` | Mongoose schema tracking order ID, payment ID, amount in paise, currency, status, refund status, and idempotency key. |
| `server/src/modules/payments/SeatReservation.js` | Temporary seat hold model (TTL/expiration-based) preventing overselling during checkout. |
| `server/src/modules/payments/webhook/WebhookEvent.js` | Webhook deduplication model recording incoming event IDs, payloads, processing statuses, and timestamps. |
| `server/src/modules/payments/webhook/webhookService.js` | Idempotent event dispatcher processing `payment.captured`, `payment.failed`, `refund.processed`, and `refund.failed`. |
| `server/src/modules/payments/webhook/razorpayWebhookController.js` | Express handler extracting raw buffer signature and routing verified events to `webhookService`. |
| `server/src/modules/payments/paymentController.js` | REST controllers for order creation (`/create-order`), checkout verification (`/verify`), and payment history (`/me`). |
| `server/src/modules/payments/paymentRoutes.js` | Express router wiring attendee endpoints with CSRF and rate limiting. |
| `server/src/modules/payments/paymentValidation.js` | Zod validation schemas for order creation and verification payloads. |
| `client/src/components/payments/RazorpayCheckoutModal.tsx` | Next.js client component dynamically loading `checkout.js`, opening modal, and handling test-mode verification. |
| `server/tests/unit/paymentsAndPricing.test.js` | Unit test suite for paise calculations, HMAC verification, and mock gateway behavior. |
| `server/tests/integration/paymentsAndHolds.test.js` | Integration test suite for atomic seat holds, order creation, webhook ingestion, and duplicate delivery prevention. |

---

## 3. Backend Routing & Middleware Audit

### A. API Base Path
In [`server/src/app.js`](file:///d:/THE%20OMS%20DEVS/WEB%20DEVS/MERN%20PROJECTS/PERSONAL/EVENTORA/server/src/app.js), the Express application registers API routes under the `/api/v1` namespace:
- `/api/v1/auth` (`authRoutes.js`)
- `/api/v1/events` (`eventRoutes.js`)
- `/api/v1/notifications` (`notificationRoutes.js`)
- `/api/v1` (`registrationRoutes.js` -> `/events/:eventId/registrations`, `/registrations/me`, etc.)
- `/api/v1/health` and `/health` (Health check endpoint)

### B. Webhook Endpoint Status
- **Does a Razorpay webhook route currently exist?** **NO.**
- **Exact HTTP Method:** None registered.
- **Exact URL Path:** None registered.
- Any request sent to `/api/v1/webhooks/razorpay` currently falls through to line 107 of [`server/src/app.js`](file:///d:/THE%20OMS%20DEVS/WEB%20DEVS/MERN%20PROJECTS/PERSONAL/EVENTORA/server/src/app.js):
  ```javascript
  app.use('*', (req, _res, next) => {
    next(new NotFoundError(`Route ${req.method} ${req.originalUrl} not found`));
  });
  ```
  Resulting in an immediate `404 Not Found` JSON error response.

### C. Request Body Parsing & Raw Buffer Preservation
In [`server/src/app.js`](file:///d:/THE%20OMS%20DEVS/WEB%20DEVS/MERN%20PROJECTS/PERSONAL/EVENTORA/server/src/app.js) lines 66–73:
```javascript
// Limit JSON request body size and preserve raw buffer for webhook signature validation
app.use(
  express.json({
    limit: '50kb',
    verify: (req, _res, buf) => {
      req.rawBody = buf.toString('utf8');
    }
  })
);
```
- **Finding:** The backend **already preserves the raw UTF-8 body string** on `req.rawBody`.
- **Caveat:** `express.json()` parses the JSON body *and* populates `req.rawBody`. While suitable for webhook signature checking, the payload size is capped at `50kb`. Razorpay webhook payloads are typically 2–10 KB, which fits within this limit.

### D. Security Middleware Conflict (Critical Vulnerability for Webhooks)
In [`server/src/app.js`](file:///d:/THE%20OMS%20DEVS/WEB%20DEVS/MERN%20PROJECTS/PERSONAL/EVENTORA/server/src/app.js) line 85:
```javascript
// Origin validation for state-changing HTTP methods
app.use(originCheckMiddleware);
```
And in [`server/src/shared/middleware/securityMiddleware.js`](file:///d:/THE%20OMS%20DEVS/WEB%20DEVS/MERN%20PROJECTS/PERSONAL/EVENTORA/server/src/shared/middleware/securityMiddleware.js) lines 67–70:
```javascript
// In production or browser clients, state-changing requests must include Origin or Referer
if (process.env.NODE_ENV === 'production') {
  return next(new ForbiddenError('Missing Origin or Referer header on state-changing request'));
}
```
- **Finding:** In production (`NODE_ENV=production`), `originCheckMiddleware` runs globally on **all** non-safe HTTP methods (POST, PUT, PATCH, DELETE).
- **Impact on Razorpay Webhooks:** Razorpay webhooks are direct server-to-server HTTP POST dispatches from Razorpay's infrastructure (`edge.razorpay.com`). They **never send browser `Origin` or `Referer` headers**.
- **Audit Verdict:** If a webhook endpoint is mounted after `app.use(originCheckMiddleware)`, **100% of production webhooks will be rejected with HTTP 403 Forbidden**.
- **Requirement:** When implementing the webhook endpoint, it **must** either be mounted *before* `originCheckMiddleware` or explicitly exempted from origin verification.

### E. CSRF & Session Isolation
- `csrfProtection` middleware must **not** be applied to the webhook endpoint.
- Webhook endpoints must be completely stateless and publicly reachable without session cookies.

---

## 4. Database Model Audit

| Model | Exists? | Current Schema & Relationships | Changes Required for Razorpay Restoration |
|---|---|---|---|
| **`Event`** | **YES** | Tracks `seatLimit`, `seatsBooked`, `organizerId`, `status`, `category`, `image`, `bannerUrl`. | Add optional `isPaid: Boolean` (default: false), `ticketPrice: Number` (in INR), and `currency: String` (default: 'INR'). Ensure free events remain unimpacted. |
| **`Registration`** | **YES** | Tracks `eventId`, `attendeeId`, `status` (`CONFIRMED`, `CANCELLATION_REQUESTED`, `CANCELLED`), `confirmationEmailSent`. Unique compound index on `{ eventId, attendeeId }`. | Add optional `paymentId: ObjectId (ref: 'Payment')`, `isPaid: Boolean`, `ticketPrice: Number`, `currency: String`, `refundStatus: String`. |
| **`Payment`** | **NO** | Missing. | Recreate schema: `orderId` (unique), `paymentId` (indexed), `amount` (paise), `currency`, `status` (`CREATED`, `CAPTURED`, `FAILED`, `REFUNDED`), `refundStatus`, `idempotencyKey` (unique), `attendeeId`, `eventId`, `registrationId`. |
| **`WebhookEvent`** | **NO** | Missing. | Recreate schema: `eventId` (unique), `eventType`, `provider` ('RAZORPAY'), `status` (`RECEIVED`, `PROCESSED`, `FAILED`), `payload`, `processedAt`. |
| **`SeatReservation`** | **NO** | Missing. | Recreate schema: `eventId`, `attendeeId`, `orderId` (unique), `status` (`PENDING`, `CONFIRMED`, `CANCELLED`, `EXPIRED`), `expiresAt` (TTL index). |

---

## 5. Business Workflow & Feature Gap Analysis

| Workflow Feature | Supported Currently? | Current Mechanism / Reason |
|---|---|---|
| **Free Event Registration** | **YES** | Atomic `$inc: { seatsBooked: 1 }` via `Event.findOneAndUpdate`, idempotent deduplication, Resend confirmation email. |
| **Paid Event Registration** | **NO** | Event creation and registration models reject or ignore pricing data. |
| **Razorpay Order Creation** | **NO** | No SDK or `/api/v1/payments/create-order` endpoint. |
| **Temporary Seat Holds** | **NO** | No reservation model; seats are only booked permanently during free registration. |
| **Razorpay Standard Checkout** | **NO** | Frontend `EventDetailView.tsx` only renders "Confirm My RSVP" button. No `checkout.js` integration. |
| **Payment Signature Verification** | **NO** | No HMAC-SHA256 verification routine for `order_id + '|' + payment_id`. |
| **Captured Payment Verification** | **NO** | Neither synchronous verify endpoint nor asynchronous webhook listener exists. |
| **Booking Confirmation** | **Partial** | Confirms free registrations. Cannot confirm paid bookings. |
| **Payment Failure Handling** | **NO** | No handling for modal dismissals, network dropouts, or gateway card declines. |
| **Duplicate Webhook Prevention**| **NO** | No `WebhookEvent` model or deduplication table. |
| **Refund Processing** | **NO** | Organizer cancellation approval only decrements `seatsBooked`; does not invoke `payments.refund()`. |

---

## 6. Production & Deployment Configuration Audit

### A. Environment Configuration (`server/.env.example` & `render.yaml`)
Current variables declared in `server/.env.example`:
- `PORT`
- `NODE_ENV`
- `LOG_LEVEL`
- `MONGODB_URI`
- `ALLOWED_ORIGINS`
- `APP_BASE_URL`
- `SESSION_SECRET`
- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`
- `RESEND_API_KEY`
- `EMAIL_FROM`

In [`render.yaml`](file:///d:/THE%20OMS%20DEVS/WEB%20DEVS/MERN%20PROJECTS/PERSONAL/EVENTORA/render.yaml), the service definition `eventora-api` does **not** declare any Razorpay variables.

### B. Required Razorpay Environment Variables for Test Mode

```env
# ==============================================================================
# RAZORPAY TEST MODE CONFIGURATION
# ==============================================================================
# Key ID (Public): Identifies your Razorpay account in Test Mode (starts with rzp_test_)
RAZORPAY_KEY_ID=rzp_test_YourTestKeyIdHere

# Key Secret (Private): Used by backend for API calls and Standard Checkout HMAC verification
RAZORPAY_KEY_SECRET=YourTestKeySecretHere

# Webhook Secret (Private): Configured in Razorpay Dashboard -> Webhooks.
# Used exclusively to verify X-Razorpay-Signature on incoming webhook payloads.
RAZORPAY_WEBHOOK_SECRET=YourDeveloperChosenWebhookSecretHere
```

> [!IMPORTANT]
> **Distinction Between Key Secret and Webhook Secret:**
> 1. `RAZORPAY_KEY_SECRET`: Generated automatically by Razorpay when generating API keys in the dashboard. Used for authenticating SDK requests (Orders API, Refunds API) and verifying the frontend checkout callback signature (`orderId|paymentId`).
> 2. `RAZORPAY_WEBHOOK_SECRET`: A string **chosen and entered by the developer** when registering a webhook endpoint under **Account & Settings → Webhooks**. It is **not** the API key secret. Using `RAZORPAY_KEY_SECRET` to verify webhooks will cause all webhook signature verifications to fail.

---

## 7. Required Razorpay Webhook Event Types

When configuring the webhook on the Razorpay Dashboard in Test Mode, the following **4 event types** must be subscribed to:

1. **`payment.captured`**:
   - Dispatched when an attendee successfully completes payment.
   - Crucial for asynchronous booking confirmation if the user closes their browser before the frontend callback completes.
2. **`payment.failed`**:
   - Dispatched when a payment transaction fails at the gateway, bank, or card level.
   - Allows releasing any temporary seat reservation and notifying the attendee.
3. **`refund.processed`**:
   - Dispatched when an organizer approves an attendee's cancellation request and the refund is successfully credited by Razorpay.
   - Updates the registration status to `CANCELLED` and releases the seat.
4. **`refund.failed`**:
   - Dispatched if an automated refund fails.
   - Dispatches administrative alerts for manual banking reconciliation.

---

## 8. Webhook Security Architecture Requirements

```
                       INCOMING WEBHOOK REQUEST
                                 │
                   POST /api/v1/webhooks/razorpay
                                 │
                 ┌───────────────┴───────────────┐
                 ▼                               ▼
       [Origin Check Bypass]           [CSRF Check Bypass]
      (Server-to-server call)       (Public stateless endpoint)
                 │                               │
                 └───────────────┬───────────────┘
                                 ▼
                     Extract Raw Body & Signature
                 `req.rawBody` & `X-Razorpay-Signature`
                                 │
                                 ▼
                 HMAC-SHA256 Cryptographic Verification
               expected = HMAC_SHA256(rawBody, WEBHOOK_SECRET)
                 crypto.timingSafeEqual(expected, actual)
                                 │
                 ┌───────────────┴───────────────┐
                 │                               │
             [Valid]                         [Invalid]
                 │                               │
                 ▼                               ▼
     Deduplicate via WebhookEvent         HTTP 400 Bad Request
        `findOne({ eventId })`            (Log security alert)
                 │
                 ▼
        Process Event Types
    (`payment.captured`, etc.)
                 │
                 ▼
        HTTP 200 { status: 'ok' }
```

1. **Raw Body Buffer**: Must use the unparsed raw request buffer for computing the HMAC digest.
2. **Timing-Safe Comparison**: Must use `crypto.timingSafeEqual` to eliminate timing side-channel attacks.
3. **Idempotency Deduplication**: Must write the `eventId` to MongoDB before processing to guarantee exactly-once execution during Razorpay automatic retries.
4. **Fast Acknowledgment**: Return HTTP 200 within 5 seconds to prevent Razorpay from treating the delivery as timed-out and queueing aggressive exponential retries.

---

## 9. Render Deployment & Exact Webhook URL Status

### A. Current Status
Because the endpoint has not yet been registered in `app.js`, **no valid webhook URL currently exists on the deployed Render instance**.

### B. Projected Canonical Webhook URL
When the feature is restored, the backend service deployed on Render (`eventora-api`) will expose the webhook at:

```
https://<YOUR-RENDER-BACKEND-DOMAIN>.onrender.com/api/v1/webhooks/razorpay
```

*(For example: `https://eventora-backend.onrender.com/api/v1/webhooks/razorpay`)*

> [!CAUTION]
> **Action Notice for Razorpay Dashboard Configuration:**  
> **DO NOT** configure or save the webhook URL in the Razorpay Dashboard right now. If configured prior to implementing the route and deploying it to Render, Razorpay's initial validation ping / delivery test will receive a **404 Not Found** or **403 Forbidden**, causing the webhook to be marked as failed or disabled.
> 
> The webhook endpoint must be created, deployed to Render, and verified before activating the webhook in the Razorpay Dashboard.


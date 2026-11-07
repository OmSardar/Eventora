# Distributed Rate Limiting & Abuse Prevention Policy — Eventora

## 1. Architectural Overview

Eventora implements distributed, shared-state rate limiting across all public and authenticated endpoints using a centralized MongoDB collection (`rate_limits`). No in-memory rate limiting state is maintained, guaranteeing consistent policy enforcement across multiple server instances (e.g. Render autoscaling instances or horizontal containers).

```text
Incoming HTTP Request
       │
       ▼
Extract Client IP (X-Forwarded-For) & Session User ID
       │
       ▼
Generate Distributed Bucket Key:
  - Authenticated: `prefix:u:<userId>:<ip>`
  - Unauthenticated: `prefix:ip:<ip>`
       │
       ▼
Atomic MongoDB `$inc` & `$gt` Window Evaluation in `rate_limits`
       │
   ┌───┴────────────────────────┐
   │                            │
Hits <= Threshold           Hits > Threshold
   │                            │
   ▼                            ▼
Proceed to Handler          Set `Retry-After: <seconds>`
                            Audit Log Event (PII-redacted)
                            Return HTTP 429 Too Many Requests
```

---

## 2. Configured Endpoint Tiers & Thresholds

| Scope / Prefix | Window Duration | Max Requests | Target Endpoints | Primary Protection |
|---|---|---|---|---|
| **Global (`api:`)** | 15 minutes | 300 requests | All `/api/v1/*` routes | Infrastructure DDoS & crawler flood mitigation |
| **Auth (`auth:`)** | 15 minutes | 15 requests | `/auth/login`, `/auth/register` | Credential stuffing, brute force, account enumeration |
| **Event Mutation (`event_mutate:`)** | 15 minutes | 30 requests | `POST /events`, `PATCH /events/:id`, `POST /events/:id/cancel` | Event spamming, capacity manipulation, database write amplification |
| **Booking RSVP (`booking:`)** | 1 minute | 30 requests | `POST /events/:id/registrations` | High-frequency seat hoarding bots, reservation race attempts |
| **Cancellation (`cancellation:`)** | 15 minutes | 30 requests | `POST .../cancellation-request`, `POST .../approve`, `POST .../reject` | Organizer review queue flooding, seat oscillation attacks |
| **Upload Signature (`upload_sig:`)** | 15 minutes | 20 requests | `POST /events/image-signature` | Cloudinary storage quota abuse, unsigned asset injection |

---

## 3. Security Design Decisions

### 3.1 Per-Account Isolation with No Denial-of-Service Lockout
- Unauthenticated endpoints (such as login) rate limit by **Client IP** (`auth:ip:<ip>`) rather than user email. This prevents malicious actors from locking out legitimate victims by intentionally sending incorrect passwords for their email address.
- Authenticated endpoints incorporate the authenticated **User ID** (`prefix:u:<userId>:<ip>`), ensuring that users on shared networks (NATs, offices, universities) are evaluated independently without cross-user interference.

### 3.2 Automatic TTL Cleanup in MongoDB
- Every rate-limit bucket document contains an `expiresAt` timestamp set to `now + windowMs`.
- A background MongoDB TTL index automatically purges expired records:
  ```javascript
  db.collection('rate_limits').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  ```
- No cron jobs or manual table truncation required.

### 3.3 HTTP 429 Header Compliance & Safe Logging
- Exceeded requests receive standard HTTP `429 Too Many Requests`.
- A standard `Retry-After: <seconds>` header is returned indicating when the client may retry.
- Rate limit violations are logged at `WARN` level via Pino with IP, user ID, and path, but never leak request bodies, passwords, or session tokens.


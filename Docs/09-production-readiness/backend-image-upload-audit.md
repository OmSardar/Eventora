# Backend-Only Cloudinary Image Upload Architecture & Security Audit

## Executive Summary

Eventora enforces a strict **zero-client-credential, backend-only image upload architecture**. The Next.js frontend has been completely decoupled from Cloudinary: it possesses zero Cloudinary API credentials, imports zero Cloudinary client libraries, makes zero direct network requests to `api.cloudinary.com`, and performs zero client-side signature generation.

All event banner uploads are submitted as standard `multipart/form-data` directly to the Eventora Express backend (`/api/v1/events/:eventId/banner` or `/api/v1/events/banner`). The backend serves as an uncompromising security boundary, verifying authentication, enforcing `ORGANIZER` role authorization, ensuring event ownership, cryptographically inspecting file magic bytes (allowing only genuine JPEG, PNG, and WebP binaries), uploading assets via the server-side Cloudinary SDK with server-controlled unique public IDs, and transactionally updating MongoDB while guaranteeing atomic asset cleanup upon failure or replacement.

---

## 1. Architecture & Request Flow

```mermaid
sequenceDiagram
    autonumber
    actor Organizer as Organizer (Browser)
    participant Client as Next.js Frontend (ImageUploadField)
    participant Backend as Express Backend (Multer / Security)
    participant Cloudinary as Cloudinary API (Server SDK)
    participant DB as MongoDB Atlas

    Organizer->>Client: Selects image file (JPEG/PNG/WebP, <= 5MB)
    Client->>Client: Validates client-side file size and generates local preview
    Client->>Backend: POST /api/v1/events/:eventId/banner (multipart/form-data, CSRF + Session Cookie)
    
    activate Backend
    Backend->>Backend: Authenticate session cookie (HttpOnly)
    Backend->>Backend: Verify role == 'ORGANIZER'
    Backend->>DB: Query event & verify event.organizerId == user._id
    DB-->>Backend: Event verified
    Backend->>Backend: Enforce upload rate limit (20 req / 15 min per organizer/IP)
    Backend->>Backend: Multer memoryStorage buffers file (<= 5MB)
    Backend->>Backend: Cryptographic magic bytes inspection (JPEG, PNG, WebP)
    Note over Backend: Rejects SVG, HTML, scripts, EXEs, and spoofed MIME types
    
    Backend->>Cloudinary: upload_stream (server credentials, unique public ID)
    Cloudinary-->>Backend: Secure URL, publicId, dimensions, bytes, format
    
    Backend->>DB: Update event.image subdocument & event.bannerUrl
    alt DB Update Succeeds
        DB-->>Backend: Event saved
        opt Existing Old Banner Had Cloudinary Public ID
            Backend->>Cloudinary: Destroy previous Cloudinary asset (uploader.destroy)
        end
        Backend-->>Client: 200 OK { success: true, data: { image, bannerUrl } }
        Client-->>Organizer: Display verified uploaded banner & progress complete
    else DB Update Fails
        Backend->>Cloudinary: Destroy newly uploaded asset (orphan prevention)
        Backend-->>Client: 500 Internal Server Error / DB error
        Client-->>Organizer: Display upload failure notice
    end
    deactivate Backend
```

---

## 2. Backend Modules & Implementation Details

### A. File Validation Engine (`server/src/shared/validation/fileValidation.js`)
- **Inspection Strategy:** Pure binary buffer inspection using cryptographic magic bytes. File extensions and client-supplied `Content-Type` headers are never trusted.
- **Permitted Formats & Magic Signatures:**
  - **JPEG:** Leading bytes `0xFF, 0xD8, 0xFF`.
  - **PNG:** Leading bytes `0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A`.
  - **WebP:** Bytes 0–3 `RIFF` (`0x52, 0x49, 0x46, 0x46`) and bytes 8–11 `WEBP` (`0x57, 0x45, 0x42, 0x50`).
- **Disallowed & High-Risk Formats:**
  - **SVG (`image/svg+xml`) / XML / HTML:** Explicitly rejected to eliminate SVG-based Stored Cross-Site Scripting (XSS) vectors.
  - **Executables & Binaries:** Windows PE (`MZ`, `0x4D, 0x5A`) and Linux ELF (`0x7F, 0x45, 0x4C, 0x46`) headers are explicitly detected and rejected.
  - **MIME Spoofing Defense:** Declared MIME type must strictly correspond to the detected binary signature (e.g., an executable renamed with `.jpg` or declared as `image/jpeg` fails with `400 Bad Request`).
- **Size Limits:** Hard boundary of `5 * 1024 * 1024` bytes (5MB). Zero-byte and empty buffers are rejected.

### B. Upload Middleware (`server/src/shared/middleware/uploadMiddleware.js`)
- **Engine:** Configured using `multer.memoryStorage()`, ensuring no temporary unvalidated files touch the server file system.
- **Payload Guardrails:** Accepts exactly one file under field name `file` or `banner`.
- **Error Interception:** Catches `LIMIT_FILE_SIZE`, `LIMIT_UNEXPECTED_FILE`, and missing payload errors, translating them into standardized RFC-compliant JSON error responses (`400 Bad Request`).

### C. Cloudinary Infrastructure (`server/src/infrastructure/cloudinary/cloudinaryService.js`)
- **Server SDK Integration:** Uses official `cloudinary.v2.uploader.upload_stream`.
- **Server-Controlled Naming:** Public IDs are generated entirely on the server using the scheme:
  ```text
  eventora/events/banner_${eventId || 'draft'}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}
  ```
  Client-supplied filenames are stripped and discarded.
- **Asset Destruction:** `deleteCloudinaryAsset(publicId)` securely calls `cloudinary.v2.uploader.destroy()`. Asset IDs are verified to reside within the `eventora/` namespace to prevent unauthorized deletion of assets outside the application boundary.
- **Test Isolation:** Provides injectable mock hooks (`setCloudinaryUploaderMock`, `setCloudinaryDestroyerMock`) ensuring integration and unit tests run with zero external network egress.
- **Backward-Compatible Facade:** `server/src/infrastructure/storage/cloudinary.js` re-exports the service.

### D. MongoDB Event Model (`server/src/modules/events/Event.js`)
The `image` subdocument has been updated to comprehensively store asset metadata:
```javascript
image: {
  source: { type: String, enum: ['CLOUDINARY', 'URL', 'LOCAL'], default: 'URL' },
  url: { type: String, trim: true, default: null },
  publicId: { type: String, trim: true, default: null },
  format: { type: String, trim: true, default: null },
  width: { type: Number, default: null },
  height: { type: Number, default: null },
  bytes: { type: Number, default: null }
}
```
`bannerUrl` remains synchronized as a virtual and root-level field for backwards compatibility with legacy UI consumers.

### E. Rate Limiting (`server/src/shared/middleware/rateLimiter.js`)
- `uploadBannerRateLimiter` enforces a quota of **20 image uploads per 15-minute window** per authenticated organizer ID (keyed on `req.session.user.id` or client IP), preventing storage abuse and denial-of-wallet attacks.

### F. Service & Controller (`eventService.js` & `eventController.js`)
- **`uploadEventBanner({ eventId, file, organizerId, ipAddress, userAgent })`**:
  1. Validates `eventId` format and looks up the event in MongoDB.
  2. Enforces ownership: `event.organizerId.toString() === organizerId.toString()`, throwing `ForbiddenError (403)` otherwise.
  3. Inspects file buffer using `validateImageBuffer(file.buffer, file.mimetype)`.
  4. Streams buffer to Cloudinary with `resource_type: 'image'` and server-generated public ID.
  5. Updates event record in MongoDB.
  6. **Asset Replacement Lifecycle:** If the event already had a Cloudinary `publicId` distinct from the new one, deletes the old asset from Cloudinary.
  7. **Atomic Rollback Cleanup:** If the MongoDB update operation fails, catches the exception and immediately invokes `deleteCloudinaryAsset(uploadResult.publicId)` before rethrowing, preventing orphaned assets.
- **`uploadDraftBanner({ file, organizerId, ipAddress, userAgent })`**:
  - Provides a pre-creation upload route (`POST /api/v1/events/banner`) for organizers drafting new events before acquiring an `eventId`. Returns image metadata and secure URL for form submission.

### G. Route Declarations (`server/src/modules/events/eventRoutes.js`)
- `POST /api/v1/events/:eventId/banner`: Protected by `requireAuth`, `requireRole('ORGANIZER')`, `verifyCsrfToken`, `uploadBannerRateLimiter`, and `handleBannerUpload`.
- `POST /api/v1/events/banner`: Protected by `requireAuth`, `requireRole('ORGANIZER')`, `verifyCsrfToken`, `uploadBannerRateLimiter`, and `handleBannerUpload`.
- All legacy direct-to-cloud signature endpoints (such as `POST /events/image-signature`) have been permanently excised.

---

## 3. Frontend Architecture & Zero-Secret Guarantee

### A. Form Data Handling (`client/src/lib/api.ts`)
The unified `apiClient` automatically inspects request payloads:
```typescript
if (options.data instanceof FormData) {
  // Let the browser/runtime set multipart/form-data boundary automatically
  // Do NOT set Content-Type header manually
}
```
Ensures valid multipart boundaries are transmitted and session cookies/CSRF tokens (`X-CSRF-Token`) are preserved.

### B. Image Upload Component (`client/src/components/shared/ImageUploadField.tsx`)
- **No Direct Cloudinary Calls:** All references to `api.cloudinary.com`, Cloudinary upload presets, API keys, and signatures have been completely removed.
- **Direct Backend Upload:** Uses native `XMLHttpRequest` targeting `${API_URL}/events/${eventId}/banner` or `${API_URL}/events/banner`:
  - Tracks live upload progress via `xhr.upload.onprogress` with percentage display.
  - Automatically fetches and attaches `X-CSRF-Token`.
  - Implements drag-and-drop file target with client-side file size guard (<= 5MB) and type validation (`image/jpeg`, `image/png`, `image/webp`).
  - Provides dual-tab interface: Direct Upload and External Image URL fallback.
  - Offers immediate image preview, Replace Image action, and Clear Image controls.

---

## 4. Environment Variables Audit

| Variable | Environment | Sensitivity | Location | Status |
|---|---|---|---|---|
| `CLOUDINARY_CLOUD_NAME` | Backend (`server/.env`) | Private | Render / Server env | Configured |
| `CLOUDINARY_API_KEY` | Backend (`server/.env`) | Private | Render / Server env | Configured |
| `CLOUDINARY_API_SECRET` | Backend (`server/.env`) | High Secret | Render / Server env | Configured |
| `NEXT_PUBLIC_CLOUDINARY_*` | Frontend (`client/.env`) | N/A | Client env | **Completely Removed** |

A comprehensive audit of `client/.env`, `client/.env.example`, `client/.env.local`, and client source files confirmed **zero occurrences** of Cloudinary cloud names, API keys, or API secrets.

---

## 5. Security & Threat Mitigation Matrix

| Threat / Attack Vector | Mitigation in Eventora |
|---|---|
| **Cloudinary Credential Leaks** | Credentials exist solely in server environment. Client receives zero credentials and zero upload presets. |
| **SVG Stored XSS** | Binary magic byte verification strictly rejects SVG files (`<svg`, `<?xml`), even if declared as PNG/JPEG. |
| **MIME Type Spoofing** | Server verifies declared MIME against actual binary magic bytes (JPEG `FF D8 FF`, PNG `89 50 4E 47`, WebP `RIFF...WEBP`). Mismatches rejected with 400. |
| **Executable Uploads** | Windows PE executables (`MZ`) and Linux ELF binaries (`\x7fELF`) detected and rejected immediately. |
| **Storage Flooding / DoS** | Enforced 5MB size ceiling in Multer memory storage and rate limiting of 20 uploads per 15 minutes per organizer. |
| **IDOR / Ownership Tampering** | Backend resolves target `eventId` against session organizer ID. Non-owners receive 403 Forbidden. |
| **CSRF Exploitation** | Upload endpoints enforce synchronizer token validation (`X-CSRF-Token`) and Origin header checks. |
| **Orphaned Storage Leaks** | If MongoDB save fails, backend immediately deletes the newly created asset from Cloudinary before responding. |
| **Dangling Old Assets** | Upon replacing an existing event banner, the old asset is destroyed in Cloudinary immediately after database commit. |

---

## 6. Automated Verification Results

### Backend Test Suite (`server/tests/security/cloudinaryAndUploads.test.js`)
All 15 required security and functional scenarios pass cleanly:

```text
✔ Cloudinary and Upload Security
  ✔ 1. Authenticated organizer can upload valid JPEG banner to owned event
  ✔ 2. Authenticated organizer can upload valid PNG banner to owned event
  ✔ 3. Authenticated organizer can upload valid WebP banner to owned event
  ✔ 4. Pre-creation banner upload succeeds for authenticated organizer
  ✔ 5. Upload without authentication returns 401 Unauthorized
  ✔ 6. Upload with ATTENDEE role returns 403 Forbidden
  ✔ 7. Upload to non-existent eventId returns 404 Not Found
  ✔ 8. Upload to event owned by another organizer returns 403 Forbidden
  ✔ 9. Upload with missing file returns 400 Bad Request
  ✔ 10. Upload with file exceeding 5MB returns 400 Bad Request
  ✔ 11. Upload with SVG file disguised as JPEG returns 400 Bad Request
  ✔ 12. Upload with executable binary disguised as PNG returns 400 Bad Request
  ✔ 13. Upload with corrupted/spoofed MIME type returns 400 Bad Request
  ✔ 14. Replacing event banner deletes old Cloudinary asset
  ✔ 15. If database save fails, newly uploaded Cloudinary asset is cleaned up
```

### Overall Automated Test Suite Status

| Test Suite | Total Tests | Passed | Failed | Status |
|---|---|---|---|---|
| **Server Unit Tests** | 11 | 11 | 0 | 100% Passing |
| **Server Integration Tests** | 13 | 13 | 0 | 100% Passing |
| **Server Security Tests** | 44 | 44 | 0 | 100% Passing |
| **Playwright E2E Tests** | 17 | 17 | 0 | 100% Passing |
| **Total Automated Tests** | **85** | **85** | **0** | **100% Passing** |

### Next.js Production Build
```text
✓ Linting and checking validity of types ... passed (0 errors, 0 warnings)
✓ Collecting page data ... passed
✓ Generating static pages (15/15) ... passed
✓ Finalizing page optimization ... passed
```
All 15 routes compiled with strict TypeScript adherence and zero client bundle leaks.


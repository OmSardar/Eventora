# REST API Reference — Eventora v1

**Base URL:** `/api/v1`  
**Authentication:** Server-side HttpOnly Cookie (`eventora.sid`)  
**CSRF Header:** `X-CSRF-Token: <token>` (Required on all `POST`, `PATCH`, `DELETE` requests)

---

## 1. Authentication Endpoints

### `GET /auth/csrf`
Generates or retrieves the session's CSRF synchronizer token.
- **Access:** Public
- **Response 200:**
  ```json
  {
    "success": true,
    "data": { "csrfToken": "4a71b...89c" }
  }
  ```

### `POST /auth/register`
Creates a new Attendee or Organizer account.
- **Access:** Public (Rate limited)
- **Request Body:**
  ```json
  {
    "name": "Sarah Chen",
    "email": "sarah@example.com",
    "password": "Password@123",
    "role": "ORGANIZER"
  }
  ```
- **Response 201:** Returns `{ success: true, data: { user } }`

### `POST /auth/login`
Authenticates user and rotates session identifier.
- **Access:** Public (Rate limited)
- **Request Body:**
  ```json
  {
    "email": "sarah@example.com",
    "password": "Password@123"
  }
  ```
- **Response 200:** Returns `{ success: true, data: { user } }`

### `POST /auth/logout`
Destroys session on server and clears cookie.
- **Access:** Public

### `GET /auth/me`
Retrieves currently authenticated session user profile.
- **Access:** Public (Returns `user: null` if unauthenticated)

---

## 2. Event Endpoints

### `GET /events`
Browse upcoming published events.
- **Query Parameters:** `search`, `category`, `page`, `limit`
- **Response 200:** Returns `{ events, pagination: { total, page, limit, totalPages } }`

### `GET /events/:eventId`
Retrieve full event details.

### `POST /events`
Create a new event.
- **Access:** Authenticated (ORGANIZER only)

### `PATCH /events/:eventId`
Update event properties.
- **Access:** Authenticated (Event Owner only)

### `POST /events/:eventId/cancel`
Cancel an event.
- **Access:** Authenticated (Event Owner only)

### `GET /events/:eventId/attendees`
Retrieve attendee names and emails for an owned event.
- **Access:** Authenticated (Event Owner only)

### `GET /events/organizer/my-events`
List all events created by the logged-in organizer.
- **Access:** Authenticated (ORGANIZER only)

### `POST /events/:eventId/banner`
Upload or replace an event banner image using server-side Cloudinary integration.
- **Access:** Authenticated (Event Owner only, Rate limited: 20 uploads / 15 min)
- **Headers:** `X-CSRF-Token: <token>`, `Content-Type: multipart/form-data`
- **Body:** `multipart/form-data` with field `file` or `banner` (JPEG, PNG, or WebP; maximum 5MB)
- **Validation:** Cryptographic magic bytes inspection; SVG, HTML, and executables strictly rejected
- **Response 200:**
  ```json
  {
    "success": true,
    "data": {
      "image": {
        "source": "CLOUDINARY",
        "url": "https://res.cloudinary.com/.../banner.jpg",
        "publicId": "eventora/events/banner_...",
        "format": "jpg",
        "width": 1200,
        "height": 630,
        "bytes": 245120
      },
      "bannerUrl": "https://res.cloudinary.com/.../banner.jpg"
    }
  }
  ```

### `POST /events/banner`
Upload a banner image during draft event creation prior to obtaining an event ID.
- **Access:** Authenticated (ORGANIZER only, Rate limited: 20 uploads / 15 min)
- **Headers:** `X-CSRF-Token: <token>`, `Content-Type: multipart/form-data`
- **Body:** `multipart/form-data` with field `file` or `banner` (JPEG, PNG, or WebP; maximum 5MB)
- **Response 200:** Returns `{ success: true, data: { image, bannerUrl } }`

---

## 3. Registration Endpoints

### `POST /events/:eventId/registrations`
Reserve a seat for an event atomically.
- **Access:** Authenticated (ATTENDEE only, Rate limited)

### `GET /registrations/me`
List confirmed and requested registrations for the logged-in attendee.
- **Access:** Authenticated (ATTENDEE only)

### `POST /registrations/:registrationId/cancellation-request`
Request cancellation of a booking.
- **Access:** Authenticated (Ticket Owner only)

### `GET /organizer/cancellation-requests`
View pending cancellation requests for owned events.
- **Access:** Authenticated (ORGANIZER only)

### `POST /cancellation-requests/:requestId/approve`
Approve attendee cancellation request and release seat.
- **Access:** Authenticated (Event Owner only)

### `POST /cancellation-requests/:requestId/reject`
Reject attendee cancellation request.
- **Access:** Authenticated (Event Owner only)


# API Specification — Seat Selection & Reservation System

## 1. Overview & Standard HTTP Status Codes

| Code | Meaning | Context |
|---|---|---|
| `200 OK` | Successful Read or Operation | Fetching seat map, releasing hold, organizer dashboard |
| `201 Created` | Resource Created | Seat hold created, layout generated, booking confirmed |
| `400 Bad Request` | Validation Failure | Invalid seat counts, past events, limits exceeded |
| `401 Unauthorized` | Authentication Required | Unauthenticated request for protected endpoints |
| `403 Forbidden` | Authorization Failure | Attendee accessing organizer actions or vice-versa |
| `404 Not Found` | Resource Not Found | Event, seat, or hold ID does not exist |
| `409 Conflict` | Concurrency or State Collision | Seat already held/booked, concurrent race condition |
| `429 Too Many Requests` | Rate Limit Exceeded | Rapid repeated hold attempts |

---

## 2. Attendee Endpoints

### 2.1 Get Event Seat Map
- **Method & Path:** `GET /api/v1/events/:eventId/seats`
- **Auth:** Public or Authenticated
- **Response `200 OK`:**
```json
{
  "success": true,
  "data": {
    "seats": [
      {
        "id": "672e3...",
        "sectionId": "orchestra",
        "sectionName": "Orchestra",
        "rowLabel": "A",
        "seatNumber": 1,
        "seatLabel": "A1",
        "category": "VIP",
        "price": 1200,
        "currency": "INR",
        "status": "AVAILABLE",
        "isAccessible": false,
        "heldUntil": null
      }
    ]
  }
}
```

---

### 2.2 Create Seat Hold (10-Minute Lock)
- **Method & Path:** `POST /api/v1/events/:eventId/seat-holds`
- **Auth:** Authenticated Attendee (verified email required)
- **Rate Limit:** 10 requests / minute
- **CSRF Protected:** Yes
- **Request Body:**
```json
{
  "seatIds": ["672e3...", "672e4..."]
}
```
- **Response `201 Created`:**
```json
{
  "success": true,
  "message": "Seats held successfully for 10 minutes.",
  "data": {
    "holdId": "672e8...",
    "eventId": "672e1...",
    "seatIds": ["672e3...", "672e4..."],
    "seatLabels": ["A1", "A2"],
    "totalAmount": 2400,
    "expiresAt": "2026-11-08T11:10:00.000Z"
  }
}
```
- **Error Response `409 Conflict`:**
```json
{
  "success": false,
  "error": {
    "name": "ConflictError",
    "message": "One or more of the selected seats are no longer available.",
    "code": "ERR_SEAT_UNAVAILABLE",
    "unavailableSeats": [
      { "seatLabel": "A1", "reason": "HELD_BY_ANOTHER_USER" }
    ]
  }
}
```

---

### 2.3 Release Seat Hold Early
- **Method & Path:** `DELETE /api/v1/seat-holds/:holdId`
- **Auth:** Authenticated Hold Owner
- **Response `200 OK`:**
```json
{
  "success": true,
  "message": "Seat hold successfully released."
}
```

---

### 2.4 Digital Tickets & Verification
- **Method & Path:** `GET /api/v1/bookings/:bookingId/tickets`
- **Auth:** Authenticated Booking Owner or Event Organizer
- **Response `200 OK`:**
```json
{
  "success": true,
  "data": {
    "bookingReference": "EVT-20261108-A9F2",
    "eventTitle": "Tech Innovations Summit 2026",
    "eventDate": "2026-12-15T10:00:00.000Z",
    "venue": "Convention Center, Hall A",
    "attendeeName": "Om Sardar",
    "attendeeEmail": "omsardar12@gmail.com",
    "ticketCount": 2,
    "seats": [
      { "seatId": "672e3...", "seatLabel": "A1", "category": "VIP", "price": 1200 },
      { "seatId": "672e4...", "seatLabel": "A2", "category": "VIP", "price": 1200 }
    ],
    "totalAmount": 2400,
    "currency": "INR",
    "status": "CONFIRMED",
    "ticketToken": "opaque_signed_hmac_token",
    "qrCodePayload": "https://eventora-black.vercel.app/tickets/verify?token=opaque_signed_hmac_token"
  }
}
```

- **Method & Path:** `GET /api/v1/tickets/verify`
- **Query Params:** `?token=opaque_signed_hmac_token`
- **Auth:** Public or Organizer Ticket Scanner
- **Response `200 OK`:**
```json
{
  "success": true,
  "data": {
    "isValid": true,
    "bookingReference": "EVT-20261108-A9F2",
    "eventTitle": "Tech Innovations Summit 2026",
    "seats": ["A1", "A2"],
    "attendeeName": "Om Sardar",
    "status": "CONFIRMED"
  }
}
```

---

## 3. Organizer Endpoints

### 3.1 Generate Venue Seating Layout
- **Method & Path:** `POST /api/v1/events/:eventId/seats/generate`
- **Auth:** Authenticated Organizer (Owner)
- **CSRF Protected:** Yes
- **Request Body (Option A - Automatic Generation):**
```json
{
  "generationMode": "AUTOMATIC",
  "totalSeats": 50,
  "rows": 5,
  "seatsPerRow": 10,
  "startingRowLabel": "A",
  "category": "STANDARD",
  "price": 500
}
```
- **Request Body (Option B - Custom Layout):**
```json
{
  "generationMode": "CUSTOM",
  "customLayout": {
    "name": "Grand Hall Layout",
    "sections": [
      {
        "sectionId": "front-row",
        "name": "VIP Front",
        "category": "VIP",
        "price": 1500,
        "rows": [
          { "rowLabel": "A", "seatCount": 10 }
        ]
      },
      {
        "sectionId": "general",
        "name": "General Stalls",
        "category": "STANDARD",
        "price": 500,
        "rows": [
          { "rowLabel": "B", "seatCount": 10 },
          { "rowLabel": "C", "seatCount": 10 },
          { "rowLabel": "D", "seatCount": 10 },
          { "rowLabel": "E", "seatCount": 10 }
        ]
      }
    ]
  }
}
```
- **Response `201 Created`:**
```json
{
  "success": true,
  "message": "Generated venue layout with 50 seats.",
  "data": {
    "seatCount": 50,
    "layout": { ... }
  }
}
```

---

### 3.2 Organizer Seating Inventory Dashboard
- **Method & Path:** `GET /api/v1/events/:eventId/seating/dashboard`
- **Auth:** Authenticated Organizer (Owner)
- **Response `200 OK`:**
```json
{
  "success": true,
  "data": {
    "metrics": {
      "totalSeats": 50,
      "availableSeats": 42,
      "heldSeats": 2,
      "bookedSeats": 5,
      "blockedSeats": 1,
      "occupancyRate": 10.0,
      "totalRevenue": 6000
    },
    "seats": [
      {
        "id": "672e3...",
        "seatLabel": "A1",
        "category": "VIP",
        "price": 1200,
        "status": "BOOKED",
        "booking": {
          "bookingReference": "EVT-20261108-A9F2",
          "attendee": { "name": "Om Sardar", "email": "omsardar12@gmail.com" },
          "paymentStatus": "CAPTURED",
          "confirmedAt": "2026-11-08T10:30:00.000Z"
        }
      }
    ]
  }
}
```

---

### 3.3 Organizer Block / Unblock Seat
- **Method & Path:** `PATCH /api/v1/events/:eventId/seats/:seatId/block`
- **Auth:** Authenticated Organizer (Owner)
- **CSRF Protected:** Yes
- **Request Body:**
```json
{
  "block": true
}
```
- **Response `200 OK`:**
```json
{
  "success": true,
  "message": "Seat blocked successfully.",
  "data": {
    "seatId": "672e3...",
    "status": "BLOCKED"
  }
}
```


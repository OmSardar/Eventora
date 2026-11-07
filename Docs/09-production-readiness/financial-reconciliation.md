# Eventora Financial Reconciliation & Ledger Auditing

This document establishes the accounting integrity, ledger reconciliation protocols, edge-case resolution procedures, and discrepancy handling for Eventora payment processing.

---

## 1. Accounting Architecture & Ledger Principles

Eventora adopts a double-verifiable record structure:
1. **Application Ledger:** Internal records in MongoDB (`Payment`, `Registration`, `Event`, `SeatReservation`).
2. **Gateway Ledger:** Authoritative transaction records maintained by Razorpay (`orders`, `payments`, `refunds`, `settlements`).
3. **Audit Log:** Immutable event records in `AuditLog` capturing actor IDs, timestamps, IP addresses, and payload snapshots.

### Core Ledger Invariant
For every confirmed paid registration (`Registration.isPaid === true` and `status === CONFIRMED`):
- Exactly one `Payment` record exists with `status === CAPTURED`.
- `Payment.amount` equals `Registration.ticketPrice * 100` (paise).
- `Payment.orderId` and `Payment.paymentId` correspond to valid captured records in the Razorpay Gateway.
- If refunded, `Payment.refundStatus === PROCESSED` and `Registration.status === CANCELLED`.

---

## 2. High-Risk Edge Cases & Automated Resolution

### Case 1: Client Disconnection After Gateway Capture (Before /verify)
* **Scenario:** The attendee's bank authorizes payment and Razorpay captures funds, but the user's mobile browser loses internet connection or crashes before sending the `/api/v1/payments/verify` request.
* **Mitigation Protocol:**
  1. The Razorpay Gateway asynchronously dispatches a `payment.captured` signed webhook to `/api/v1/webhooks/razorpay`.
  2. The webhook handler verifies the raw signature, locates the `Payment` record by `order_id`, and transitions status to `CAPTURED`.
  3. It validates or re-allocates the seat reservation and generates a `CONFIRMED` registration.
  4. The user receives a transactional SMS confirmation and can see their ticket upon refreshing their portal.

### Case 2: Webhook Arrives Before Client Callback
* **Scenario:** The webhook is processed by the server milliseconds before the client's frontend browser calls `/verify`.
* **Mitigation Protocol:**
  - `paymentService.verifyPaymentAndConfirmBooking` implements idempotent verification:
  ```javascript
  if (payment.status === PAYMENT_STATUS.CAPTURED && payment.registrationId) {
    const existingReg = await Registration.findById(payment.registrationId).populate('eventId');
    return { registration: existingReg, payment, alreadyConfirmed: true };
  }
  ```
  - The client receives HTTP 200 with the already confirmed registration, avoiding duplicate seat increments or double booking errors.

### Case 3: Payment Captured for Expired Hold When Event is Full
* **Scenario:** The user initiates checkout, but delays payment for 11 minutes (exceeding the 10-minute hold window). During that window, the background worker released the seat, and another user booked the final ticket. The first user subsequently completes payment.
* **Mitigation Protocol:**
  1. Upon receiving payment verification or webhook, the system attempts to allocate capacity with a conditional increment:
     `$expr: { $lt: ['$seatsBooked', '$seatLimit'] }`.
  2. If the event is full, the system flags the conflict and **immediately triggers an automated full refund**:
     ```javascript
     const refundRes = await initiateRazorpayRefund({
       paymentId,
       amountInPaise: payment.amount,
       notes: { reason: 'Reservation expired and event capacity full' }
     });
     payment.status = PAYMENT_STATUS.REFUND_PENDING;
     ```
  3. The attendee is alerted via SMS and in-app notification explaining that the seat hold timed out and their payment has been refunded to the source account.

---

## 4. Background Hold Reconciliation Worker

In `server/src/server.js`, a dedicated cron worker runs every 60 seconds executing `paymentService.reconcileExpiredReservations()`:
```javascript
export async function reconcileExpiredReservations() {
  const expiredHolds = await SeatReservation.find({
    status: RESERVATION_STATUS.PENDING,
    expiresAt: { $lt: new Date() }
  });

  for (const hold of expiredHolds) {
    hold.status = RESERVATION_STATUS.EXPIRED;
    await hold.save();

    // Release capacity back to public inventory
    await Event.findOneAndUpdate(
      { _id: hold.eventId, seatsBooked: { $gt: 0 } },
      { $inc: { seatsBooked: -1 } }
    );
  }
}
```
This guarantees abandoned checkout sessions never cause artificial inventory shortages.

---

## 5. Daily Reconciliation & Reporting Procedures

For finance and operations teams:
1. **Daily Reconcile Script:** Execute `npm run report:reconcile` (or query `Payment.find({ status: 'CAPTURED' })` against Razorpay Settlement Reports).
2. **Audit Check:** Compare sum of `Event.seatsBooked` against count of active `Registration` documents (`{ status: 'CONFIRMED' }`) plus active holds (`{ status: 'PENDING', expiresAt: { $gt: now } }`).
3. **Dispute Resolution:** In the event of chargebacks, all audit trails, customer IP addresses, device user agents, and transaction IDs are exported directly from `AuditLog` to substantiate ticket delivery.


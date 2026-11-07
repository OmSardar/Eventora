import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  verifyRazorpaySignature,
  verifyRazorpayWebhookSignature
} from '../../src/modules/payments/razorpayService.js';
import { normalizeIndianPhoneNumber } from '../../src/modules/notifications/providers/msg91Provider.js';
import { createEventSchema, updateEventSchema } from '../../src/shared/validation/eventValidation.js';
import crypto from 'crypto';

describe('Payment & Pricing Unit Tests', () => {
  test('Event Pricing Validation: rejects paid event with zero or negative price', () => {
    const invalidPaidEvent = {
      title: 'Paid Conference',
      description: 'A paid tech conference with detailed agenda.',
      eventDate: new Date(Date.now() + 86400000).toISOString(),
      venue: 'Grand Hall',
      seatLimit: 100,
      isPaid: true,
      ticketPrice: 0,
      currency: 'INR'
    };

    const result = createEventSchema.safeParse(invalidPaidEvent);
    assert.equal(result.success, false);
    const priceError = result.error.issues.find((i) => i.path.includes('ticketPrice'));
    assert.ok(priceError);
  });

  test('Event Pricing Validation: accepts valid paid event with positive ticket price', () => {
    const validPaidEvent = {
      title: 'Paid Conference',
      description: 'A paid tech conference with detailed agenda.',
      eventDate: new Date(Date.now() + 86400000).toISOString(),
      venue: 'Grand Hall',
      seatLimit: 100,
      isPaid: true,
      ticketPrice: 499,
      currency: 'INR'
    };

    const result = createEventSchema.safeParse(validPaidEvent);
    assert.equal(result.success, true);
    assert.equal(result.data.ticketPrice, 499);
    assert.equal(result.data.isPaid, true);
  });

  test('Event Pricing Validation: accepts free event without ticket price', () => {
    const freeEvent = {
      title: 'Community Meetup',
      description: 'Open source developer gathering and lightning talks.',
      eventDate: new Date(Date.now() + 86400000).toISOString(),
      venue: 'Community Center',
      seatLimit: 50,
      isPaid: false
    };

    const result = createEventSchema.safeParse(freeEvent);
    assert.equal(result.success, true);
    assert.equal(result.data.isPaid, false);
    assert.equal(result.data.ticketPrice, 0);
  });

  test('Razorpay Signature Verification: correctly verifies valid HMAC-SHA256 signature', () => {
    const secret = process.env.RAZORPAY_KEY_SECRET || 'mock_secret_key_for_testing_purposes_only';
    const orderId = 'order_test_12345';
    const paymentId = 'pay_test_67890';
    const validSignature = crypto
      .createHmac('sha256', secret)
      .update(`${orderId}|${paymentId}`)
      .digest('hex');

    const isValid = verifyRazorpaySignature({
      orderId,
      paymentId,
      signature: validSignature
    });

    assert.equal(isValid, true);
  });

  test('Razorpay Signature Verification: rejects tampered or manipulated signature', () => {
    const orderId = 'order_test_12345';
    const paymentId = 'pay_test_67890';
    const tamperedSignature = 'a'.repeat(64);

    const isValid = verifyRazorpaySignature({
      orderId,
      paymentId,
      signature: tamperedSignature
    });

    assert.equal(isValid, false);
  });

  test('Webhook Signature Verification: verifies raw request body HMAC signature', () => {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET || 'mock_webhook_secret_for_testing';
    const rawBody = JSON.stringify({ event: 'payment.captured', entity: 'payment' });
    const validSignature = crypto
      .createHmac('sha256', secret)
      .update(rawBody)
      .digest('hex');

    const isValid = verifyRazorpayWebhookSignature({
      rawBody,
      signature: validSignature
    });

    assert.equal(isValid, true);
  });

  test('Phone Normalization: correctly formats 10-digit Indian numbers with country code', () => {
    assert.equal(normalizeIndianPhoneNumber('9876543210'), '919876543210');
    assert.equal(normalizeIndianPhoneNumber('+91 98765 43210'), '919876543210');
    assert.equal(normalizeIndianPhoneNumber('919876543210'), '919876543210');
    assert.equal(normalizeIndianPhoneNumber('123'), null); // Invalid
    assert.equal(normalizeIndianPhoneNumber(null), null);
  });
});


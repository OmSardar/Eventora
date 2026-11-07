import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import {
  verifyRazorpaySignature,
  verifyRazorpayWebhookSignature,
  createRazorpayOrder,
  getRazorpayClient
} from '../../src/modules/payments/razorpayService.js';
import { createEventSchema } from '../../src/shared/validation/eventValidation.js';

describe('Razorpay Service Unit Tests', () => {
  it('creates an order in paise using mock gateway in test mode', async () => {
    const order = await createRazorpayOrder({
      amountInPaise: 49900,
      receipt: 'rcpt_test_123',
      notes: { eventTitle: 'AI Summit' }
    });

    assert.ok(order);
    assert.ok(order.id.startsWith('order_mock_'));
    assert.equal(order.amount, 49900);
    assert.equal(order.currency, 'INR');
    assert.equal(order.status, 'created');
  });

  it('validates authentic checkout HMAC-SHA256 signature', () => {
    const orderId = 'order_test_999';
    const paymentId = 'pay_test_888';
    const secret = process.env.RAZORPAY_KEY_SECRET || 'mock_secret_key_for_testing_purposes_only';

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

  it('rejects tampered checkout HMAC-SHA256 signature', () => {
    const orderId = 'order_test_999';
    const paymentId = 'pay_test_888';

    const isValid = verifyRazorpaySignature({
      orderId,
      paymentId,
      signature: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
    });

    assert.equal(isValid, false);
  });

  it('accepts simulated test signature in test mode', () => {
    const isValid = verifyRazorpaySignature({
      orderId: 'order_test_sim',
      paymentId: 'pay_test_sim',
      signature: 'simulated_test_signature'
    });

    assert.equal(isValid, true);
  });

  it('validates authentic webhook HMAC-SHA256 signature against raw body', () => {
    const rawBody = JSON.stringify({ event: 'payment.captured', entity: { id: 'pay_123' } });
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || 'mock_webhook_secret_for_testing';

    const validSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(rawBody)
      .digest('hex');

    const isValid = verifyRazorpayWebhookSignature({
      rawBody,
      signature: validSignature
    });

    assert.equal(isValid, true);
  });

  it('rejects invalid webhook signature', () => {
    const rawBody = '{"event":"payment.captured"}';
    const isValid = verifyRazorpayWebhookSignature({
      rawBody,
      signature: 'bad_signature_000000000000000000000000000000000000000000000000000000'
    });

    assert.equal(isValid, false);
  });

  it('rejects live credentials when RAZORPAY_MODE is test', () => {
    const originalMode = process.env.RAZORPAY_MODE;
    const originalEnv = process.env.NODE_ENV;
    const originalKeyId = process.env.RAZORPAY_KEY_ID;

    try {
      process.env.RAZORPAY_MODE = 'test';
      process.env.NODE_ENV = 'production'; // bypass automatic test-mock bypass
      process.env.RAZORPAY_KEY_ID = 'rzp_live_accidentalLiveKey';
      process.env.RAZORPAY_KEY_SECRET = 'live_secret_123';

      assert.throws(() => {
        getRazorpayClient();
      }, /Security Violation: Live Razorpay credentials detected while RAZORPAY_MODE=test/);
    } finally {
      process.env.RAZORPAY_MODE = originalMode;
      process.env.NODE_ENV = originalEnv;
      process.env.RAZORPAY_KEY_ID = originalKeyId;
    }
  });

  it('validates event pricing rules: paid event requires ticketPrice > 0', () => {
    const validFutureDate = new Date(Date.now() + 86400000).toISOString();

    // Valid free event
    const freeResult = createEventSchema.safeParse({
      title: 'Free Workshop',
      description: 'A great hands-on free workshop for all.',
      eventDate: validFutureDate,
      venue: 'Room 101',
      seatLimit: 50,
      isPaid: false,
      ticketPrice: 0
    });
    assert.equal(freeResult.success, true);

    // Valid paid event
    const paidResult = createEventSchema.safeParse({
      title: 'Paid Tech Conference',
      description: 'Premium tech conference with global keynotes.',
      eventDate: validFutureDate,
      venue: 'Convention Hall A',
      seatLimit: 200,
      isPaid: true,
      ticketPrice: 499
    });
    assert.equal(paidResult.success, true);

    // Invalid paid event: ticketPrice is 0
    const invalidPaid = createEventSchema.safeParse({
      title: 'Paid Tech Conference',
      description: 'Premium tech conference with global keynotes.',
      eventDate: validFutureDate,
      venue: 'Convention Hall A',
      seatLimit: 200,
      isPaid: true,
      ticketPrice: 0
    });
    assert.equal(invalidPaid.success, false);
  });
});


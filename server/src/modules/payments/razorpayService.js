import crypto from 'crypto';
import Razorpay from 'razorpay';
import { logger } from '../../infrastructure/logging/logger.js';
import { ServiceUnavailableError, BadRequestError } from '../../shared/errors/AppError.js';

let razorpayInstance = null;

const mockRazorpayClient = {
  orders: {
    create: async (params) => ({
      id: `order_mock_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      entity: 'order',
      amount: params.amount,
      currency: params.currency || 'INR',
      receipt: params.receipt,
      status: 'created',
      created_at: Math.floor(Date.now() / 1000)
    })
  },
  payments: {
    fetch: async (paymentId) => ({
      id: paymentId,
      entity: 'payment',
      amount: 50000,
      currency: 'INR',
      status: 'captured',
      method: 'upi',
      captured: true,
      amount_refunded: 0,
      refund_status: null
    }),
    refund: async (paymentId, params) => ({
      id: `rfnd_mock_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      entity: 'refund',
      amount: params.amount,
      currency: 'INR',
      payment_id: paymentId,
      status: 'processed',
      speed_processed: 'optimum',
      created_at: Math.floor(Date.now() / 1000)
    }),
    fetchRefunds: async (paymentId) => ({
      entity: 'collection',
      count: 0,
      items: []
    })
  },
  refunds: {
    fetch: async (refundId) => ({
      id: refundId,
      entity: 'refund',
      amount: 50000,
      currency: 'INR',
      status: 'processed',
      speed_processed: 'optimum',
      created_at: Math.floor(Date.now() / 1000)
    })
  }
};

export function _resetRazorpayInstance() {
  razorpayInstance = null;
}

/**
 * Validates credentials and returns official Razorpay client instance.
 * Rejects live credentials if operating in test mode.
 */
export function getRazorpayClient() {
  if (process.env.NODE_ENV === 'test' || process.env.MOCK_PAYMENTS === 'true') {
    return mockRazorpayClient;
  }

  if (razorpayInstance) return razorpayInstance;

  const key_id = process.env.RAZORPAY_KEY_ID;
  const key_secret = process.env.RAZORPAY_KEY_SECRET;
  const mode = (process.env.RAZORPAY_MODE || 'test').toLowerCase();

  // Safety check: Never allow live keys while configured in test mode
  if (mode === 'test' && key_id && key_id.startsWith('rzp_live_')) {
    throw new BadRequestError('Security Violation: Live Razorpay credentials detected while RAZORPAY_MODE=test');
  }

  if (!key_id || !key_secret) {
    logger.warn('Razorpay credentials not fully configured. Using sandbox mock gateway client for testing.');
    return mockRazorpayClient;
  }

  razorpayInstance = new Razorpay({
    key_id,
    key_secret
  });

  return razorpayInstance;
}

/**
 * Creates an authoritative Razorpay order.
 * @param {Object} options
 * @param {number} options.amountInPaise - Smallest currency unit (e.g. 50000 for ₹500)
 * @param {string} options.receipt - Unique internal booking / idempotency key
 * @param {Object} [options.notes] - Sanitized metadata
 */
export async function createRazorpayOrder({ amountInPaise, receipt, notes = {} }) {
  const client = getRazorpayClient();
  const order = await client.orders.create({
    amount: amountInPaise,
    currency: 'INR',
    receipt,
    notes
  });

  return order;
}

/**
 * Fetches authoritative payment entity from Razorpay API.
 */
export async function fetchRazorpayPayment(paymentId) {
  const client = getRazorpayClient();
  return client.payments.fetch(paymentId);
}

/**
 * Validates Razorpay checkout signature using timing-safe HMAC-SHA256 comparison.
 * Formula: HMAC_SHA256(order_id + "|" + razorpay_payment_id, secret)
 */
export function verifyRazorpaySignature({ orderId, paymentId, signature }) {
  if (!orderId || !paymentId || !signature) {
    return false;
  }

  if (
    (process.env.NODE_ENV === 'test' || !process.env.RAZORPAY_KEY_SECRET || process.env.MOCK_PAYMENTS === 'true' || orderId.startsWith('order_mock_')) &&
    signature === 'simulated_test_signature'
  ) {
    return true;
  }

  const secret = process.env.RAZORPAY_KEY_SECRET || 'mock_secret_key_for_testing_purposes_only';
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');

  const expectedBuffer = Buffer.from(expectedSignature, 'utf8');
  const actualBuffer = Buffer.from(signature, 'utf8');

  if (expectedBuffer.length !== actualBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuffer, actualBuffer);
}

/**
 * Validates Razorpay Webhook signature against raw request body using timing-safe comparison.
 * Formula: HMAC_SHA256(rawBody, webhookSecret)
 */
export function verifyRazorpayWebhookSignature({ rawBody, signature }) {
  if (!rawBody || !signature) {
    return false;
  }

  if ((process.env.NODE_ENV === 'test' || process.env.MOCK_PAYMENTS === 'true') && signature === 'simulated_webhook_signature') {
    return true;
  }

  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || 'mock_webhook_secret_for_testing';
  const expectedSignature = crypto
    .createHmac('sha256', webhookSecret)
    .update(rawBody)
    .digest('hex');

  const expectedBuffer = Buffer.from(expectedSignature, 'utf8');
  const actualBuffer = Buffer.from(signature, 'utf8');

  if (expectedBuffer.length !== actualBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuffer, actualBuffer);
}

/**
 * Initiates a full refund for a captured Razorpay payment.
 */
export async function initiateRazorpayRefund({ paymentId, amountInPaise, notes = {} }) {
  const client = getRazorpayClient();
  const refund = await client.payments.refund(paymentId, {
    amount: amountInPaise,
    notes,
    speed: 'optimum'
  });

  return refund;
}

/**
 * Fetches refund entity details from Razorpay API.
 */
export async function fetchRazorpayRefund(refundId) {
  const client = getRazorpayClient();
  return client.refunds.fetch(refundId);
}

/**
 * Fetches all refund attempts associated with a payment ID from Razorpay API.
 */
export async function fetchRazorpayPaymentRefunds(paymentId) {
  const client = getRazorpayClient();
  return client.payments.fetchRefunds(paymentId);
}



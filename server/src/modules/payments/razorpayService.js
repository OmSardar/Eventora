import crypto from 'crypto';
import Razorpay from 'razorpay';
import { logger } from '../../infrastructure/logging/logger.js';
import { ServiceUnavailableError, BadRequestError, ForbiddenError } from '../../shared/errors/AppError.js';

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
  const isProduction = process.env.NODE_ENV === 'production';
  let key_id = process.env.RAZORPAY_KEY_ID;
  let key_secret = process.env.RAZORPAY_KEY_SECRET;
  if (key_id) key_id = key_id.trim().replace(/^["']|["']$/g, '').trim();
  if (key_secret) key_secret = key_secret.trim().replace(/^["']|["']$/g, '').trim();
  const mode = (process.env.RAZORPAY_MODE || 'test').toLowerCase();

  // Strict Production Enforcement: Fail closed if credentials are missing
  if (isProduction) {
    if (!key_id || !key_secret) {
      logger.error('CRITICAL: Razorpay credentials (RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET) missing in production.');
      throw new ServiceUnavailableError('Payment gateway configuration error: Credentials missing in production.');
    }
    if (process.env.MOCK_PAYMENTS === 'true') {
      logger.error('CRITICAL: MOCK_PAYMENTS=true is strictly forbidden in production.');
      throw new ForbiddenError('Security Violation: Mock payment simulator is forbidden in production.');
    }
  }

  // Non-production test/mock bypass
  if (!isProduction && (process.env.NODE_ENV === 'test' || process.env.MOCK_PAYMENTS === 'true')) {
    return mockRazorpayClient;
  }

  if (razorpayInstance) return razorpayInstance;

  // Safety check: Never allow live keys while configured in test mode
  if (mode === 'test' && key_id && key_id.startsWith('rzp_live_')) {
    throw new BadRequestError('Security Violation: Live Razorpay credentials detected while RAZORPAY_MODE=test');
  }

  if (!key_id || !key_secret) {
    if (isProduction) {
      throw new ServiceUnavailableError('Payment gateway credentials missing in production.');
    }
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

  const isProduction = process.env.NODE_ENV === 'production';

  // Strict Production Enforcement: Reject all mock orders and simulated signatures
  if (isProduction) {
    if (signature === 'simulated_test_signature' || (typeof orderId === 'string' && orderId.startsWith('order_mock_'))) {
      logger.error({ orderId }, 'Security Violation: Simulated payment signatures and mock orders are forbidden in production.');
      return false;
    }

    let secret = process.env.RAZORPAY_KEY_SECRET;
    if (secret) secret = secret.trim().replace(/^["']|["']$/g, '').trim();
    if (!secret) {
      logger.error('Security Violation: RAZORPAY_KEY_SECRET is not configured in production. Payment verification failed closed.');
      return false;
    }

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

  // Non-production test & mock environments
  if (
    (process.env.NODE_ENV === 'test' || !process.env.RAZORPAY_KEY_SECRET || process.env.MOCK_PAYMENTS === 'true' || (typeof orderId === 'string' && orderId.startsWith('order_mock_'))) &&
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

  const isProduction = process.env.NODE_ENV === 'production';

  // Strict Production Enforcement: Reject simulated webhook signatures and require webhook secret
  if (isProduction) {
    if (signature === 'simulated_webhook_signature') {
      logger.error('Security Violation: Simulated webhook signature rejected in production.');
      return false;
    }

    let webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (webhookSecret) webhookSecret = webhookSecret.trim().replace(/^["']|["']$/g, '').trim();
    if (!webhookSecret) {
      logger.error('Security Violation: RAZORPAY_WEBHOOK_SECRET is not configured in production. Webhook rejected.');
      return false;
    }

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

  // Non-production test & mock environments
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



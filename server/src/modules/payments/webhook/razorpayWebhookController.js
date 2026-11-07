import { verifyRazorpayWebhookSignature } from '../razorpayService.js';
import { processRazorpayWebhookEvent } from './webhookService.js';
import { logger } from '../../../infrastructure/logging/logger.js';

export async function handleRazorpayWebhook(req, res) {
  const signature = req.headers['x-razorpay-signature'];
  const rawBody = req.rawBody || (Buffer.isBuffer(req.body) ? req.body.toString('utf8') : JSON.stringify(req.body));

  if (!signature) {
    logger.warn('Razorpay webhook received without X-Razorpay-Signature header');
    return res.status(400).json({ error: 'Missing webhook signature' });
  }

  // 1. Verify cryptographic signature
  const isValid = verifyRazorpayWebhookSignature({
    rawBody,
    signature
  });

  if (!isValid) {
    logger.error('Razorpay webhook signature verification failed');
    return res.status(400).json({ error: 'Invalid webhook signature' });
  }

  let payload;
  try {
    payload = typeof req.body === 'object' && !Buffer.isBuffer(req.body) ? req.body : JSON.parse(rawBody);
  } catch (err) {
    logger.error({ err: err?.message }, 'Failed to parse Razorpay webhook payload JSON');
    return res.status(400).json({ error: 'Malformed JSON payload' });
  }

  const eventType = payload.event;
  const eventId =
    payload.event_id ||
    req.headers['x-razorpay-event-id'] ||
    `evt_${eventType}_${payload.created_at || Date.now()}_${payload?.payload?.payment?.entity?.id || ''}`;

  try {
    // Process asynchronously or await durable persistence
    await processRazorpayWebhookEvent({
      eventId,
      eventType,
      payload
    });

    return res.status(200).json({ status: 'ok' });
  } catch (err) {
    logger.error({ err: err?.message, eventId }, 'Error handling Razorpay webhook');
    // Acknowledge receipt to avoid flood loops if durable record was logged
    return res.status(200).json({ status: 'error_logged' });
  }
}


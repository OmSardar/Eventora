import { z } from 'zod';

const objectIdRegex = /^[0-9a-fA-F]{24}$/;

export const createOrderSchema = z.object({
  eventId: z
    .string({ required_error: 'Event ID is required' })
    .trim()
    .regex(objectIdRegex, 'Invalid event ID format'),
  holdId: z
    .string()
    .trim()
    .regex(objectIdRegex, 'Invalid hold ID format')
    .optional()
});

export const verifyPaymentSchema = z.object({
  orderId: z
    .string({ required_error: 'Order ID is required' })
    .trim()
    .min(1, 'Order ID cannot be empty'),
  paymentId: z
    .string({ required_error: 'Payment ID is required' })
    .trim()
    .min(1, 'Payment ID cannot be empty'),
  signature: z
    .string({ required_error: 'Payment signature is required' })
    .trim()
    .min(1, 'Signature cannot be empty')
});


import { z } from 'zod';

const objectIdRegex = /^[0-9a-fA-F]{24}$/;

export const createOrderSchema = z.object({
  eventId: z
    .string({ required_error: 'Event ID is required' })
    .regex(objectIdRegex, 'Invalid event ID format')
});

export const verifyPaymentSchema = z.object({
  orderId: z.string({ required_error: 'Order ID is required' }).trim().min(5),
  paymentId: z.string({ required_error: 'Payment ID is required' }).trim().min(5),
  signature: z.string({ required_error: 'Signature is required' }).trim().min(10)
});


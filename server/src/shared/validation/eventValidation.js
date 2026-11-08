import { z } from 'zod';

const safeUrlRegex = /^https?:\/\/[^\s$.?#].[^\s]*$/i;

export const eventImageSchema = z.object({
  source: z.enum(['URL', 'CLOUDINARY']).default('URL'),
  url: z
    .string()
    .trim()
    .refine((val) => !val || safeUrlRegex.test(val), {
      message: 'Image URL must be a valid http:// or https:// web address'
    })
    .default(''),
  publicId: z.string().trim().nullable().optional().default(null)
});

export const createEventSchema = z.object({
  title: z
    .string({ required_error: 'Title is required' })
    .trim()
    .min(3, 'Title must be at least 3 characters')
    .max(200, 'Title cannot exceed 200 characters'),
  description: z
    .string({ required_error: 'Description is required' })
    .trim()
    .min(10, 'Description must be at least 10 characters')
    .max(5000, 'Description cannot exceed 5000 characters'),
  eventDate: z
    .string({ required_error: 'Event date is required' })
    .refine((val) => !isNaN(Date.parse(val)), {
      message: 'Invalid date format'
    })
    .refine((val) => new Date(val).getTime() > Date.now(), {
      message: 'Event date must be in the future'
    }),
  venue: z
    .string({ required_error: 'Venue is required' })
    .trim()
    .min(3, 'Venue must be at least 3 characters')
    .max(300, 'Venue cannot exceed 300 characters'),
  seatLimit: z.coerce
    .number({ required_error: 'Seat limit is required' })
    .int('Seat limit must be an integer')
    .min(1, 'Seat limit must be at least 1')
    .max(100000, 'Seat limit cannot exceed 100,000'),
  category: z.string().trim().max(50).optional().default('General'),
  isPaid: z.boolean().optional().default(false),
  ticketPrice: z.coerce
    .number()
    .min(0, 'Ticket price cannot be negative')
    .optional()
    .default(0),
  currency: z.string().trim().toUpperCase().optional().default('INR'),
  seatingType: z.enum(['GENERAL_ADMISSION', 'ASSIGNED_SEATING']).optional().default('GENERAL_ADMISSION'),
  maxTicketsPerBooking: z.coerce.number().min(1).max(10).optional().default(6),
  seatingConfig: z.any().optional(),
  bannerUrl: z
    .string()
    .trim()
    .refine((val) => !val || safeUrlRegex.test(val), {
      message: 'Banner URL must be a valid http:// or https:// address'
    })
    .optional()
    .default(''),
  image: eventImageSchema.optional()
}).superRefine((data, ctx) => {
  if (data.isPaid && (!data.ticketPrice || data.ticketPrice <= 0)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Paid events must have a ticket price greater than 0',
      path: ['ticketPrice']
    });
  }
});

export const updateEventSchema = z.object({
  title: z.string().trim().min(3).max(200).optional(),
  description: z.string().trim().min(10).max(5000).optional(),
  eventDate: z
    .string()
    .refine((val) => !isNaN(Date.parse(val)), {
      message: 'Invalid date format'
    })
    .refine((val) => new Date(val).getTime() > Date.now(), {
      message: 'Event date must be in the future'
    })
    .optional(),
  venue: z.string().trim().min(3).max(300).optional(),
  seatLimit: z.coerce
    .number()
    .int('Seat limit must be an integer')
    .min(0, 'Seat limit cannot be negative')
    .max(100000, 'Seat limit cannot exceed 100,000')
    .optional(),
  category: z.string().trim().max(50).optional(),
  isPaid: z.boolean().optional(),
  ticketPrice: z.coerce.number().min(0).optional(),
  currency: z.string().trim().toUpperCase().optional(),
  seatingType: z.enum(['GENERAL_ADMISSION', 'ASSIGNED_SEATING']).optional(),
  maxTicketsPerBooking: z.coerce.number().min(1).max(10).optional(),
  seatingConfig: z.any().optional(),
  bannerUrl: z
    .string()
    .trim()
    .refine((val) => !val || safeUrlRegex.test(val), {
      message: 'Banner URL must be a valid http:// or https:// address'
    })
    .optional(),
  image: eventImageSchema.optional()
});

export const cancellationRequestSchema = z.object({
  reason: z.string().trim().max(500, 'Reason cannot exceed 500 characters').optional()
});

export const cancellationDecisionSchema = z.object({
  decision: z.enum(['APPROVE', 'REJECT'], {
    errorMap: () => ({ message: 'Decision must be either APPROVE or REJECT' })
  }),
  note: z.string().trim().max(500, 'Decision note cannot exceed 500 characters').optional()
});

import { z } from 'zod';

export const createSeatHoldSchema = z.object({
  seatIds: z
    .array(z.string().min(1, 'Invalid seat ID'))
    .min(1, 'At least one seat must be selected')
    .max(10, 'A maximum of 10 seats can be held at once')
});

export const toggleSeatBlockSchema = z.object({
  block: z.boolean().default(true)
});

export const generateLayoutSchema = z.object({
  generationMode: z.enum(['AUTOMATIC', 'CUSTOM']).optional(),
  totalSeats: z.coerce.number().int().min(1).max(5000).optional(),
  rows: z.union([z.coerce.number().int().min(1).max(50), z.string()]).optional(),
  seatsPerRow: z.coerce.number().int().min(1).max(100).optional(),
  startingRowLabel: z.string().max(2).optional(),
  category: z.string().optional(),
  price: z.coerce.number().min(0).optional(),
  customLayout: z
    .object({
      name: z.string().optional(),
      description: z.string().optional(),
      sections: z.array(z.any()).optional()
    })
    .optional()
});

export const confirmFreeSeatBookingSchema = z.object({
  holdId: z.string().min(1, 'Hold ID is required')
});

export const verifyTicketSchema = z.object({
  token: z.string().min(1, 'Token is required'),
  markRedeemed: z.boolean().optional().default(false)
});

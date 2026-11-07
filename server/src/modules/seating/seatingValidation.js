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
  customLayout: z
    .object({
      venueType: z.string().optional(),
      sections: z.array(z.any()).optional()
    })
    .optional()
});


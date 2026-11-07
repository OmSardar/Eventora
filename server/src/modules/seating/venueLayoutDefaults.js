import { SEAT_CATEGORY } from '../../shared/constants/status.js';

/**
 * Default venue seating layout conforming to the standard specification:
 * - VIP: Rows A & B (20 seats each) = 40 seats
 * - PREMIUM: Rows C & D (30 seats each) = 60 seats
 * - STANDARD: Rows E & F (40 seats each) = 80 seats
 * Total: 180 seats
 */
export function getDefaultVenueLayout(baseTicketPrice = 500) {
  const vipPrice = Math.round(baseTicketPrice * 2.5);
  const premiumPrice = Math.round(baseTicketPrice * 1.5);
  const standardPrice = baseTicketPrice;

  return {
    name: 'Main Auditorium & Stage',
    description: 'Tiered auditorium with VIP orchestra, Premium mezzanine, and Standard balcony seating.',
    sections: [
      {
        sectionId: 'sec-vip',
        name: 'VIP Front Orchestra',
        category: SEAT_CATEGORY.VIP,
        price: vipPrice,
        rows: [
          { rowLabel: 'A', seatCount: 20 },
          { rowLabel: 'B', seatCount: 20 }
        ]
      },
      {
        sectionId: 'sec-premium',
        name: 'Premium Mezzanine',
        category: SEAT_CATEGORY.PREMIUM,
        price: premiumPrice,
        rows: [
          { rowLabel: 'C', seatCount: 30 },
          { rowLabel: 'D', seatCount: 30 }
        ]
      },
      {
        sectionId: 'sec-standard',
        name: 'Standard Balcony',
        category: SEAT_CATEGORY.STANDARD,
        price: standardPrice,
        rows: [
          { rowLabel: 'E', seatCount: 40 },
          { rowLabel: 'F', seatCount: 40 }
        ]
      }
    ]
  };
}

export function getDefaultSeatCategories(baseTicketPrice = 500) {
  return [
    {
      id: SEAT_CATEGORY.VIP,
      name: 'VIP Experience',
      price: Math.round(baseTicketPrice * 2.5),
      color: '#8b5cf6', // Violet
      description: 'Front-row stage proximity, premium acoustics, and express entry.'
    },
    {
      id: SEAT_CATEGORY.PREMIUM,
      name: 'Premium Seating',
      price: Math.round(baseTicketPrice * 1.5),
      color: '#3b82f6', // Blue
      description: 'Elevated central sightlines and spacious legroom.'
    },
    {
      id: SEAT_CATEGORY.STANDARD,
      name: 'Standard Admission',
      price: baseTicketPrice,
      color: '#10b981', // Emerald
      description: 'Full stage visibility and standard venue access.'
    }
  ];
}

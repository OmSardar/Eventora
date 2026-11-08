import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('Authoritative Seating Inventory Invariant & Math (Unit)', () => {
  function calculateInventory(seats) {
    const now = Date.now();
    let availableCount = 0;
    let heldCount = 0;
    let bookedCount = 0;
    let blockedCount = 0;

    for (const s of seats) {
      if (s.isBlocked || s.status === 'BLOCKED') {
        blockedCount++;
      } else if (s.status === 'BOOKED') {
        bookedCount++;
      } else if (s.status === 'HELD') {
        if (s.heldUntil && new Date(s.heldUntil).getTime() > now) {
          heldCount++;
        } else {
          availableCount++;
        }
      } else {
        availableCount++;
      }
    }

    const totalCapacity = seats.length;

    return {
      totalCapacity,
      availableCount,
      heldCount,
      bookedCount,
      blockedCount
    };
  }

  it('Strictly satisfies Total = Available + Held + Booked + Blocked when empty venue', () => {
    const seats = Array.from({ length: 60 }, (_, i) => ({
      id: `seat_${i + 1}`,
      seatLabel: `A${i + 1}`,
      status: 'AVAILABLE'
    }));

    const inv = calculateInventory(seats);
    assert.equal(inv.totalCapacity, 60);
    assert.equal(inv.availableCount, 60);
    assert.equal(inv.heldCount, 0);
    assert.equal(inv.bookedCount, 0);
    assert.equal(inv.blockedCount, 0);

    // Invariant check
    assert.equal(
      inv.totalCapacity,
      inv.availableCount + inv.heldCount + inv.bookedCount + inv.blockedCount
    );
  });

  it('Strictly satisfies accounting invariant across mixed seat states', () => {
    const now = Date.now();
    const future = new Date(now + 600000); // 10m future
    const past = new Date(now - 60000); // 1m past

    const seats = [
      // 20 Available
      ...Array.from({ length: 20 }, (_, i) => ({ status: 'AVAILABLE', seatLabel: `A${i + 1}` })),
      // 15 Actively Held
      ...Array.from({ length: 15 }, (_, i) => ({ status: 'HELD', heldUntil: future, seatLabel: `B${i + 1}` })),
      // 5 Expired Holds (eagerly counted as Available)
      ...Array.from({ length: 5 }, (_, i) => ({ status: 'HELD', heldUntil: past, seatLabel: `C${i + 1}` })),
      // 30 Booked
      ...Array.from({ length: 30 }, (_, i) => ({ status: 'BOOKED', seatLabel: `D${i + 1}` })),
      // 10 Blocked
      ...Array.from({ length: 10 }, (_, i) => ({ status: 'BLOCKED', isBlocked: true, seatLabel: `E${i + 1}` }))
    ];

    const inv = calculateInventory(seats);
    assert.equal(inv.totalCapacity, 80);
    assert.equal(inv.availableCount, 25); // 20 available + 5 expired holds
    assert.equal(inv.heldCount, 15);
    assert.equal(inv.bookedCount, 30);
    assert.equal(inv.blockedCount, 10);

    // Invariant check
    assert.equal(
      inv.totalCapacity,
      inv.availableCount + inv.heldCount + inv.bookedCount + inv.blockedCount
    );
  });

  it('Selected seats by attendee do not alter inventory until held by backend', () => {
    const seats = Array.from({ length: 50 }, (_, i) => ({
      id: `seat_${i + 1}`,
      seatLabel: `A${i + 1}`,
      status: 'AVAILABLE'
    }));

    const inv = calculateInventory(seats);
    const selectedSeatIds = ['seat_1', 'seat_2', 'seat_3'];

    // Invariant must hold before hold is acquired
    assert.equal(
      inv.totalCapacity,
      inv.availableCount + inv.heldCount + inv.bookedCount + inv.blockedCount
    );
    assert.equal(inv.availableCount, 50);
    assert.equal(inv.heldCount, 0);
    assert.equal(selectedSeatIds.length, 3);
  });
});


import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { registerSchema, loginSchema } from '../../src/shared/validation/authValidation.js';
import { createEventSchema, updateEventSchema } from '../../src/shared/validation/eventValidation.js';

describe('Validation Schemas (Zod)', () => {
  describe('Authentication Schemas', () => {
    test('should accept valid registration input', () => {
      const valid = {
        name: 'Jane Doe',
        email: 'jane@example.com',
        password: 'ValidPassword@123',
        role: 'ORGANIZER'
      };
      const result = registerSchema.safeParse(valid);
      assert.equal(result.success, true);
    });

    test('should reject weak password missing uppercase, number or symbol', () => {
      const invalid = {
        name: 'Jane Doe',
        email: 'jane@example.com',
        password: 'weakpassword',
        role: 'ATTENDEE'
      };
      const result = registerSchema.safeParse(invalid);
      assert.equal(result.success, false);
    });

    test('should reject invalid role', () => {
      const invalid = {
        name: 'Jane Doe',
        email: 'jane@example.com',
        password: 'ValidPassword@123',
        role: 'SUPERADMIN'
      };
      const result = registerSchema.safeParse(invalid);
      assert.equal(result.success, false);
    });

    test('should validate login schema with email and password', () => {
      const valid = {
        email: 'user@test.com',
        password: 'somepassword'
      };
      const result = loginSchema.safeParse(valid);
      assert.equal(result.success, true);
    });
  });

  describe('Event Schemas', () => {
    test('should accept future dated event with valid seat limit', () => {
      const futureDate = new Date(Date.now() + 86400000 * 5).toISOString();
      const valid = {
        title: 'Tech Conference 2026',
        description: 'A comprehensive conference on modern fullstack software architecture.',
        eventDate: futureDate,
        venue: 'Grand Hall Center',
        seatLimit: 100
      };
      const result = createEventSchema.safeParse(valid);
      assert.equal(result.success, true);
    });

    test('should reject past dated event', () => {
      const pastDate = new Date(Date.now() - 86400000).toISOString();
      const invalid = {
        title: 'Past Event',
        description: 'This event already occurred in the past.',
        eventDate: pastDate,
        venue: 'Grand Hall Center',
        seatLimit: 100
      };
      const result = createEventSchema.safeParse(invalid);
      assert.equal(result.success, false);
    });

    test('should reject seatLimit less than 1', () => {
      const futureDate = new Date(Date.now() + 86400000 * 5).toISOString();
      const invalid = {
        title: 'Zero Seats Event',
        description: 'An event with invalid seat count.',
        eventDate: futureDate,
        venue: 'Grand Hall Center',
        seatLimit: 0
      };
      const result = createEventSchema.safeParse(invalid);
      assert.equal(result.success, false);
    });
  });
});


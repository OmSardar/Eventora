import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { validateSessionSecret } from '../../src/infrastructure/session/sessionConfig.js';

describe('Session Secret Validation', () => {
  describe('Production Environment', () => {
    test('should throw if SESSION_SECRET is completely missing in production', () => {
      assert.throws(
        () => validateSessionSecret({ NODE_ENV: 'production' }),
        { message: /FATAL CONFIGURATION ERROR: SESSION_SECRET is missing or less than 32 characters/ }
      );
    });

    test('should throw if SESSION_SECRET is empty string or whitespace in production', () => {
      assert.throws(
        () => validateSessionSecret({ NODE_ENV: 'production', SESSION_SECRET: '   ' }),
        { message: /FATAL CONFIGURATION ERROR: SESSION_SECRET is missing or less than 32 characters/ }
      );
    });

    test('should throw if SESSION_SECRET is less than 32 characters in production', () => {
      assert.throws(
        () => validateSessionSecret({ NODE_ENV: 'production', SESSION_SECRET: 'short-secret-key-123' }),
        { message: /FATAL CONFIGURATION ERROR: SESSION_SECRET is missing or less than 32 characters/ }
      );
    });

    test('should throw if SESSION_SECRET contains default development fallback string in production', () => {
      assert.throws(
        () =>
          validateSessionSecret({
            NODE_ENV: 'production',
            SESSION_SECRET: 'eventora-super-secure-secret-key-change-in-production-min-32-chars!'
          }),
        { message: /Default development SESSION_SECRET detected in production/ }
      );
    });

    test('should accept a secure 32+ character random secret in production', () => {
      const secureSecret = 'c7e8a9f0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8';
      const result = validateSessionSecret({
        NODE_ENV: 'production',
        SESSION_SECRET: secureSecret
      });
      assert.equal(result, secureSecret);
    });
  });

  describe('Development / Test Environment', () => {
    test('should fallback to default secret if missing in development', () => {
      const result = validateSessionSecret({ NODE_ENV: 'development' });
      assert.equal(result, 'eventora-super-secure-secret-key-change-in-production-min-32-chars!');
    });

    test('should fallback to default secret if missing in test', () => {
      const result = validateSessionSecret({ NODE_ENV: 'test' });
      assert.equal(result, 'eventora-super-secure-secret-key-change-in-production-min-32-chars!');
    });

    test('should use provided SESSION_SECRET in development if present', () => {
      const result = validateSessionSecret({ NODE_ENV: 'development', SESSION_SECRET: 'custom-dev-secret' });
      assert.equal(result, 'custom-dev-secret');
    });
  });
});


import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeOrigin,
  getAllowedOrigins,
  isOriginAllowed
} from '../../src/shared/middleware/securityMiddleware.js';

describe('Security Middleware Origin Validation', () => {
  const originalAllowedOrigins = process.env.ALLOWED_ORIGINS;
  const originalAppBaseUrl = process.env.APP_BASE_URL;
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.ALLOWED_ORIGINS = originalAllowedOrigins;
    process.env.APP_BASE_URL = originalAppBaseUrl;
    process.env.NODE_ENV = originalNodeEnv;
  });

  describe('normalizeOrigin', () => {
    it('normalizes origin by trimming and stripping trailing slashes', () => {
      assert.equal(normalizeOrigin(' https://eventora-black.vercel.app/ '), 'https://eventora-black.vercel.app');
      assert.equal(normalizeOrigin('https://EVENTORA.EXAMPLE.COM///'), 'https://eventora.example.com');
    });

    it('returns empty string for null, undefined, or empty origin', () => {
      assert.equal(normalizeOrigin(null), '');
      assert.equal(normalizeOrigin(undefined), '');
      assert.equal(normalizeOrigin('   '), '');
    });
  });

  describe('isOriginAllowed', () => {
    it('allows Vercel production and preview domains automatically', () => {
      assert.equal(isOriginAllowed('https://eventora-black.vercel.app'), true);
      assert.equal(isOriginAllowed('https://eventora-black.vercel.app/'), true);
      assert.equal(isOriginAllowed('https://eventora-git-feature-omslabs.vercel.app'), true);
    });

    it('allows Render deployments automatically', () => {
      assert.equal(isOriginAllowed('https://eventora-server-omslabs.onrender.com'), true);
    });

    it('allows origins configured in ALLOWED_ORIGINS', () => {
      process.env.ALLOWED_ORIGINS = 'https://custom-domain.org, https://staging.example.com/';
      assert.equal(isOriginAllowed('https://custom-domain.org'), true);
      assert.equal(isOriginAllowed('https://staging.example.com'), true);
      assert.equal(isOriginAllowed('https://staging.example.com/'), true);
    });

    it('allows origin configured in APP_BASE_URL', () => {
      process.env.APP_BASE_URL = 'https://eventora-app.com/';
      assert.equal(isOriginAllowed('https://eventora-app.com'), true);
    });

    it('supports wildcard patterns in ALLOWED_ORIGINS', () => {
      process.env.ALLOWED_ORIGINS = 'https://*.example-company.com';
      assert.equal(isOriginAllowed('https://portal.example-company.com'), true);
      assert.equal(isOriginAllowed('https://dashboard.example-company.com'), true);
      assert.equal(isOriginAllowed('https://unrelated.com'), false);
    });

    it('rejects untrusted third-party origins', () => {
      process.env.ALLOWED_ORIGINS = 'https://eventora-black.vercel.app';
      assert.equal(isOriginAllowed('http://malicious-phishing-site.com'), false);
      assert.equal(isOriginAllowed('https://attacker-domain.org'), false);
    });

    it('returns false for null or undefined origin', () => {
      assert.equal(isOriginAllowed(null), false);
      assert.equal(isOriginAllowed(undefined), false);
      assert.equal(isOriginAllowed(''), false);
    });
  });
});


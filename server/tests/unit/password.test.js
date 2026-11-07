import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword } from '../../src/infrastructure/security/password.js';

describe('Password Security (Argon2id)', () => {
  test('should hash a plain password into a secure Argon2id string', async () => {
    const plain = 'MySecretPass@123';
    const hash = await hashPassword(plain);

    assert.ok(hash);
    assert.ok(hash.startsWith('$argon2id$'));
    assert.notEqual(hash, plain);
  });

  test('should correctly verify valid password against hash', async () => {
    const plain = 'StrongP@ssw0rd!2026';
    const hash = await hashPassword(plain);

    const isValid = await verifyPassword(plain, hash);
    assert.equal(isValid, true);
  });

  test('should reject invalid password against hash', async () => {
    const plain = 'StrongP@ssw0rd!2026';
    const wrong = 'WrongPassword@123';
    const hash = await hashPassword(plain);

    const isValid = await verifyPassword(wrong, hash);
    assert.equal(isValid, false);
  });

  test('should handle empty or null password safely without crashing', async () => {
    const isValid = await verifyPassword('', '$argon2id$v=19$m=19456,t=2,p=1$fake$fake');
    assert.equal(isValid, false);

    const isNullValid = await verifyPassword(null, null);
    assert.equal(isNullValid, false);
  });
});


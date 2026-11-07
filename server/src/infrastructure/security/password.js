import argon2 from 'argon2';

const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19456, // 19 MiB according to OWASP recommendations
  timeCost: 2,
  parallelism: 1
};

export async function hashPassword(plainPassword) {
  if (!plainPassword || typeof plainPassword !== 'string') {
    throw new Error('Invalid password provided for hashing');
  }
  return argon2.hash(plainPassword, ARGON2_OPTIONS);
}

export async function verifyPassword(plainPassword, passwordHash) {
  if (!plainPassword || !passwordHash) {
    return false;
  }
  try {
    return await argon2.verify(passwordHash, plainPassword);
  } catch {
    return false;
  }
}

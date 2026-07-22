import { pbkdf2Sync, randomBytes, timingSafeEqual } from "crypto";

const HASH_ALGORITHM = "sha256";
const KEY_LENGTH = 64;
const ITERATIONS = 120_000;
const HASH_PREFIX = "pbkdf2";

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = pbkdf2Sync(
    password,
    salt,
    ITERATIONS,
    KEY_LENGTH,
    HASH_ALGORITHM
  ).toString("hex");

  return `${HASH_PREFIX}$${ITERATIONS}$${salt}$${hash}`;
}

export function verifyPassword(password: string, storedHash?: string | null) {
  if (!storedHash) {
    return false;
  }

  const [prefix, iterationsText, salt, originalHash] = storedHash.split("$");

  if (prefix !== HASH_PREFIX || !iterationsText || !salt || !originalHash) {
    return false;
  }

  const iterations = Number(iterationsText);

  if (!Number.isInteger(iterations) || iterations <= 0) {
    return false;
  }

  const calculatedHash = pbkdf2Sync(
    password,
    salt,
    iterations,
    KEY_LENGTH,
    HASH_ALGORITHM
  ).toString("hex");

  const originalBuffer = Buffer.from(originalHash, "hex");
  const calculatedBuffer = Buffer.from(calculatedHash, "hex");

  if (originalBuffer.length !== calculatedBuffer.length) {
    return false;
  }

  return timingSafeEqual(originalBuffer, calculatedBuffer);
}

export function isStrongEnoughPassword(password: string) {
  const value = password.trim();
  return (
    value.length >= 12 &&
    /[a-z]/.test(value) &&
    /[A-Z]/.test(value) &&
    /\d/.test(value) &&
    /[^A-Za-z0-9]/.test(value)
  );
}

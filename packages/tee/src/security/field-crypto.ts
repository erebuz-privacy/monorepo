// At-rest field encryption for privacy-sensitive route data (the recipient — the
// secret half of the sender↔recipient link). AES-256-GCM with a key from the
// environment.
//
// THREAT MODEL (Phase 1 — software hardening):
//   Protects against: a stolen DB file / backup / disk snapshot, and anyone who
//   reads the database directly. The recipient is stored as ciphertext, so a raw
//   dump reveals nothing.
//   Does NOT protect against: a malicious operator of the *running* service — they
//   hold ROUTE_ENCRYPTION_KEY and can decrypt in-process. Making the operator
//   themselves blind requires running inside a hardware enclave (AWS Nitro) with
//   KMS-attested key release — that's Phase 2. In Phase 2 this same helper stays;
//   only the KEY SOURCE changes (enclave-sealed / KMS instead of an env var).
//
// Key: ROUTE_ENCRYPTION_KEY — 32-byte hex (openssl rand -hex 32), or any string
// (hashed to 32 bytes). If unset, encryption is a no-op passthrough so local dev
// keeps working — but production MUST set it.

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { logger } from '../managers/log';

const PREFIX = 'enc:v1:';
let warned = false;

function keyOrNull(): Buffer | null {
  const raw = process.env.ROUTE_ENCRYPTION_KEY;
  if (!raw) {
    if (!warned) {
      warned = true;
      logger.warn(
        'ROUTE_ENCRYPTION_KEY not set — sensitive route fields are stored in PLAINTEXT. Set it in production.',
        'Security'
      );
    }
    return null;
  }
  // Accept a 32-byte hex key directly; otherwise derive one deterministically.
  return /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, 'hex') : createHash('sha256').update(raw).digest();
}

/** True when at-rest encryption is active (a key is configured). */
export function fieldEncryptionEnabled(): boolean {
  return Boolean(process.env.ROUTE_ENCRYPTION_KEY);
}

/** Encrypt a value for storage. Returns the input unchanged if no key is set. */
export function encryptField(plain: string | null | undefined): string | null | undefined {
  if (plain == null) return plain;
  const key = keyOrNull();
  if (!key) return plain;
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + Buffer.concat([iv, tag, ct]).toString('base64');
}

/**
 * Decrypt a stored value. Values without the `enc:v1:` prefix are returned as-is
 * (legacy plaintext / passthrough), so this is safe to roll out over a DB that
 * still holds unencrypted rows.
 */
export function decryptField(stored: string | null | undefined): string | null | undefined {
  if (stored == null || !stored.startsWith(PREFIX)) return stored;
  const key = keyOrNull();
  if (!key) return stored; // can't decrypt without the key — surface the ciphertext
  try {
    const buf = Buffer.from(stored.slice(PREFIX.length), 'base64');
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const ct = buf.subarray(28);
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
  } catch (e) {
    logger.error('Failed to decrypt a route field (wrong ROUTE_ENCRYPTION_KEY?)', 'Security', e);
    return stored;
  }
}

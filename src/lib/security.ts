import crypto from "node:crypto";

/*
 * Server-side security primitives: keyed encryption at rest (AES-256-GCM),
 * per-user password hashing (scrypt with a unique salt), and opaque bearer
 * session tokens.
 *
 * The encryption key + pepper are deliberately sourced from the environment /
 * secure secret manager and are NEVER stored in the SQLite budget database.
 */

const ENC_ALGO = "aes-256-gcm";

/** Master data-key (32 bytes) sourced from env; stable across restarts. */
export function getDataKey(): Buffer {
  const raw = process.env.SMARTBUDGET_ENC_KEY;
  if (raw && raw.length >= 32) {
    return crypto.createHash("sha256").update(raw, "utf8").digest();
  }
  // Fallback only when no key is configured — derive a per-deployment key.
  // Prefer exporting SMARTBUDGET_ENC_KEY in production.
  const seed =
    process.env.HOSTNAME || process.env.SMARTBUDGET_HOST || "smartbudget";
  return crypto.createHash("sha256").update(`${seed}::smartbudget-data-key`).digest();
}

/** Encrypt a UTF-8 string and return "iv:authTag:ciphertext" (base64url). */
export function encryptValue(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ENC_ALGO, getDataKey(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString("base64url"), authTag.toString("base64url"), enc.toString("base64url")].join(
    ":",
  );
}

/** Decrypt a value produced by encryptValue. Returns null on any failure. */
export function decryptValue(payload: string): string | null {
  try {
    const [ivB, tagB, dataB] = payload.split(":");
    if (!ivB || !tagB || !dataB) return null;
    const decipher = crypto.createDecipheriv(
      ENC_ALGO,
      getDataKey(),
      Buffer.from(ivB, "base64url"),
    );
    decipher.setAuthTag(Buffer.from(tagB, "base64url"));
    const dec = Buffer.concat([
      decipher.update(Buffer.from(dataB, "base64url")),
      decipher.final(),
    ]);
    return dec.toString("utf8");
  } catch {
    return null;
  }
}

/** Wrap encryption so stored db blobs stay transport-agnostic. */
export function encryptJSON(value: unknown): string {
  return encryptValue(typeof value === "string" ? value : JSON.stringify(value));
}

export function decryptJSON<T = any>(payload: string): T | null {
  const raw = decryptValue(payload);
  if (raw == null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Password hashing — scrypt with a unique per-user salt              */
/* ------------------------------------------------------------------ */

const SCRYPT_KEYLEN = 64;
const KDF_PREFIX = "scrypt";

/** Hash a password into a self-describing "scrypt:saltN:salt:hash" string. */
export function hashPasswordScrypt(password: string): string {
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(password, salt, SCRYPT_KEYLEN, {
    N: 16384,
    r: 8,
    p: 1,
  });
  return [
    KDF_PREFIX,
    salt.length.toString(36),
    salt.toString("base64url"),
    derived.toString("base64url"),
  ].join(":");
}

/** Verify a password against a scrypt hash string. */
export function verifyPasswordScrypt(password: string, encoded: string): boolean {
  try {
    const [prefix, saltLenB, saltB, hashB] = String(encoded).split(":");
    if (prefix !== KDF_PREFIX || !saltB || !hashB) return false;
    const salt = Buffer.from(saltB, "base64url");
    const expected = Buffer.from(hashB, "base64url");
    const derived = crypto.scryptSync(password, salt, expected.length, { N: 16384, r: 8, p: 1 });
    const a = Buffer.from(derived);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* Opaque session tokens                                              */
/* ------------------------------------------------------------------ */

export const SESSION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export function generateSessionToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

/** Constant-time token comparison. */
export function tokensEqual(a: string, b: string): boolean {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

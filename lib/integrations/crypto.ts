import crypto from "crypto";

type EnvelopeV1 = {
  v: 1;
  alg: "aes-256-gcm";
  iv: string; // base64
  tag: string; // base64
  data: string; // base64 ciphertext
};

let warnedAboutFallback = false;

function stableKeyBytesFromSecret(secret: string): Buffer {
  // Derive a 32-byte key from a variable-length secret.
  // This avoids storing plaintext credentials when INTEGRATIONS_ENCRYPTION_KEY isn't explicitly set,
  // but still requires AUTH_SECRET/NEXTAUTH_SECRET to be stable across deploys.
  const salt = Buffer.from("mulify.library.integrations:v1", "utf8");
  const ab = crypto.hkdfSync("sha256", Buffer.from(secret, "utf8"), salt, Buffer.from("key", "utf8"), 32);
  return Buffer.from(ab);
}

function getEncryptionKeyBytes(): Buffer {
  const explicit = process.env.INTEGRATIONS_ENCRYPTION_KEY?.trim();
  if (explicit) {
    // Accept base64 (preferred) or raw string; normalize to 32 bytes via sha256 if needed.
    let raw: Buffer;
    try {
      raw = Buffer.from(explicit, "base64");
      if (raw.length < 16) raw = Buffer.from(explicit, "utf8");
    } catch {
      raw = Buffer.from(explicit, "utf8");
    }
    if (raw.length === 32) return raw;
    return crypto.createHash("sha256").update(raw).digest();
  }

  const fallback = process.env.AUTH_SECRET?.trim() || process.env.NEXTAUTH_SECRET?.trim();
  if (!fallback) {
    throw new Error("Missing encryption key. Set INTEGRATIONS_ENCRYPTION_KEY (recommended) or AUTH_SECRET/NEXTAUTH_SECRET.");
  }
  if (!warnedAboutFallback) {
    warnedAboutFallback = true;
    console.warn(
      JSON.stringify({
        ts: new Date().toISOString(),
        kind: "integration",
        level: "warn",
        message:
          "INTEGRATIONS_ENCRYPTION_KEY is not set. Falling back to AUTH_SECRET/NEXTAUTH_SECRET-derived key. Set INTEGRATIONS_ENCRYPTION_KEY in production for key rotation control.",
      })
    );
  }
  return stableKeyBytesFromSecret(fallback);
}

export function encryptJson(value: unknown): string {
  const key = getEncryptionKeyBytes();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const plaintext = Buffer.from(JSON.stringify(value ?? null), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  const env: EnvelopeV1 = {
    v: 1,
    alg: "aes-256-gcm",
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    data: ciphertext.toString("base64"),
  };
  return Buffer.from(JSON.stringify(env), "utf8").toString("base64");
}

export function decryptJson<T = unknown>(encoded: string): T {
  const key = getEncryptionKeyBytes();
  const raw = Buffer.from(encoded, "base64").toString("utf8");
  const env = JSON.parse(raw) as EnvelopeV1;
  if (!env || env.v !== 1 || env.alg !== "aes-256-gcm") {
    throw new Error("Invalid integration secret envelope");
  }
  const iv = Buffer.from(env.iv, "base64");
  const tag = Buffer.from(env.tag, "base64");
  const data = Buffer.from(env.data, "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
  return JSON.parse(plaintext) as T;
}

export function sha256Hex(input: string): string {
  return crypto.createHash("sha256").update(input, "utf8").digest("hex");
}


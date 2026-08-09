import * as crypto from "crypto";

/**
 * Encryption-at-rest helpers for the JWT signing secrets persisted in the
 * database (`internal.jwtSecret` / `internal.jwtSecretHistory`).
 *
 * A master key is provided via `JWT_SECRET_ENCRYPTION_KEY` (base64, 32 bytes =
 * AES-256). When the key is absent the values stay in plaintext (legacy mode),
 * so existing installs keep working unchanged. Values are tagged with an
 * `enc:v1:` prefix so plaintext and ciphertext can coexist during a rollout.
 */

const ENCRYPTED_PREFIX = "enc:v1:";

export function hasEncryptionKey(): boolean {
  const key = process.env.JWT_SECRET_ENCRYPTION_KEY?.trim();
  if (!key) return false;
  return Buffer.from(key, "base64").length === 32;
}

export function isEncrypted(value: string): boolean {
  return value.startsWith(ENCRYPTED_PREFIX);
}

export function encryptSecret(value: string): string {
  if (!hasEncryptionKey()) return value;
  const key = Buffer.from(process.env.JWT_SECRET_ENCRYPTION_KEY!.trim(), "base64");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["enc", "v1", iv.toString("base64"), tag.toString("base64"), encrypted.toString("base64")].join(":");
}

export function decryptSecret(value: string): string {
  if (!isEncrypted(value)) return value;
  const [, version, ivB64, tagB64, dataB64] = value.split(":");
  if (version !== "v1" || !ivB64 || !tagB64 || !dataB64) return value;

  const key = Buffer.from(process.env.JWT_SECRET_ENCRYPTION_KEY?.trim() ?? "", "base64");
  if (key.length !== 32) return value;

  try {
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      key,
      Buffer.from(ivB64, "base64"),
    );
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(dataB64, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    // Corrupted ciphertext or wrong key — return the raw value so the caller
    // can surface the misconfiguration instead of silently forging a secret.
    return value;
  }
}

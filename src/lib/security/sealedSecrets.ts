import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import { requireEnv } from "@/lib/server/env";

const ENCRYPTION_KEY_ENV = "MANAGED_BOT_TOKEN_ENCRYPTION_KEY_BASE64";
const IV_BYTE_LENGTH = 12;
const AUTH_TAG_BYTE_LENGTH = 16;

function getEncryptionKey(): Buffer {
  const encoded = requireEnv(ENCRYPTION_KEY_ENV);
  const key = Buffer.from(encoded, "base64");

  if (key.length !== 32) {
    throw new Error(
      `${ENCRYPTION_KEY_ENV} must decode to a 32-byte key for AES-256-GCM`,
    );
  }

  return key;
}

export function encryptSecret(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_BYTE_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  const payload = Buffer.concat([iv, authTag, ciphertext]);

  return payload.toString("base64");
}

export function decryptSecret(payloadBase64: string): string {
  const payload = Buffer.from(payloadBase64, "base64");

  if (payload.length <= IV_BYTE_LENGTH + AUTH_TAG_BYTE_LENGTH) {
    throw new Error("Encrypted payload is malformed");
  }

  const iv = payload.subarray(0, IV_BYTE_LENGTH);
  const authTag = payload.subarray(IV_BYTE_LENGTH, IV_BYTE_LENGTH + AUTH_TAG_BYTE_LENGTH);
  const ciphertext = payload.subarray(IV_BYTE_LENGTH + AUTH_TAG_BYTE_LENGTH);
  const key = getEncryptionKey();
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

  return plaintext.toString("utf8");
}

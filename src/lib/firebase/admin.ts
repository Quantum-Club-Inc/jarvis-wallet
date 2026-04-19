import "server-only";

import { cert, getApp, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

function requireAdminEnv(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Missing required Firebase admin env var: ${name}`);
  }

  return value;
}

function normalizeAdminPrivateKey(value: string): string {
  const normalized = value
    .trim()
    .replace(/^['"]|['"]$/g, "")
    .replace(/\\n/g, "\n");

  if (
    !normalized.includes("-----BEGIN PRIVATE KEY-----") ||
    !normalized.includes("-----END PRIVATE KEY-----")
  ) {
    throw new Error(
      "FIREBASE_PRIVATE_KEY is not a valid PEM key. Provide the full key and keep line breaks (or use \\n escapes).",
    );
  }

  return normalized;
}

export function getAdminApp() {
  if (getApps().length > 0) {
    return getApp();
  }

  const projectId = requireAdminEnv(
    "FIREBASE_PROJECT_ID",
    process.env.FIREBASE_PROJECT_ID,
  );
  const clientEmail = requireAdminEnv(
    "FIREBASE_CLIENT_EMAIL",
    process.env.FIREBASE_CLIENT_EMAIL,
  );
  const privateKey = normalizeAdminPrivateKey(
    requireAdminEnv("FIREBASE_PRIVATE_KEY", process.env.FIREBASE_PRIVATE_KEY),
  );

  return initializeApp({
    credential: cert({
      projectId,
      clientEmail,
      privateKey,
    }),
  });
}

export function getAdminDb() {
  return getFirestore(getAdminApp());
}

export function getAdminAuth() {
  return getAuth(getAdminApp());
}

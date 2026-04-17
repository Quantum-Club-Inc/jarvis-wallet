import "server-only";

import { cert, getApp, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

function requireAdminEnv(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Missing required Firebase admin env var: ${name}`);
  }

  return value;
}

function getAdminApp() {
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
  const privateKey = requireAdminEnv(
    "FIREBASE_PRIVATE_KEY",
    process.env.FIREBASE_PRIVATE_KEY,
  ).replace(/\\n/g, "\n");

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

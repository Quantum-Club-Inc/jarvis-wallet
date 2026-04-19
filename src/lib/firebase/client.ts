import { initializeApp, getApps } from "firebase/app";
import { Auth, getAuth } from "firebase/auth";
import { FirebaseStorage, getStorage } from "firebase/storage";

function normalizePublicEnv(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value.trim().replace(/^['"]|['"]$/g, "");
  return normalized || undefined;
}

function normalizeFirebaseApiKey(value: string | undefined): string | undefined {
  const normalized = normalizePublicEnv(value);
  if (!normalized) {
    return undefined;
  }

  const extracted = normalized.match(/AIza[0-9A-Za-z_-]{35}/)?.[0];
  return extracted ?? normalized;
}

function normalizeFirebaseAuthDomain(
  value: string | undefined,
  projectId?: string,
): string | undefined {
  const normalized = normalizePublicEnv(value);
  if (normalized) {
    const extracted = normalized.match(
      /[a-z0-9-]+\.firebaseapp\.com/i,
    )?.[0];
    return extracted ?? normalized;
  }

  if (projectId) {
    return `${projectId}.firebaseapp.com`;
  }

  return undefined;
}

const projectId = normalizePublicEnv(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID);

const firebaseConfig = {
  apiKey:
    normalizeFirebaseApiKey(process.env.NEXT_PUBLIC_FIREBASE_API_KEY) ??
    normalizeFirebaseApiKey(process.env.NEXT_PUBLIC_FIREBASE_WEB_API_KEY) ??
    normalizeFirebaseApiKey(process.env.NEXT_PUBLIC_FIREBASE_KEY),
  authDomain:
    normalizeFirebaseAuthDomain(process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN, projectId) ??
    normalizeFirebaseAuthDomain(process.env.NEXT_PUBLIC_FIREBASE_WEB_AUTH_DOMAIN, projectId),
  projectId,
  storageBucket: normalizePublicEnv(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET),
  messagingSenderId: normalizePublicEnv(
    process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  ),
  appId: normalizePublicEnv(process.env.NEXT_PUBLIC_FIREBASE_APP_ID),
  measurementId: normalizePublicEnv(process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID),
};

const missingConfig = Object.entries(firebaseConfig)
  .filter(([, value]) => value === undefined)
  .map(([key]) => key)
  .filter((key) => key !== "measurementId");

const hasInvalidApiKeyFormat =
  !missingConfig.includes("apiKey") &&
  !/^AIza[0-9A-Za-z_-]{35}$/.test(firebaseConfig.apiKey ?? "");
const firebaseClientConfigError = missingConfig.length > 0
  ? `[Firebase] Missing client config keys: ${missingConfig.join(", ")}. Set NEXT_PUBLIC_FIREBASE_* vars in your environment.`
  : hasInvalidApiKeyFormat
    ? "[Firebase] NEXT_PUBLIC_FIREBASE_API_KEY format looks invalid. Use the Web API key from Firebase project settings."
    : null;

if (firebaseClientConfigError && typeof window !== "undefined") {
  console.error(firebaseClientConfigError);
}

const currentApps = getApps();
let auth: Auth | null = null;
let storage: FirebaseStorage | null = null;

if (!firebaseClientConfigError) {
  if (!currentApps.length) {
    const app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    storage = getStorage(app);
  } else {
    const app = currentApps[0];
    auth = getAuth(app);
    storage = getStorage(app);
  }
}

export { auth, storage, firebaseClientConfigError };

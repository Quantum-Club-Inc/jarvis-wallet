## Jarvis Wallet

Voice-first TON DeFi wallet for Telegram managed bots, built with Next.js and deployed on Vercel.

### Stack (current)

- Next.js 16 (App Router, TypeScript, Tailwind CSS)
- Firebase Firestore (`firebase`, `firebase-admin`) for app data
- Google Gemini via Vercel AI SDK for Jarvis agent responses
- Planned integrations: Telegram managed bots, STON.fi, Tonstakers, AI agent APIs

## Firebase setup

1. Create a Firebase project.
2. Enable Firestore.
3. Create a Web App and copy client credentials.
4. Create a Service Account and copy Admin SDK credentials.
5. Add the required variables in `.env`/`.env.local` (and in Vercel project env vars).

## Required environment variables

### Firebase client

- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID`

### Firebase admin

- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`

### Telegram managed bots

- `TELEGRAM_MANAGER_BOT_TOKEN`
- `TELEGRAM_MANAGER_BOT_USERNAME`
- `TELEGRAM_WEBHOOK_SECRET_TOKEN`
- `TELEGRAM_MINI_APP_URL`
- `APP_BASE_URL`

### Secrets

- `MANAGED_BOT_TOKEN_ENCRYPTION_KEY_BASE64` (must decode to 32 bytes for AES-256-GCM)
- `GOOGLE_GENERATIVE_AI_API_KEY` or `GEMINI_API_KEY`
- `JARVIS_AGENT_MODEL` (optional, defaults to `gemini-flash-latest`)

## Local development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Firebase helpers in this repo

- Client SDK: `src/lib/firebase/client.ts`
- Admin SDK (server-only): `src/lib/firebase/admin.ts`

## Webhook endpoint

- Manager bot webhook: `POST /api/webhook`
- Managed bot webhook URL pattern: `POST /api/webhook?managedBotId=<BOT_USER_ID>`

The manager route handles `/start`, `managed_bot` updates, fetches managed bot tokens through `getManagedBotToken`, stores encrypted tokens in Firestore, and configures each managed bot webhook/menu.

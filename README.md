## Jarvis Wallet

Voice-first TON DeFi wallet for Telegram, built with Next.js and deployed on Vercel.

#### Stack (current)

- Next.js 16 (App Router, TypeScript, Tailwind CSS)
- Firebase Firestore (`firebase`, `firebase-admin`) for app data
- Google Gemini via Vercel AI SDK for Jarvis agent responses
- Planned integrations: STON.fi, Tonstakers, AI agent APIs

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

### Telegram bot

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_WEBHOOK_SECRET_TOKEN`

### Secrets

- `GOOGLE_GENERATIVE_AI_API_KEY` or `GEMINI_API_KEY`
- `JARVIS_AGENT_MODEL` (optional, defaults to `gemini-3-flash-preview`)
- `GOOGLE_STT_MODEL` (optional, defaults to `gemini-flash-latest` for voice transcription)

### n8n automation

- `N8N_WEBHOOK_SECRET` (shared secret used by n8n webhook auth)
- `N8N_AGENT_WEBHOOK_URL` (optional; if set, Jarvis tools call this n8n webhook directly for swap/stake execution)
- `AUTOMATION_WALLET_MNEMONIC` (server-side wallet mnemonic for autonomous execution)
- `AUTOMATION_WALLET_ADDRESS` (must match the mnemonic-derived address)
- `AUTOMATION_TONAPI_BASE_URL` (optional, defaults to `https://tonapi.io`)

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

- Bot webhook: `POST /api/webhook`
- n8n automation webhook: `POST /api/automation/n8n`
- Voice transcription endpoint: `POST /api/voice/transcribe`

The webhook route handles `/start`, `/help`, and forwards plain-text user requests to the AI agent.

## Voice transcription providers

`/api/voice/transcribe` uses:
1. **Primary:** Gemini audio transcription (`GOOGLE_GENERATIVE_AI_API_KEY` or `GEMINI_API_KEY`)

If Gemini quota/rate-limit is hit, transcription will fail until quota resets or billing is updated.

## n8n integration (autonomous swap/stake)

This repo includes an n8n-ready webhook endpoint that can run swap/stake actions end-to-end.

Jarvis agent behavior:
- In **VOICE mode**, `swap_tokens` and `stake_ton` execute through the n8n automation path automatically.
- In **CHAT mode**, direct swap/stake commands also execute through n8n automation.
- In **OVERVIEW mode**, swap/stake remain preview-style and do not submit.

### 1) Configure n8n Webhook node

Based on n8n webhook docs:
- Use a **Production URL** for active workflows.
- Use **POST** method.
- Use **Header auth** (or Bearer auth) with your secret.

Recommended header auth:
- Header name: `x-jarvis-n8n-secret`
- Header value: `${N8N_WEBHOOK_SECRET}`

### 2) Call the Jarvis automation endpoint

`POST /api/automation/n8n`

Required fields:
- `requestId` (string, required for idempotency)
- `action` (`"swap"` or `"stake"`)
- `dryRun` (optional boolean)

Swap payload:

```json
{
  "requestId": "swap-2026-04-19-0001",
  "action": "swap",
  "offerTokenSymbol": "TON",
  "askTokenSymbol": "USDT",
  "offerAmount": "2.5",
  "dryRun": false
}
```

Stake payload:

```json
{
  "requestId": "stake-2026-04-19-0001",
  "action": "stake",
  "amountTon": "10",
  "dryRun": false
}
```

Behavior:
- Validates and reserves `requestId` in Firestore (`automationRequests` collection).
- For swap: fetches quote, prepares transfer, signs external message, and submits via TonAPI `/v2/blockchain/message`.
- For stake: prepares Tonstakers transfer, signs external message, and submits via TonAPI `/v2/blockchain/message`.
- If `dryRun` is `true`, prepares messages but does not submit on-chain.

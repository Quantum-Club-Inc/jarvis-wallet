import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";

import { adminDb } from "@/lib/firebase/admin";
import { requireEnv } from "@/lib/server/env";
import { decryptSecret, encryptSecret } from "@/lib/security/sealedSecrets";
import { callTelegramApi } from "@/lib/telegram/api";
import type {
  TelegramManagedBotUpdated,
  TelegramMessage,
  TelegramUpdate,
} from "@/lib/telegram/types";

export const runtime = "nodejs";

function getSecretTokenFromHeaders(request: NextRequest): string | null {
  return request.headers.get("x-telegram-bot-api-secret-token");
}

function getBaseUrl(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

function getSuggestedBotUsername(userId: number): string {
  return `jarvis${Math.abs(userId).toString(36)}bot`;
}

function getManagedBotCreationLink(userId: number): string {
  const managerUsername = requireEnv("TELEGRAM_MANAGER_BOT_USERNAME");
  const suggestedUsername = getSuggestedBotUsername(userId);
  const suggestedName = encodeURIComponent("Jarvis Wallet Agent");

  return `https://t.me/newbot/${managerUsername}/${suggestedUsername}?name=${suggestedName}`;
}

async function sendManagerStartMessage(message: TelegramMessage): Promise<void> {
  const managerBotToken = requireEnv("TELEGRAM_MANAGER_BOT_TOKEN");
  const creationLink = getManagedBotCreationLink(message.chat.id);

  await callTelegramApi<boolean>(managerBotToken, "sendMessage", {
    chat_id: message.chat.id,
    text: [
      "Welcome to Jarvis Wallet.",
      "",
      "Create your personal managed bot agent to start using the voice-first DeFi flow.",
    ].join("\n"),
    reply_markup: {
      inline_keyboard: [[{ text: "Create My Agent", url: creationLink }]],
    },
  });
}

async function storeManagedBotRecord(update: TelegramManagedBotUpdated, token: string): Promise<void> {
  const encryptedToken = encryptSecret(token);
  const ownerId = String(update.user.id);
  const managedBotId = String(update.bot.id);
  const now = FieldValue.serverTimestamp();

  await Promise.all([
    adminDb.collection("users").doc(ownerId).set(
      {
        telegram: {
          id: update.user.id,
          username: update.user.username ?? null,
          firstName: update.user.first_name,
          languageCode: update.user.language_code ?? null,
        },
        updatedAt: now,
      },
      { merge: true },
    ),
    adminDb.collection("managedBots").doc(managedBotId).set(
      {
        bot: {
          id: update.bot.id,
          username: update.bot.username ?? null,
          firstName: update.bot.first_name,
        },
        ownerUserId: update.user.id,
        managedBotTokenEncrypted: encryptedToken,
        updatedAt: now,
      },
      { merge: true },
    ),
  ]);
}

async function configureManagedBot(update: TelegramManagedBotUpdated, token: string): Promise<void> {
  const baseUrl = getBaseUrl(requireEnv("APP_BASE_URL"));
  const miniAppUrl = requireEnv("TELEGRAM_MINI_APP_URL");
  const webhookSecret = requireEnv("TELEGRAM_WEBHOOK_SECRET_TOKEN");
  const managedBotId = String(update.bot.id);
  const webhookUrl = `${baseUrl}/api/webhook?managedBotId=${managedBotId}`;

  await callTelegramApi<boolean>(token, "setWebhook", {
    url: webhookUrl,
    secret_token: webhookSecret,
    allowed_updates: ["message"],
  });

  await callTelegramApi<boolean>(token, "setMyCommands", {
    commands: [
      { command: "start", description: "Start your Jarvis wallet agent" },
      { command: "help", description: "Get help using the agent" },
      { command: "settings", description: "Configure your agent preferences" },
    ],
  });

  await callTelegramApi<boolean>(token, "setChatMenuButton", {
    menu_button: {
      type: "web_app",
      text: "Open Jarvis Wallet",
      web_app: {
        url: miniAppUrl,
      },
    },
  });
}

async function handleManagedBotUpdated(update: TelegramManagedBotUpdated): Promise<void> {
  const managerBotToken = requireEnv("TELEGRAM_MANAGER_BOT_TOKEN");
  const managedBotToken = await callTelegramApi<string>(managerBotToken, "getManagedBotToken", {
    user_id: update.bot.id,
  });

  await storeManagedBotRecord(update, managedBotToken);
  await configureManagedBot(update, managedBotToken);
}

async function getManagedBotTokenForRequest(managedBotId: string): Promise<string> {
  const managedBot = await adminDb.collection("managedBots").doc(managedBotId).get();

  if (!managedBot.exists) {
    throw new Error(`Managed bot ${managedBotId} is not registered in Firestore`);
  }

  const encryptedToken = managedBot.get("managedBotTokenEncrypted");

  if (typeof encryptedToken !== "string") {
    throw new Error(`Managed bot ${managedBotId} does not have a stored token`);
  }

  return decryptSecret(encryptedToken);
}

async function handleManagedBotWebhook(
  managedBotId: string,
  update: TelegramUpdate,
): Promise<void> {
  const now = FieldValue.serverTimestamp();
  const managedBotRef = adminDb.collection("managedBots").doc(managedBotId);

  await managedBotRef.set(
    {
      lastWebhookAt: now,
      lastUpdateId: update.update_id,
      updatedAt: now,
    },
    { merge: true },
  );

  const message = update.message;
  const text = message?.text;

  if (!message || !text || !text.startsWith("/start")) {
    return;
  }

  const managedBotToken = await getManagedBotTokenForRequest(managedBotId);

  await callTelegramApi<boolean>(managedBotToken, "sendMessage", {
    chat_id: message.chat.id,
    text: "Your Jarvis Wallet managed bot is connected. Open the Mini App from the menu button.",
  });
}

function isStartCommand(text: string | undefined): boolean {
  return Boolean(text && text.startsWith("/start"));
}

function isAuthorizedWebhookRequest(request: NextRequest): boolean {
  const expectedSecret = requireEnv("TELEGRAM_WEBHOOK_SECRET_TOKEN");
  const requestSecret = getSecretTokenFromHeaders(request);

  return requestSecret === expectedSecret;
}

export async function POST(request: NextRequest): Promise<Response> {
  if (!isAuthorizedWebhookRequest(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized webhook request" }, { status: 401 });
  }

  try {
    const update = (await request.json()) as TelegramUpdate;
    const managedBotId = request.nextUrl.searchParams.get("managedBotId");

    if (managedBotId) {
      await handleManagedBotWebhook(managedBotId, update);
      return NextResponse.json({ ok: true });
    }

    const processedManagedBotIds = new Set<number>();

    if (update.managed_bot) {
      await handleManagedBotUpdated(update.managed_bot);
      processedManagedBotIds.add(update.managed_bot.bot.id);
    }

    const managedBotFromServiceMessage = update.message?.managed_bot_created;
    const messageSender = update.message?.from;

    if (
      managedBotFromServiceMessage &&
      messageSender &&
      !processedManagedBotIds.has(managedBotFromServiceMessage.bot.id)
    ) {
      await handleManagedBotUpdated({
        user: messageSender,
        bot: managedBotFromServiceMessage.bot,
      });
    }

    if (update.message && isStartCommand(update.message.text)) {
      await sendManagerStartMessage(update.message);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Failed to process Telegram webhook", error);
    return NextResponse.json(
      { ok: false, error: "Failed to process webhook update" },
      { status: 500 },
    );
  }
}

import { NextRequest, NextResponse } from "next/server";

import { getAdminDb } from "@/lib/firebase/admin";
import { requireEnv } from "@/lib/server/env";
import { callTelegramApi } from "@/lib/telegram/api";
import type { TelegramMessage, TelegramUpdate } from "@/lib/telegram/types";

export const runtime = "nodejs";

function getSecretTokenFromHeaders(request: NextRequest): string | null {
  return request.headers.get("x-telegram-bot-api-secret-token");
}

function toTelegramSafeSecret(secret: string): string {
  return secret.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function isAuthorizedWebhookRequest(request: NextRequest): boolean {
  const expectedSecret = requireEnv("TELEGRAM_WEBHOOK_SECRET_TOKEN");
  const normalizedExpectedSecret = toTelegramSafeSecret(expectedSecret);
  const requestSecret = getSecretTokenFromHeaders(request);

  return requestSecret === expectedSecret || requestSecret === normalizedExpectedSecret;
}

function getTelegramBotToken(): string {
  return requireEnv("TELEGRAM_BOT_TOKEN");
}

async function sendStartMessage(
  botToken: string,
  message: TelegramMessage,
): Promise<void> {
  await callTelegramApi<boolean>(botToken, "sendMessage", {
    chat_id: message.chat.id,
    text: [
      "🤖 Jarvis Wallet is online.",
      "",
      "Use the Mini App for voice-first wallet actions, or ask here in chat.",
      "",
      "Try: \"What's my balance?\" or \"Swap 5 TON to USDT\"",
    ].join("\n"),
  });
}

async function sendHelpMessage(botToken: string, message: TelegramMessage): Promise<void> {
  await callTelegramApi<boolean>(botToken, "sendMessage", {
    chat_id: message.chat.id,
    text: [
      "📋 Available commands:",
      "",
      "• Check balance — \"What's my balance?\"",
      "• Swap tokens — \"Swap 5 TON to USDT\"",
      "• Stake TON — \"Stake 10 TON\"",
      "• Staking info — \"What's the staking APY?\"",
      "• Token price — \"What's the price of TON?\"",
      "",
      "Or just describe what you want to do.",
    ].join("\n"),
  });
}

async function resolveWalletAddress(message: TelegramMessage): Promise<string | undefined> {
  const senderId = message.from?.id;

  if (!senderId) {
    return undefined;
  }

  const userDoc = await getAdminDb().collection("users").doc(String(senderId)).get();
  return userDoc.get("walletAddress") ?? undefined;
}

async function handleTextMessage(botToken: string, message: TelegramMessage): Promise<void> {
  const text = message.text;

  if (!text) {
    return;
  }

  if (text.startsWith("/start")) {
    await sendStartMessage(botToken, message);
    return;
  }

  if (text.startsWith("/help")) {
    await sendHelpMessage(botToken, message);
    return;
  }

  if (text.startsWith("/")) {
    return;
  }

  try {
    await callTelegramApi<boolean>(botToken, "sendChatAction", {
      chat_id: message.chat.id,
      action: "typing",
    });

    const walletAddress = await resolveWalletAddress(message);
    const { generateText, convertToModelMessages, stepCountIs } = await import("ai");
    const { getAgentModel, agentProviderOptions } = await import("@/lib/agent/model");
    const { buildSystemPrompt } = await import("@/lib/agent/system-prompt");
    const { createAgentTools } = await import("@/lib/agent/tools");

    const result = await generateText({
      model: getAgentModel(),
      system: buildSystemPrompt(walletAddress, "chat", null, true),
      messages: await convertToModelMessages([
        {
          role: "user" as const,
          parts: [{ type: "text" as const, text }],
        },
      ]),
      maxOutputTokens: 220,
      tools: createAgentTools({
        defaultWalletAddress: walletAddress,
        interactionMode: "chat",
        requestOrigin: process.env.APP_BASE_URL ?? process.env.VERCEL_URL,
      }),
      stopWhen: stepCountIs(5),
      providerOptions: agentProviderOptions,
    });

    const responseText =
      result.text || "I processed your request but couldn't generate a text response.";

    await callTelegramApi<boolean>(botToken, "sendMessage", {
      chat_id: message.chat.id,
      text: responseText,
    });
  } catch (error) {
    console.error("[TelegramWebhook] AI agent error:", error);
    await callTelegramApi<boolean>(botToken, "sendMessage", {
      chat_id: message.chat.id,
      text: "Sorry, I encountered an error processing your request. Please try again.",
    });
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  if (!isAuthorizedWebhookRequest(request)) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized webhook request" },
      { status: 401 },
    );
  }

  try {
    const update = (await request.json()) as TelegramUpdate;
    const botToken = getTelegramBotToken();

    if (update.message) {
      await handleTextMessage(botToken, update.message);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[TelegramWebhook] Failed to process webhook update", error);
    return NextResponse.json(
      { ok: false, error: "Failed to process webhook update" },
      { status: 500 },
    );
  }
}

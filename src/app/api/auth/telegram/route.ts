import { NextResponse } from "next/server";
import crypto from "crypto";
import { FieldValue } from "firebase-admin/firestore";

import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { requireEnv } from "@/lib/server/env";

export const runtime = "nodejs";

const TELEGRAM_HASH_HEX_LENGTH = 64;
const INVALID_TELEGRAM_INIT_DATA_ERROR = "Invalid Telegram init data.";

function getTelegramBotToken(): string {
  const token = requireEnv("TELEGRAM_BOT_TOKEN").trim();
  if (!token) {
    throw new Error("TELEGRAM_BOT_TOKEN is empty.");
  }
  return token;
}

function computeInitDataHash(initData: string, botToken: string): string {
  const urlParams = new URLSearchParams(initData);
  urlParams.delete("hash");

  const dataCheckArr: string[] = [];
  urlParams.forEach((value, key) => {
    dataCheckArr.push(`${key}=${value}`);
  });
  dataCheckArr.sort();
  const dataCheckString = dataCheckArr.join("\n");

  const secretKey = crypto
    .createHmac("sha256", "WebAppData")
    .update(botToken)
    .digest();

  return crypto
    .createHmac("sha256", secretKey)
    .update(dataCheckString)
    .digest("hex");
}

function constantTimeEqual(a: string, b: string): boolean {
  if (
    a.length !== TELEGRAM_HASH_HEX_LENGTH ||
    b.length !== TELEGRAM_HASH_HEX_LENGTH ||
    !/^[a-f0-9]+$/i.test(a) ||
    !/^[a-f0-9]+$/i.test(b)
  ) {
    return false;
  }

  const aBuf = Buffer.from(a, "hex");
  const bBuf = Buffer.from(b, "hex");
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

function extractUserFromParams(urlParams: URLSearchParams): TelegramWebAppUser {
  const userDataString = urlParams.get("user");
  if (!userDataString) {
    throw new Error("Telegram user payload is missing.");
  }
  return JSON.parse(userDataString) as TelegramWebAppUser;
}

function verifyTelegramWebAppData(initData: string): TelegramWebAppUser {
  const urlParams = new URLSearchParams(initData);
  const hash = urlParams.get("hash");

  if (!hash) {
    throw new Error("Missing Telegram hash.");
  }

  const botToken = getTelegramBotToken();
  const expectedHash = computeInitDataHash(initData, botToken);

  if (!constantTimeEqual(hash, expectedHash)) {
    throw new Error(INVALID_TELEGRAM_INIT_DATA_ERROR);
  }

  return extractUserFromParams(urlParams);
}

function isInvalidTelegramInitDataError(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.message.trim() === INVALID_TELEGRAM_INIT_DATA_ERROR
  );
}

export async function POST(request: Request): Promise<Response> {
  try {
    const body = (await request.json()) as { initData?: string };
    const { initData } = body;

    if (!initData) {
      return NextResponse.json(
        { error: "initData not found." },
        { status: 400 },
      );
    }

    const telegramUser = verifyTelegramWebAppData(initData);
    const telegramId = telegramUser.id.toString();

    const db = getAdminDb();
    const userRef = db.collection("users").doc(telegramId);
    const userDoc = await userRef.get();
    const userPayload = {
      telegramId,
      firstName: telegramUser.first_name,
      lastName: telegramUser.last_name ?? null,
      username: telegramUser.username ?? null,
      languageCode: telegramUser.language_code ?? "en",
      photoUrl: telegramUser.photo_url ?? null,
      isPremium: telegramUser.is_premium ?? false,
    };

    if (!userDoc.exists) {
      await userRef.set({
        ...userPayload,
        createdAt: FieldValue.serverTimestamp(),
        lastLogin: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    } else {
      await userRef.update({
        ...userPayload,
        lastLogin: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }

    const customToken = await getAdminAuth().createCustomToken(telegramId, {
      provider: "telegram",
    });

    return NextResponse.json({ customToken, user: telegramUser });
  } catch (error) {
    if (!isInvalidTelegramInitDataError(error)) {
      console.error(
        "[TelegramAuth] Failed to authenticate Telegram user",
        error,
      );
    }
    const errorMessage =
      error instanceof Error
        ? error.message
        : "Failed to authenticate Telegram user.";
    return NextResponse.json({ error: errorMessage }, { status: 401 });
  }
}

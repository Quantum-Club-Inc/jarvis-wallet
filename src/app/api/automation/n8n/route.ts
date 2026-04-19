import { NextRequest, NextResponse } from "next/server";

import {
  getAutomationWalletAddress,
  sendAutomationTransfer,
  type AutomationTransferMessage,
} from "@/lib/ton/automation-signer";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireEnv } from "@/lib/server/env";

export const runtime = "nodejs";

const REQUESTS_COLLECTION = "automationRequests";

type AutomationAction = "swap" | "stake";

interface AutomationWebhookRequestBody {
  requestId?: string;
  action?: string;
  dryRun?: boolean;
  offerTokenSymbol?: string;
  askTokenSymbol?: string;
  offerAmount?: string;
  amountTon?: string;
}

interface IdempotencyRecord {
  requestId: string;
  action: AutomationAction;
  dryRun: boolean;
  status: "in_progress" | "completed" | "failed";
  createdAt: string;
  completedAt?: string;
  failedAt?: string;
  result?: unknown;
  error?: string;
}

function extractAuthToken(request: NextRequest): string | null {
  const headerSecret = request.headers.get("x-jarvis-n8n-secret")?.trim();
  if (headerSecret) {
    return headerSecret;
  }

  const authHeader = request.headers.get("authorization");
  if (!authHeader) {
    return null;
  }

  const [scheme, token] = authHeader.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token?.trim()) {
    return null;
  }

  return token.trim();
}

function isAuthorizedRequest(request: NextRequest): boolean {
  const expectedSecret = requireEnv("N8N_WEBHOOK_SECRET").trim();
  const providedSecret = extractAuthToken(request);
  return Boolean(providedSecret && providedSecret === expectedSecret);
}

function parseAction(value: string | undefined): AutomationAction | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "swap" || normalized === "stake") {
    return normalized;
  }

  return null;
}

function readErrorMessage(payload: unknown, fallback: string): string {
  if (
    typeof payload === "object"
    && payload !== null
    && "error" in payload
    && typeof (payload as { error?: unknown }).error === "string"
  ) {
    return (payload as { error: string }).error;
  }

  return fallback;
}

function normalizeRequestId(value: string | undefined): string | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized.slice(0, 128) : null;
}

function isAlreadyExistsError(error: unknown): boolean {
  const candidate = error as { code?: unknown; message?: unknown };
  return candidate?.code === 6
    || (typeof candidate?.message === "string"
      && candidate.message.toLowerCase().includes("already exists"));
}

async function reserveRequest(
  requestId: string,
  action: AutomationAction,
  dryRun: boolean,
): Promise<{ docPath: string } | { existing: IdempotencyRecord | null }> {
  const docRef = getAdminDb().collection(REQUESTS_COLLECTION).doc(requestId);
  const now = new Date().toISOString();
  const record: IdempotencyRecord = {
    requestId,
    action,
    dryRun,
    status: "in_progress",
    createdAt: now,
  };

  try {
    await docRef.create(record);
    return { docPath: docRef.path };
  } catch (error) {
    if (!isAlreadyExistsError(error)) {
      throw error;
    }

    const snapshot = await docRef.get();
    return {
      existing: (snapshot.exists ? (snapshot.data() as IdempotencyRecord) : null),
    };
  }
}

async function markRequestCompleted(
  requestId: string,
  result: unknown,
): Promise<void> {
  const docRef = getAdminDb().collection(REQUESTS_COLLECTION).doc(requestId);
  await docRef.set({
    status: "completed",
    completedAt: new Date().toISOString(),
    result,
  }, { merge: true });
}

async function markRequestFailed(
  requestId: string,
  errorMessage: string,
): Promise<void> {
  const docRef = getAdminDb().collection(REQUESTS_COLLECTION).doc(requestId);
  await docRef.set({
    status: "failed",
    failedAt: new Date().toISOString(),
    error: errorMessage,
  }, { merge: true });
}

async function postJson(
  request: NextRequest,
  path: string,
  body: Record<string, unknown>,
): Promise<{ ok: boolean; status: number; payload: unknown }> {
  const url = new URL(path, request.nextUrl.origin);
  const response = await fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  const payload = (await response.json()) as unknown;
  return {
    ok: response.ok,
    status: response.status,
    payload,
  };
}

function parseExecutionMessages(payload: unknown): AutomationTransferMessage[] {
  if (
    typeof payload !== "object"
    || payload === null
    || !("messages" in payload)
    || !Array.isArray((payload as { messages?: unknown }).messages)
  ) {
    throw new Error("Execution response does not include transfer messages.");
  }

  const messages = (payload as { messages: AutomationTransferMessage[] }).messages;
  if (messages.length === 0) {
    throw new Error("Execution response returned zero transfer messages.");
  }

  return messages;
}

export async function POST(request: NextRequest): Promise<Response> {
  if (!isAuthorizedRequest(request)) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized n8n webhook request." },
      { status: 401 },
    );
  }

  let requestIdForFailure: string | null = null;

  try {
    const body = (await request.json()) as AutomationWebhookRequestBody;
    const action = parseAction(body.action);
    const requestId = normalizeRequestId(body.requestId);
    const dryRun = Boolean(body.dryRun);

    if (!requestId) {
      return NextResponse.json(
        { ok: false, error: "requestId is required for idempotent automation execution." },
        { status: 400 },
      );
    }

    requestIdForFailure = requestId;

    if (!action) {
      return NextResponse.json(
        { ok: false, error: "action must be either 'swap' or 'stake'." },
        { status: 400 },
      );
    }

    const swapInput = action === "swap"
      ? {
          offerTokenSymbol: body.offerTokenSymbol?.trim().toUpperCase(),
          askTokenSymbol: body.askTokenSymbol?.trim().toUpperCase(),
          offerAmount: body.offerAmount?.trim(),
        }
      : null;
    const stakeInput = action === "stake"
      ? {
          amountTon: body.amountTon?.trim(),
        }
      : null;

    if (
      action === "swap"
      && (!swapInput?.offerTokenSymbol || !swapInput.askTokenSymbol || !swapInput.offerAmount)
    ) {
      return NextResponse.json(
        {
          ok: false,
          error: "offerTokenSymbol, askTokenSymbol and offerAmount are required for swap.",
        },
        { status: 400 },
      );
    }

    if (action === "stake" && !stakeInput?.amountTon) {
      return NextResponse.json(
        { ok: false, error: "amountTon is required for stake." },
        { status: 400 },
      );
    }

    const reservation = await reserveRequest(requestId, action, dryRun);
    if ("existing" in reservation) {
      return NextResponse.json(
        {
          ok: false,
          error: "requestId already exists.",
          existing: reservation.existing,
        },
        { status: 409 },
      );
    }

    const walletAddress = await getAutomationWalletAddress();
    let result: Record<string, unknown>;

    if (action === "swap") {
      const quoteResponse = await postJson(request, "/api/swap/quote", {
        offerTokenSymbol: swapInput?.offerTokenSymbol ?? "",
        askTokenSymbol: swapInput?.askTokenSymbol ?? "",
        offerAmount: swapInput?.offerAmount ?? "",
      });
      if (!quoteResponse.ok) {
        throw new Error(readErrorMessage(quoteResponse.payload, "Failed to fetch swap quote."));
      }

      const quote = quoteResponse.payload as {
        quoteId: string;
        quotePayload: unknown;
        offerAmount: string;
        askAmount: string;
        offerToken: { symbol: string };
        askToken: { symbol: string };
      };

      const executeResponse = await postJson(request, "/api/swap/execute", {
        quoteId: quote.quoteId,
        quotePayload: quote.quotePayload,
        walletAddress,
      });
      if (!executeResponse.ok) {
        throw new Error(readErrorMessage(executeResponse.payload, "Failed to prepare swap execution."));
      }

      const messages = parseExecutionMessages(executeResponse.payload);
      const submission = dryRun ? null : await sendAutomationTransfer(messages);

      result = {
        requestId,
        action: "swap",
        dryRun,
        walletAddress,
        quote: {
          offerAmount: quote.offerAmount,
          offerToken: quote.offerToken.symbol,
          askAmount: quote.askAmount,
          askToken: quote.askToken.symbol,
        },
        preparedMessages: messages.length,
        submitted: submission,
      };
    } else {
      const executeResponse = await postJson(request, "/api/stake/execute", {
        amountTon: stakeInput?.amountTon ?? "",
        walletAddress,
      });
      if (!executeResponse.ok) {
        throw new Error(readErrorMessage(executeResponse.payload, "Failed to prepare stake execution."));
      }

      const messages = parseExecutionMessages(executeResponse.payload);
      const submission = dryRun ? null : await sendAutomationTransfer(messages);

      result = {
        requestId,
        action: "stake",
        dryRun,
        walletAddress,
        amountTon: stakeInput?.amountTon ?? "",
        preparedMessages: messages.length,
        submitted: submission,
      };
    }

    await markRequestCompleted(requestId, result);
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    const errorMessage = error instanceof Error
      ? error.message
      : "Failed to process n8n automation request.";

    if (requestIdForFailure) {
      try {
        await markRequestFailed(requestIdForFailure, errorMessage);
      } catch (markError) {
        console.error("[N8NAutomation] Failed to update failed status:", markError);
      }
    }

    console.error("[N8NAutomation] Execution failed:", error);
    return NextResponse.json(
      { ok: false, error: errorMessage },
      { status: 500 },
    );
  }
}

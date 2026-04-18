import { NextRequest, NextResponse } from "next/server";
import { Address as TonAddress } from "@ton/core";
import {
  Blockchain,
  Omniston,
  type Address,
  type Quote,
} from "@ston-fi/omniston-sdk";

export const runtime = "nodejs";

const DEFAULT_OMNISTON_API_URL = "wss://omni-ws.ston.fi";

interface SwapExecuteRequestBody {
  quoteId?: string;
  quotePayload?: unknown;
  walletAddress?: string;
}

function toOmniAddress(address: string): Address {
  return {
    blockchain: Blockchain.TON,
    address,
  };
}

function normalizeTonAddress(address: string): string | null {
  try {
    return TonAddress.parse(address).toString({
      bounceable: false,
      testOnly: false,
    });
  } catch {
    return null;
  }
}

function isQuotePayload(value: unknown): value is Quote {
  if (!value || typeof value !== "object") {
    return false;
  }

  const payload = value as Partial<Quote>;
  return typeof payload.quoteId === "string" && payload.quoteId.length > 0;
}

export async function POST(request: NextRequest): Promise<Response> {
  let omniston: Omniston | null = null;

  try {
    const body = (await request.json()) as SwapExecuteRequestBody;
    const quoteId = body.quoteId?.trim();
    const walletAddressRaw = body.walletAddress?.trim();
    const quotePayload = body.quotePayload;

    if (!quoteId || !walletAddressRaw || !quotePayload) {
      return NextResponse.json(
        { error: "quoteId, quotePayload and walletAddress are required." },
        { status: 400 },
      );
    }

    const normalizedWalletAddress = normalizeTonAddress(walletAddressRaw);
    if (!normalizedWalletAddress) {
      return NextResponse.json(
        { error: "walletAddress is not a valid TON address." },
        { status: 400 },
      );
    }

    if (!isQuotePayload(quotePayload)) {
      return NextResponse.json(
        { error: "quotePayload is invalid." },
        { status: 400 },
      );
    }

    if (quotePayload.quoteId !== quoteId) {
      return NextResponse.json(
        { error: "quoteId does not match the provided quote payload." },
        { status: 400 },
      );
    }

    if (
      typeof quotePayload.tradeStartDeadline === "number"
      && quotePayload.tradeStartDeadline <= Math.floor(Date.now() / 1000)
    ) {
      return NextResponse.json(
        { error: "Quote expired. Request a fresh quote and try again." },
        { status: 400 },
      );
    }

    const omniAddress = toOmniAddress(normalizedWalletAddress);
    omniston = new Omniston({
      apiUrl: process.env.OMNISTON_API_URL?.trim() || DEFAULT_OMNISTON_API_URL,
    });
    const transfer = await omniston.buildTransfer({
      sourceAddress: omniAddress,
      destinationAddress: omniAddress,
      gasExcessAddress: omniAddress,
      refundAddress: omniAddress,
      quote: quotePayload,
      useRecommendedSlippage: true,
    });

    const messages = transfer.ton?.messages ?? [];
    if (messages.length === 0) {
      return NextResponse.json(
        { error: "Could not build a TON transfer for this quote." },
        { status: 500 },
      );
    }

    return NextResponse.json({
      quoteId,
      walletAddress: normalizedWalletAddress,
      messages,
    });
  } catch (error) {
    console.error("[SwapExecute] Failed to build transfer:", error);
    return NextResponse.json(
      { error: "Could not prepare swap execution right now." },
      { status: 500 },
    );
  } finally {
    omniston?.close();
  }
}

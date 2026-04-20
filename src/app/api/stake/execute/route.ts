import { NextRequest, NextResponse } from "next/server";
import { Address as TonAddress } from "@ton/core";

import { buildStakeTransaction, generateStakeMessages } from "@/lib/defi/stake";
import { parseTokenAmount } from "@/lib/defi/tokens";

export const runtime = "nodejs";

const TON_DECIMALS = 9;

interface StakeExecuteRequestBody {
  amountTon?: string;
  walletAddress?: string;
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

const MIN_STAKE_TON = 1;

function isValidAmount(value: string): boolean {
  return /^[0-9]+(\.[0-9]+)?$/.test(value) && Number(value) > 0;
}

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const body = (await request.json()) as StakeExecuteRequestBody;
    const amountTon = body.amountTon?.trim();
    const walletAddressRaw = body.walletAddress?.trim();

    if (!amountTon || !walletAddressRaw) {
      return NextResponse.json(
        { error: "amountTon and walletAddress are required." },
        { status: 400 },
      );
    }

    if (!isValidAmount(amountTon)) {
      return NextResponse.json(
        { error: "amountTon must be a positive TON amount." },
        { status: 400 },
      );
    }

    if (Number(amountTon) < MIN_STAKE_TON) {
      return NextResponse.json(
        { error: `Minimum stake amount is ${MIN_STAKE_TON} TON.` },
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

    const amountNano = parseTokenAmount(amountTon, TON_DECIMALS);
    
    // Fetch officially generated message cells natively via tonstakers-sdk integration
    const generatedMessages = await generateStakeMessages(amountNano, normalizedWalletAddress);

    return NextResponse.json({
      action: "stake",
      walletAddress: normalizedWalletAddress,
      amountTon,
      amountNano: amountNano.toString(),
      // Directly map Tonstakers SDK messages to frontend schema format
      messages: generatedMessages.map((msg) => ({
        targetAddress: msg.address,
        sendAmount: msg.amount,
        payload: msg.payload,
      })),
    });
  } catch (error) {
    console.error("[StakeExecute] Failed to prepare stake transfer via SDK:", error);
    return NextResponse.json(
      { error: "Could not prepare stake execution right now." },
      { status: 500 },
    );
  }
}

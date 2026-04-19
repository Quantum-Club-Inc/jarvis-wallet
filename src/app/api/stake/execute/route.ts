import { NextRequest, NextResponse } from "next/server";
import { Address as TonAddress, beginCell } from "@ton/core";

import { buildStakeTransaction } from "@/lib/defi/stake";
import { parseTokenAmount } from "@/lib/defi/tokens";

export const runtime = "nodejs";

const TON_DECIMALS = 9;
const STAKE_FEE_RESERVE_TON = "1";
const TONSTAKERS_STAKE_OP = 0x47d54391;
const TONSTAKERS_QUERY_ID = 1n;
const TONSTAKERS_PARTNER_CODE = 0x000000106796caefn;

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

    const normalizedWalletAddress = normalizeTonAddress(walletAddressRaw);
    if (!normalizedWalletAddress) {
      return NextResponse.json(
        { error: "walletAddress is not a valid TON address." },
        { status: 400 },
      );
    }

    const txParams = buildStakeTransaction(amountTon);
    const amountNano = parseTokenAmount(amountTon, TON_DECIMALS);
    const feeReserveNano = parseTokenAmount(STAKE_FEE_RESERVE_TON, TON_DECIMALS);
    const sendAmount = amountNano + feeReserveNano;

    const payload = beginCell()
      .storeUint(TONSTAKERS_STAKE_OP, 32)
      .storeUint(TONSTAKERS_QUERY_ID, 64)
      .storeUint(TONSTAKERS_PARTNER_CODE, 64)
      .endCell()
      .toBoc()
      .toString("hex");

    return NextResponse.json({
      action: "stake",
      walletAddress: normalizedWalletAddress,
      amountTon,
      amountNano: amountNano.toString(),
      feeReserveTon: STAKE_FEE_RESERVE_TON,
      feeReserveNano: feeReserveNano.toString(),
      messages: [
        {
          targetAddress: txParams.poolAddress,
          sendAmount: sendAmount.toString(),
          payload,
        },
      ],
    });
  } catch (error) {
    console.error("[StakeExecute] Failed to prepare stake transfer:", error);
    return NextResponse.json(
      { error: "Could not prepare stake execution right now." },
      { status: 500 },
    );
  }
}

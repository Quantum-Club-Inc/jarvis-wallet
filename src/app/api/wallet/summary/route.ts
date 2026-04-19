import { NextRequest, NextResponse } from "next/server";

import { getTokenPrice } from "@/lib/defi/swap";
import { requireEnv } from "@/lib/server/env";

export const runtime = "nodejs";

interface TonApiAccountResponse {
  balance?: number | string;
}

interface TonApiJettonItem {
  balance?: string;
  jetton?: {
    symbol?: string;
    decimals?: number;
    image?: string;
    metadata?: {
      image?: string;
    };
  };
  price?: {
    prices?: {
      USD?: number | string;
    };
    usd_price?: number | string;
  };
}

interface TonApiJettonsResponse {
  balances?: TonApiJettonItem[];
}

function toFiniteNumber(value: string | number): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatAmount(rawBalance: string, decimals: number): number {
  const numeric = toFiniteNumber(rawBalance);
  if (numeric === null) {
    return 0;
  }
  return numeric / 10 ** decimals;
}

function readUsdPrice(item: TonApiJettonItem): number | null {
  const direct = item.price?.prices?.USD;
  if (typeof direct === "number" || typeof direct === "string") {
    return toFiniteNumber(direct);
  }

  const fallback = item.price?.usd_price;
  if (typeof fallback === "number" || typeof fallback === "string") {
    return toFiniteNumber(fallback);
  }

  return null;
}

function readJettonImage(item: TonApiJettonItem): string | null {
  const direct = item.jetton?.image;
  if (typeof direct === "string" && direct.trim()) {
    return direct;
  }

  const metadataImage = item.jetton?.metadata?.image;
  if (typeof metadataImage === "string" && metadataImage.trim()) {
    return metadataImage;
  }

  return null;
}

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const address = request.nextUrl.searchParams.get("address");

    if (!address) {
      return NextResponse.json({ error: "address is required" }, { status: 400 });
    }

    const tonApiKey = requireEnv("TONAPI_KEY");
    const headers = {
      Authorization: `Bearer ${tonApiKey}`,
      "Content-Type": "application/json",
    };

    const [accountResponse, jettonsResponse, tonPrice] = await Promise.all([
      fetch(`https://tonapi.io/v2/accounts/${encodeURIComponent(address)}`, {
        headers,
        cache: "no-store",
      }),
      fetch(`https://tonapi.io/v2/accounts/${encodeURIComponent(address)}/jettons`, {
        headers,
        cache: "no-store",
      }),
      getTokenPrice("TON"),
    ]);

    if (!accountResponse.ok) {
      throw new Error(`TonAPI account request failed: ${accountResponse.status}`);
    }

    const accountData = (await accountResponse.json()) as TonApiAccountResponse;
    const tonRawBalance = String(accountData.balance ?? "0");
    const tonBalance = formatAmount(tonRawBalance, 9);
    const tonPriceUsd = tonPrice?.priceUsd ? toFiniteNumber(tonPrice.priceUsd) : null;
    const tonValueUsd = tonPriceUsd !== null ? tonBalance * tonPriceUsd : null;

    let jettonAssets: Array<{
      symbol: string;
      amount: string;
      valueUsd: string | null;
      imageUrl: string | null;
    }> = [];

    let jettonTotalUsd = 0;

    if (jettonsResponse.ok) {
      const jettonData = (await jettonsResponse.json()) as TonApiJettonsResponse;
      jettonAssets = (jettonData.balances ?? [])
        .map((item) => {
          const symbol = item.jetton?.symbol ?? "JETTON";
          const decimals = item.jetton?.decimals ?? 9;
          const rawBalance = item.balance ?? "0";
          const amount = formatAmount(rawBalance, decimals);
          const usdPrice = readUsdPrice(item);
          const valueUsd = usdPrice !== null ? amount * usdPrice : null;

          if (valueUsd !== null) {
            jettonTotalUsd += valueUsd;
          }

          return {
            symbol,
            amount: `${amount.toFixed(2)} ${symbol}`,
            valueUsd: valueUsd !== null ? valueUsd.toFixed(2) : null,
            imageUrl: readJettonImage(item),
          };
        })
        .filter((asset) => asset.amount !== `0.00 ${asset.symbol}`);
    }

    const totalUsdValue = (tonValueUsd ?? 0) + jettonTotalUsd;

    return NextResponse.json({
      totalUsd: totalUsdValue.toFixed(2),
      totalTon: tonBalance.toFixed(2),
      assets: [
        {
          symbol: "TON",
          amount: `${tonBalance.toFixed(2)} TON`,
          valueUsd: tonValueUsd !== null ? tonValueUsd.toFixed(2) : null,
          imageUrl: null,
        },
        ...jettonAssets,
      ],
    });
  } catch (error) {
    console.error("[WalletSummary] Failed to load wallet summary:", error);
    return NextResponse.json(
        {
          totalUsd: "0.00",
          totalTon: "0.00",
          assets: [
            {
              symbol: "TON",
              amount: "0.00 TON",
              valueUsd: "0.00",
              imageUrl: null,
            },
          ],
        },
      { status: 200 },
    );
  }
}

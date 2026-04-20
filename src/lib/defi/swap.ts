import "server-only";

import { formatTokenAmount, parseTokenAmount, resolveToken, type TokenInfo } from "@/lib/defi/tokens";
import { getSwapTokenCatalog } from "@/lib/defi/omniston-token-catalog";

const DEFAULT_STON_API_URL = "https://api.ston.fi"; // used by simulateSwap

export interface SwapSimulation {
  offerToken: TokenInfo;
  askToken: TokenInfo;
  offerAmount: string;
  askAmount: string;
  minAskAmount: string;
  priceImpact: string;
  swapRate: string;
  routerAddress: string;
  poolAddress: string;
}

/**
 * Simulate a swap on STON.fi DEX via their API (no tx execution).
 * Returns price, amount, impact — ready for user confirmation.
 */
export async function simulateSwap(params: {
  offerTokenSymbol: string;
  askTokenSymbol: string;
  offerAmount: string;
}): Promise<SwapSimulation> {
  const offerToken = resolveToken(params.offerTokenSymbol);
  const askToken = resolveToken(params.askTokenSymbol);

  if (!offerToken) {
    throw new Error(`Unknown token: ${params.offerTokenSymbol}`);
  }
  if (!askToken) {
    throw new Error(`Unknown token: ${params.askTokenSymbol}`);
  }

  const offerUnits = parseTokenAmount(params.offerAmount, offerToken.decimals).toString();

  const apiUrl = process.env.STON_API_URL?.trim() || DEFAULT_STON_API_URL;
  const url = new URL(`${apiUrl}/v1/swap/simulate`);
  url.searchParams.append("offer_address", offerToken.address);
  url.searchParams.append("ask_address", askToken.address);
  url.searchParams.append("units", offerUnits);
  url.searchParams.append("slippage_tolerance", "0.01");

  const response = await fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });

  if (!response.ok) {
    if (response.status === 429) {
      throw new Error("Too many swap simulation requests. Please try again later.");
    }
    throw new Error(`Swap simulation failed with status ${response.status}`);
  }

  const payload = await response.json();
  const askAmount = formatTokenAmount(
    BigInt(payload.ask_units),
    askToken.decimals,
  );
  const minAskAmount = formatTokenAmount(
    BigInt(payload.min_ask_units),
    askToken.decimals,
  );
  const offerFormatted = formatTokenAmount(
    BigInt(offerUnits),
    offerToken.decimals,
  );

  const askNum = parseFloat(askAmount);
  const offerNum = parseFloat(offerFormatted);
  const swapRate = offerNum > 0 ? (askNum / offerNum).toFixed(6) : "0";

  return {
    offerToken,
    askToken,
    offerAmount: offerFormatted,
    askAmount,
    minAskAmount,
    priceImpact: payload.price_impact ?? "0",
    swapRate,
    routerAddress: payload.router_address,
    poolAddress: payload.pool_address,
  };
}

/**
 * Get current price of a token in USD via STON.fi API.
 */
export async function getTokenPrice(
  tokenSymbol: string,
): Promise<{ symbol: string; priceUsd: string } | null> {
  const token = resolveToken(tokenSymbol);
  if (!token) return null;

  try {
    const catalog = await getSwapTokenCatalog();
    const catalogToken = catalog.byAddress.get(token.address.toLowerCase());
    if (!catalogToken?.priceUsd) return null;

    return {
      symbol: token.symbol,
      priceUsd: catalogToken.priceUsd,
    };
  } catch {
    return null;
  }
}


import "server-only";

import { StonApiClient } from "@ston-fi/api";

import { formatTokenAmount, resolveToken, type TokenInfo } from "@/lib/defi/tokens";

const apiClient = new StonApiClient();

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

  const offerUnits = (
    BigInt(Math.round(parseFloat(params.offerAmount) * 10 ** offerToken.decimals))
  ).toString();

  const simulation = await apiClient.simulateSwap({
    offerAddress: offerToken.address,
    askAddress: askToken.address,
    offerUnits,
    slippageTolerance: "0.01",
  });

  const askAmount = formatTokenAmount(
    BigInt(simulation.askUnits),
    askToken.decimals,
  );
  const minAskAmount = formatTokenAmount(
    BigInt(simulation.minAskUnits),
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
    priceImpact: simulation.priceImpact ?? "0",
    swapRate,
    routerAddress: simulation.routerAddress,
    poolAddress: simulation.poolAddress,
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
    const assets = await apiClient.getAssets();
    const asset = assets.find(
      (a: { contractAddress: string }) =>
        a.contractAddress.toLowerCase() === token.address.toLowerCase(),
    );

    if (!asset) return null;

    return {
      symbol: token.symbol,
      priceUsd: (asset as { dexPriceUsd?: string }).dexPriceUsd ?? "unknown",
    };
  } catch {
    return null;
  }
}

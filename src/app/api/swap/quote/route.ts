import { NextRequest, NextResponse } from "next/server";
import {
  Blockchain,
  GaslessSettlement,
  Omniston,
  QuoteResponseEventType,
  SettlementMethod,
  type Address,
  type Quote,
  type QuoteResponseEvent_QuoteUpdated,
} from "@ston-fi/omniston-sdk";

import {
  formatTokenAmount,
  parseTokenAmount,
} from "@/lib/defi/tokens";
import {
  getSwapTokenCatalog,
  type SwapTokenCatalogItem,
} from "@/lib/defi/omniston-token-catalog";

export const runtime = "nodejs";

const QUOTE_TIMEOUT_MS = 7_000;
const BEST_QUOTE_WINDOW_MS = 500;
const NO_QUOTE_GRACE_MS = 350;
const QUOTE_RETRY_ATTEMPTS = 2;
const QUOTE_RETRY_DELAY_MS = 200;
const DEFAULT_OMNISTON_API_URL = "wss://omni-ws.ston.fi";

interface SwapQuoteRequestBody {
  offerTokenSymbol?: string;
  askTokenSymbol?: string;
  offerAmount?: string;
}

function toOmniAddress(address: string): Address {
  return {
    blockchain: Blockchain.TON,
    address,
  };
}

function normalizeAddress(address?: Address): string | null {
  if (!address?.address) {
    return null;
  }

  return address.address.toLowerCase();
}

function resolveTokenByAddress(
  tokenByAddress: Map<string, SwapTokenCatalogItem>,
  address?: Address,
) {
  const normalized = normalizeAddress(address);
  if (!normalized) {
    return null;
  }

  return tokenByAddress.get(normalized) ?? null;
}

function formatUnitsSafe(units: string, decimals: number): string {
  try {
    return formatTokenAmount(BigInt(units), decimals);
  } catch {
    return "0";
  }
}

async function requestBestQuote(params: {
  apiUrl: string;
  bidAddress: string;
  askAddress: string;
  bidUnits: string;
}): Promise<QuoteResponseEvent_QuoteUpdated> {
  const omniston = new Omniston({ apiUrl: params.apiUrl });

  return new Promise((resolve, reject) => {
    let settled = false;
    let subscription: { unsubscribe: () => void } | null = null;
    let settleTimerId: ReturnType<typeof setTimeout> | null = null;
    let noQuoteTimerId: ReturnType<typeof setTimeout> | null = null;
    let bestQuoteEvent: QuoteResponseEvent_QuoteUpdated | null = null;

    const pickBestQuote = (
      current: QuoteResponseEvent_QuoteUpdated | null,
      candidate: QuoteResponseEvent_QuoteUpdated,
    ) => {
      if (!current) {
        return candidate;
      }

      try {
        const currentAsk = BigInt(current.quote.askUnits);
        const candidateAsk = BigInt(candidate.quote.askUnits);
        return candidateAsk > currentAsk ? candidate : current;
      } catch {
        return candidate;
      }
    };

    const resolveBestQuote = () => {
      if (!bestQuoteEvent) {
        return false;
      }
      finalize();
      resolve(bestQuoteEvent);
      return true;
    };

    const scheduleBestQuoteResolution = () => {
      if (noQuoteTimerId) {
        clearTimeout(noQuoteTimerId);
        noQuoteTimerId = null;
      }
      if (settleTimerId) {
        clearTimeout(settleTimerId);
      }
      settleTimerId = setTimeout(() => {
        if (settled) {
          return;
        }

        if (resolveBestQuote()) {
          return;
        }

        finalize();
        reject(new Error("No swap quote available for this pair right now."));
      }, BEST_QUOTE_WINDOW_MS);
    };

    const scheduleNoQuoteResolution = () => {
      if (noQuoteTimerId) {
        clearTimeout(noQuoteTimerId);
      }
      noQuoteTimerId = setTimeout(() => {
        if (settled) {
          return;
        }
        if (resolveBestQuote()) {
          return;
        }
        finalize();
        reject(new Error("No swap quote available for this pair right now."));
      }, NO_QUOTE_GRACE_MS);
    };

    const finalize = () => {
      if (!settled) {
        settled = true;
      }
      subscription?.unsubscribe();
      if (settleTimerId) {
        clearTimeout(settleTimerId);
        settleTimerId = null;
      }
      if (noQuoteTimerId) {
        clearTimeout(noQuoteTimerId);
        noQuoteTimerId = null;
      }
      clearTimeout(timeoutId);
      omniston.close();
    };

    const timeoutId = setTimeout(() => {
      if (settled) {
        return;
      }
      if (resolveBestQuote()) {
        return;
      }
      finalize();
      reject(new Error("Timed out while waiting for swap quotes."));
    }, QUOTE_TIMEOUT_MS);

    try {
        const quoteStream = omniston.requestForQuote({
          bidAssetAddress: toOmniAddress(params.bidAddress),
          askAssetAddress: toOmniAddress(params.askAddress),
          amount: { bidUnits: params.bidUnits },
          settlementMethods: [SettlementMethod.SETTLEMENT_METHOD_SWAP],
          settlementParams: {
            maxPriceSlippageBps: 0,
            maxOutgoingMessages: 4,
            gaslessSettlement: GaslessSettlement.GASLESS_SETTLEMENT_POSSIBLE,
          },
        });

      subscription = quoteStream.subscribe({
        next: (event) => {
          if (settled) {
            return;
          }

          if (event.type === QuoteResponseEventType.QuoteUpdated) {
            bestQuoteEvent = pickBestQuote(bestQuoteEvent, event);
            scheduleBestQuoteResolution();
            return;
          }

          if (event.type === QuoteResponseEventType.Ack) {
            return;
          }

          if (event.type === QuoteResponseEventType.NoQuote) {
            if (resolveBestQuote()) {
              return;
            }
            scheduleNoQuoteResolution();
            return;
          }

          if (event.type === QuoteResponseEventType.Unsubscribed) {
            if (resolveBestQuote()) {
              return;
            }
            finalize();
            reject(new Error("No swap quote available for this pair right now."));
          }
        },
        error: (error) => {
          if (settled) {
            return;
          }
          finalize();
          reject(error instanceof Error ? error : new Error("Swap quote request failed."));
        },
      });
    } catch (error) {
      finalize();
      reject(error instanceof Error ? error : new Error("Swap quote request failed."));
    }
  });
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isNoQuoteError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return message.includes("no swap quote available");
}

async function requestBestQuoteWithRetry(params: {
  apiUrl: string;
  bidAddress: string;
  askAddress: string;
  bidUnits: string;
}): Promise<QuoteResponseEvent_QuoteUpdated> {
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= QUOTE_RETRY_ATTEMPTS; attempt += 1) {
    try {
      return await requestBestQuote(params);
    } catch (error) {
      lastError = error;
      const isLastAttempt = attempt === QUOTE_RETRY_ATTEMPTS;
      if (isLastAttempt || isNoQuoteError(error)) {
        break;
      }

      await wait(QUOTE_RETRY_DELAY_MS * attempt);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Swap quote request failed.");
}

function buildRoutePreview(
  quote: Quote,
  tokenByAddress: Map<string, SwapTokenCatalogItem>,
) {
  const routes = quote.params?.swap?.routes ?? [];

  return routes.map((route, routeIndex) => ({
    id: `route-${routeIndex + 1}`,
    steps: route.steps.map((step, stepIndex) => {
      const bidToken = resolveTokenByAddress(tokenByAddress, step.bidAssetAddress);
      const askToken = resolveTokenByAddress(tokenByAddress, step.askAssetAddress);
      const bidDecimals = bidToken?.decimals ?? 9;
      const askDecimals = askToken?.decimals ?? 9;

      return {
        id: `step-${stepIndex + 1}`,
        fromSymbol: bidToken?.symbol ?? "TOKEN",
        toSymbol: askToken?.symbol ?? "TOKEN",
        chunks: step.chunks.map((chunk, chunkIndex) => ({
          id: `chunk-${chunkIndex + 1}`,
          protocol: chunk.protocol,
          offerAmount: formatUnitsSafe(chunk.bidAmount, bidDecimals),
          askAmount: formatUnitsSafe(chunk.askAmount, askDecimals),
        })),
      };
    }),
  }));
}

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const body = (await request.json()) as SwapQuoteRequestBody;
    const offerTokenSymbol = body.offerTokenSymbol?.trim().toUpperCase();
    const askTokenSymbol = body.askTokenSymbol?.trim().toUpperCase();
    const offerAmount = body.offerAmount?.trim();

    if (!offerTokenSymbol || !askTokenSymbol || !offerAmount) {
      return NextResponse.json(
        { error: "offerTokenSymbol, askTokenSymbol and offerAmount are required." },
        { status: 400 },
      );
    }

    if (offerTokenSymbol.toUpperCase() === askTokenSymbol.toUpperCase()) {
      return NextResponse.json(
        { error: "Choose two different tokens to swap." },
        { status: 400 },
      );
    }

    const tokenCatalog = await getSwapTokenCatalog();
    const offerToken = tokenCatalog.bySymbol.get(offerTokenSymbol) ?? null;
    const askToken = tokenCatalog.bySymbol.get(askTokenSymbol) ?? null;
    if (!offerToken || !askToken) {
      return NextResponse.json(
        { error: "Unsupported token pair." },
        { status: 400 },
      );
    }

    let offerUnits: bigint;
    try {
      offerUnits = parseTokenAmount(offerAmount, offerToken.decimals);
      if (offerUnits <= 0n) {
        throw new Error("Amount must be greater than zero.");
      }
    } catch {
      return NextResponse.json(
        { error: "Invalid amount format." },
        { status: 400 },
      );
    }

    const apiUrl = process.env.OMNISTON_API_URL?.trim() || DEFAULT_OMNISTON_API_URL;
    const quoteEvent = await requestBestQuoteWithRetry({
      apiUrl,
      bidAddress: offerToken.address,
      askAddress: askToken.address,
      bidUnits: offerUnits.toString(),
    });
    const quote = quoteEvent.quote;

    const offerHuman = formatUnitsSafe(quote.bidUnits, offerToken.decimals);
    const askHuman = formatUnitsSafe(quote.askUnits, askToken.decimals);
    const offerNumeric = Number(offerHuman);
    const askNumeric = Number(askHuman);
    const rate = Number.isFinite(offerNumeric) && offerNumeric > 0
      ? (askNumeric / offerNumeric).toFixed(6)
      : "0";

    return NextResponse.json({
      rfqId: quoteEvent.rfqId,
      quoteId: quote.quoteId,
      quotePayload: quote,
      resolverName: quote.resolverName,
      offerToken: {
        symbol: offerToken.symbol,
        decimals: offerToken.decimals,
        address: offerToken.address,
      },
      askToken: {
        symbol: askToken.symbol,
        decimals: askToken.decimals,
        address: askToken.address,
      },
      offerAmount: offerHuman,
      askAmount: askHuman,
      rate,
      tradeStartDeadline: quote.tradeStartDeadline,
      gasBudget: quote.gasBudget,
      estimatedGasConsumption: quote.estimatedGasConsumption,
      routes: buildRoutePreview(quote, tokenCatalog.byAddress),
    });
  } catch (error) {
    if (isNoQuoteError(error)) {
      return NextResponse.json(
        { error: "No swap quote available for this pair right now." },
        { status: 422 },
      );
    }

    console.error("[SwapQuote] Failed to fetch Omniston quote:", error);
    return NextResponse.json(
      { error: "Could not fetch swap quote right now." },
      { status: 500 },
    );
  }
}

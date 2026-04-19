import "server-only";

import { KNOWN_TOKENS } from "@/lib/defi/tokens";

const DEFAULT_STON_API_URL = "https://api.ston.fi";
const TOKEN_CATALOG_TTL_MS = 15 * 60 * 1000; // Increased to 15 mins to reduce 429 errors
const MAX_SWAP_TOKEN_OPTIONS = 18;

export interface SwapTokenCatalogItem {
  symbol: string;
  name: string;
  address: string;
  decimals: number;
  imageUrl: string | null;
}

export interface SwapTokenCatalog {
  tokens: SwapTokenCatalogItem[];
  bySymbol: Map<string, SwapTokenCatalogItem>;
  byAddress: Map<string, SwapTokenCatalogItem>;
}

interface CachedCatalog extends SwapTokenCatalog {
  expiresAt: number;
}

interface CandidateToken extends SwapTokenCatalogItem {
  score: number;
}

let cachedCatalog: CachedCatalog | null = null;

function normalizeAddress(address: string) {
  return address.trim().toLowerCase();
}

function scoreAsset(asset: any) {
  const popularityScore = typeof asset.popularity_index === "number" ? asset.popularity_index : 0;
  const priorityScore = typeof asset.priority === "number" ? asset.priority : 0;
  return popularityScore * 100 + priorityScore;
}

function createFallbackCatalog(): SwapTokenCatalog {
  const fallbackTokens = KNOWN_TOKENS.map<SwapTokenCatalogItem>((token) => ({
    symbol: token.symbol.toUpperCase(),
    name: token.name,
    address: token.address,
    decimals: token.decimals,
    imageUrl: null,
  }));

  return buildCatalogFromCandidates(
    fallbackTokens.map((token, index) => ({ ...token, score: 50 - index })),
  );
}

function buildCatalogFromCandidates(candidates: CandidateToken[]): SwapTokenCatalog {
  const byAddressCandidates = new Map<string, CandidateToken>();

  for (const token of candidates) {
    const key = normalizeAddress(token.address);
    const existing = byAddressCandidates.get(key);
    if (!existing || token.score > existing.score) {
      byAddressCandidates.set(key, token);
    }
  }

  const byAddress = new Map<string, SwapTokenCatalogItem>();
  for (const [key, value] of byAddressCandidates.entries()) {
    byAddress.set(key, {
      symbol: value.symbol,
      name: value.name,
      address: value.address,
      decimals: value.decimals,
      imageUrl: value.imageUrl,
    });
  }

  const bySymbolCandidates = new Map<string, CandidateToken>();
  for (const token of byAddressCandidates.values()) {
    const existing = bySymbolCandidates.get(token.symbol);
    if (!existing || token.score > existing.score) {
      bySymbolCandidates.set(token.symbol, token);
    }
  }

  for (const knownToken of KNOWN_TOKENS) {
    const symbol = knownToken.symbol.toUpperCase();
    if (!bySymbolCandidates.has(symbol)) {
      bySymbolCandidates.set(symbol, {
        symbol,
        name: knownToken.name,
        address: knownToken.address,
        decimals: knownToken.decimals,
        imageUrl: null,
        score: 1,
      });
    }
    const addressKey = normalizeAddress(knownToken.address);
    if (!byAddress.has(addressKey)) {
      byAddress.set(addressKey, {
        symbol,
        name: knownToken.name,
        address: knownToken.address,
        decimals: knownToken.decimals,
        imageUrl: null,
      });
    }
  }

  const bySymbol = new Map<string, SwapTokenCatalogItem>();
  for (const [symbol, token] of bySymbolCandidates.entries()) {
    bySymbol.set(symbol, {
      symbol,
      name: token.name,
      address: token.address,
      decimals: token.decimals,
      imageUrl: token.imageUrl,
    });
  }

  const sortedTokens = Array.from(bySymbolCandidates.values())
    .sort((a, b) => {
      if (a.symbol === "TON") return -1;
      if (b.symbol === "TON") return 1;
      if (a.score !== b.score) return b.score - a.score;
      return a.symbol.localeCompare(b.symbol);
    })
    .map<SwapTokenCatalogItem>((token) => ({
      symbol: token.symbol,
      name: token.name,
      address: token.address,
      decimals: token.decimals,
      imageUrl: token.imageUrl,
    }));

  const tokens: SwapTokenCatalogItem[] = [];
  const seenSymbols = new Set<string>();
  const prioritySymbols = [
    "TON",
    ...KNOWN_TOKENS.map((token) => token.symbol.toUpperCase()),
  ];

  for (const symbol of prioritySymbols) {
    const match = sortedTokens.find((token) => token.symbol === symbol);
    if (!match || seenSymbols.has(match.symbol)) {
      continue;
    }
    tokens.push(match);
    seenSymbols.add(match.symbol);
    if (tokens.length >= MAX_SWAP_TOKEN_OPTIONS) {
      break;
    }
  }

  if (tokens.length < MAX_SWAP_TOKEN_OPTIONS) {
    for (const token of sortedTokens) {
      if (seenSymbols.has(token.symbol)) {
        continue;
      }
      tokens.push(token);
      seenSymbols.add(token.symbol);
      if (tokens.length >= MAX_SWAP_TOKEN_OPTIONS) {
        break;
      }
    }
  }

  return {
    tokens,
    bySymbol,
    byAddress,
  };
}

async function fetchFreshCatalog(): Promise<SwapTokenCatalog> {
  const apiUrl = process.env.STON_API_URL?.trim() || DEFAULT_STON_API_URL;

  // Use cached Next.js fetch to avoid STON 429 rate limits across serverless functions
  const response = await fetch(`${apiUrl}/v1/assets`, {
    next: { revalidate: 300 }, // Cache for 5 minutes globally
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch assets from STON API: ${response.status}`);
  }

  const payload = await response.json() as any;
  const assets = payload.asset_list || [];

  const candidates: CandidateToken[] = [];

  for (const asset of assets) {
    const symbol = asset.symbol?.trim().toUpperCase();
    const address = asset.contract_address?.trim();
    if (!symbol || !address || !Number.isFinite(asset.decimals)) {
      continue;
    }

    candidates.push({
      symbol,
      name: asset.display_name?.trim() || symbol,
      address,
      decimals: asset.decimals,
      imageUrl: asset.image_url ?? null,
      score: scoreAsset(asset),
    });
  }

  return buildCatalogFromCandidates(candidates);
}

export async function getSwapTokenCatalog(forceRefresh = false): Promise<SwapTokenCatalog> {
  const now = Date.now();
  if (!forceRefresh && cachedCatalog && cachedCatalog.expiresAt > now) {
    return cachedCatalog;
  }

  try {
    const freshCatalog = await fetchFreshCatalog();
    cachedCatalog = {
      ...freshCatalog,
      expiresAt: now + TOKEN_CATALOG_TTL_MS,
    };
    return freshCatalog;
  } catch (error) {
    console.error("[SwapTokens] Failed to refresh STON token catalog:", error);
    if (cachedCatalog) {
      return cachedCatalog;
    }
    return createFallbackCatalog();
  }
}

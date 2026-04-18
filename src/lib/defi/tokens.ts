/**
 * Token registry for common TON tokens.
 * Addresses are for mainnet.
 */

export interface TokenInfo {
  symbol: string;
  name: string;
  address: string;
  decimals: number;
  /** Aliases for fuzzy matching from voice input */
  aliases: string[];
}

/** Native TON uses a special address in STON.fi context */
export const TON_ADDRESS = "EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c";

export const KNOWN_TOKENS: TokenInfo[] = [
  {
    symbol: "TON",
    name: "Toncoin",
    address: TON_ADDRESS,
    decimals: 9,
    aliases: ["ton", "toncoin", "native"],
  },
  {
    symbol: "USDT",
    name: "Tether USD",
    address: "EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs",
    decimals: 6,
    aliases: ["usdt", "tether", "usd", "dollar", "dollars"],
  },
  {
    symbol: "tsTON",
    name: "Tonstakers stTON",
    address: "EQC98_qAmNEptUtPc7W6xdHh_ZHrBUFpw5Ft_IzNU20QAJav",
    decimals: 9,
    aliases: ["tston", "staked ton", "staked", "liquid staking"],
  },
  {
    symbol: "STON",
    name: "STON.fi",
    address: "EQA2kCVNwVsil2EM2mB0SkXytxCqQjS4mttjDpnXmwG9F6bO",
    decimals: 9,
    aliases: ["ston", "stonfi"],
  },
  {
    symbol: "jUSDC",
    name: "USD Coin (bridged)",
    address: "EQB-MPwrd1G6WKNkLz_VnV6WqBDd142KMQv-g1O-8QUA3728",
    decimals: 6,
    aliases: ["usdc", "jusdc", "usd coin"],
  },
  {
    symbol: "NOT",
    name: "Notcoin",
    address: "EQAvlWFDxGF2lXm67y4yzC17wYKD9A0guwPkMs1gOsM__NOT",
    decimals: 9,
    aliases: ["not", "notcoin"],
  },
];

/**
 * Resolve a token by symbol, name, or alias (case-insensitive fuzzy match).
 * Returns null if not found.
 */
export function resolveToken(query: string): TokenInfo | null {
  const q = query.toLowerCase().trim();

  // Exact symbol match first
  const bySymbol = KNOWN_TOKENS.find((t) => t.symbol.toLowerCase() === q);
  if (bySymbol) return bySymbol;

  // Alias match
  const byAlias = KNOWN_TOKENS.find((t) =>
    t.aliases.some((a) => a === q || q.includes(a) || a.includes(q)),
  );
  if (byAlias) return byAlias;

  // Name contains match
  const byName = KNOWN_TOKENS.find((t) =>
    t.name.toLowerCase().includes(q),
  );
  return byName ?? null;
}

/**
 * Format a raw blockchain amount to a human-readable string.
 * Example: formatTokenAmount(1500000000n, 9) → "1.5"
 */
export function formatTokenAmount(
  amount: bigint | string,
  decimals: number,
): string {
  const raw = typeof amount === "string" ? BigInt(amount) : amount;
  const divisor = BigInt(10 ** decimals);
  const whole = raw / divisor;
  const fraction = raw % divisor;

  if (fraction === 0n) return whole.toString();

  const fractionStr = fraction.toString().padStart(decimals, "0");
  // Trim trailing zeros
  const trimmed = fractionStr.replace(/0+$/, "");
  return `${whole}.${trimmed}`;
}

/**
 * Parse a human-readable amount to raw blockchain units.
 * Example: parseTokenAmount("1.5", 9) → 1500000000n
 */
export function parseTokenAmount(
  humanAmount: string,
  decimals: number,
): bigint {
  const parts = humanAmount.split(".");
  const wholePart = parts[0] || "0";
  let fractionPart = parts[1] || "";

  // Pad or truncate fraction to match decimals
  if (fractionPart.length > decimals) {
    fractionPart = fractionPart.slice(0, decimals);
  } else {
    fractionPart = fractionPart.padEnd(decimals, "0");
  }

  return BigInt(wholePart) * BigInt(10 ** decimals) + BigInt(fractionPart);
}

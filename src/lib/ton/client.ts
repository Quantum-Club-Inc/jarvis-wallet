import "server-only";

import { TonClient, Address, fromNano } from "@ton/ton";

import { requireEnv } from "@/lib/server/env";

let clientInstance: TonClient | null = null;

export function getTonClient(): TonClient {
  if (clientInstance) return clientInstance;

  const apiKey = requireEnv("TONAPI_KEY");
  clientInstance = new TonClient({
    endpoint: "https://toncenter.com/api/v2/jsonRPC",
    apiKey,
  });

  return clientInstance;
}

/**
 * Get balance of a TON wallet address in nanotons (raw).
 */
export async function getBalance(address: string): Promise<bigint> {
  const client = getTonClient();
  const addr = Address.parse(address);
  return client.getBalance(addr);
}

/**
 * Get balance formatted as a human-readable string.
 */
export async function getBalanceFormatted(address: string): Promise<string> {
  const balance = await getBalance(address);
  return fromNano(balance);
}

/**
 * Get jetton balances for an address via TonAPI.
 * Returns a simplified list of token balances.
 */
export async function getJettonBalances(
  address: string,
): Promise<
  Array<{
    symbol: string;
    name: string;
    balance: string;
    jettonAddress: string;
  }>
> {
  const apiKey = requireEnv("TONAPI_KEY");

  const response = await fetch(
    `https://tonapi.io/v2/accounts/${encodeURIComponent(address)}/jettons`,
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    },
  );

  if (!response.ok) {
    console.error("TonAPI jetton query failed:", response.status);
    return [];
  }

  const data = (await response.json()) as {
    balances?: Array<{
      balance: string;
      jetton: {
        address: string;
        name: string;
        symbol: string;
        decimals: number;
      };
    }>;
  };

  return (data.balances ?? []).map((item) => ({
    symbol: item.jetton.symbol,
    name: item.jetton.name,
    balance: item.balance,
    jettonAddress: item.jetton.address,
  }));
}

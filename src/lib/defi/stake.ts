import "server-only";
import { Address as TonAddress } from "@ton/core";

/**
 * Tonstakers integration for liquid staking on TON.
 * Uses Tonstakers' public staking cache endpoint as the primary source of truth
 * for APY/rates/TVL and TonAPI pool metadata for minimum stake fallback.
 */

/** Tonstakers pool contract address (mainnet) */
export const TONSTAKERS_POOL_ADDRESS =
  "EQCkWxfyhAkim3g2DjKQQg8T5P4g-Q1-K_jErGcDJZ4i-vqR";

/** tsTON jetton address (mainnet) */
export const TSTON_ADDRESS =
  "EQC98_qAmNEptUtPc7W6xdHh_ZHrBUFpw5Ft_IzNU20QAJav";

const TONSTAKERS_STAKING_CACHE_URL =
  "https://api.tonstakers.com/cache/v1/blockchain/staking";
const TON_NANO = 1_000_000_000n;

export interface StakingInfo {
  apy: string;
  tvlTon: string;
  tstonRate: string;
  minStake: string;
  stakersCount: string;
}

interface TonstakersStakingCacheResponse {
  status: number;
  message: string | null;
  data?: {
    staking_data?: {
      tvl: string;
      stakers: number;
      currentApy: number;
      tsTONPrice: number;
    };
  };
}

interface TonApiPoolResponse {
  pool?: {
    min_stake?: number | string;
    apy?: number;
    total_amount?: number | string;
    current_nominators?: number;
  };
}

function formatInteger(value: bigint): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

function formatTonFromNano(value: bigint): string {
  const wholeTon = value / TON_NANO;
  return formatInteger(wholeTon);
}

function parseNano(value: string | number | null | undefined): bigint | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return BigInt(Math.trunc(value));
  }

  if (typeof value === "string" && value.trim()) {
    try {
      return BigInt(value.trim());
    } catch {
      return null;
    }
  }

  return null;
}

async function fetchTonstakersCache() {
  const response = await fetch(TONSTAKERS_STAKING_CACHE_URL, {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Tonstakers cache request failed with status ${response.status}.`);
  }

  const payload = (await response.json()) as TonstakersStakingCacheResponse;
  return payload.data?.staking_data ?? null;
}

async function fetchTonApiPoolInfo() {
  const poolAddress = TonAddress.parse(TONSTAKERS_POOL_ADDRESS).toRawString();
  const response = await fetch(`https://tonapi.io/v2/staking/pool/${poolAddress}`, {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`TonAPI pool request failed with status ${response.status}.`);
  }

  const payload = (await response.json()) as TonApiPoolResponse;
  return payload.pool ?? null;
}

/**
 * Fetch current staking information from Tonstakers public API.
 */
export async function getStakingInfo(): Promise<StakingInfo> {
  try {
    const [stakingData, poolInfo] = await Promise.all([
      fetchTonstakersCache().catch(() => null),
      fetchTonApiPoolInfo().catch(() => null),
    ]);

    const apyValue = stakingData?.currentApy ?? poolInfo?.apy ?? null;
    const tvlNano = parseNano(stakingData?.tvl ?? poolInfo?.total_amount ?? null);
    const minStakeNano = parseNano(poolInfo?.min_stake ?? null) ?? TON_NANO;
    const stakersValue = stakingData?.stakers ?? poolInfo?.current_nominators ?? null;
    const tsTonPrice = stakingData?.tsTONPrice ?? null;

    if (apyValue !== null && tvlNano !== null && stakersValue !== null) {
      return {
        apy: `${apyValue.toFixed(2)}%`,
        tvlTon: formatTonFromNano(tvlNano),
        tstonRate:
          typeof tsTonPrice === "number" && Number.isFinite(tsTonPrice)
            ? `1 tsTON ≈ ${tsTonPrice.toFixed(4)} TON`
            : "~1:1 (liquid)",
        minStake: `${formatTonFromNano(minStakeNano)} TON`,
        stakersCount: new Intl.NumberFormat("en-US").format(stakersValue),
      };
    }
  } catch (error) {
    console.error("[Stake] Failed to fetch staking info:", error);
  }

  // Safe fallback when APIs are unavailable.
  return {
    apy: "--",
    tvlTon: "--",
    tstonRate: "--",
    minStake: "1 TON",
    stakersCount: "--",
  };
}

export interface StakeTransactionParams {
  type: "stake" | "unstake";
  amount: string;
  poolAddress: string;
  description: string;
}

/**
 * Build stake transaction parameters.
 * The actual signing and sending happens client-side.
 */
export function buildStakeTransaction(
  amountTon: string,
): StakeTransactionParams {
  return {
    type: "stake",
    amount: amountTon,
    poolAddress: TONSTAKERS_POOL_ADDRESS,
    description: `Stake ${amountTon} TON with Tonstakers. You will receive tsTON (liquid staking token) that earns staking rewards automatically.`,
  };
}

/**
 * Build unstake transaction parameters.
 */
export function buildUnstakeTransaction(
  amountTsTon: string,
): StakeTransactionParams {
  return {
    type: "unstake",
    amount: amountTsTon,
    poolAddress: TONSTAKERS_POOL_ADDRESS,
    description: `Unstake ${amountTsTon} tsTON from Tonstakers. Standard unstaking takes ~18 hours (end of validation cycle).`,
  };
}

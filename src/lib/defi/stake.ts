import "server-only";

/**
 * Tonstakers SDK integration for liquid staking on TON.
 *
 * Note: tonstakers-sdk normally requires a wallet connector instance.
 * For server-side tool-calling, we query staking info via their public API
 * and build transaction params manually. The actual tx signing happens
 * client-side after the agent prepares the params.
 */

/** Tonstakers pool contract address (mainnet) */
export const TONSTAKERS_POOL_ADDRESS =
  "EQCkWxfyhAkim3g2DjKQQg8T5P4g-Q1-K_jErGcDJZ4i-vqR";

/** tsTON jetton address (mainnet) */
export const TSTON_ADDRESS =
  "EQC98_qAmNEptUtPc7W6xdHh_ZHrBUFpw5Ft_IzNU20QAJav";

export interface StakingInfo {
  apy: string;
  tvlTon: string;
  tstonRate: string;
  minStake: string;
  stakersCount: string;
}

/**
 * Fetch current staking information from Tonstakers public API.
 */
export async function getStakingInfo(): Promise<StakingInfo> {
  try {
    const response = await fetch("https://tonapi.io/v2/staking/pool/" + TONSTAKERS_POOL_ADDRESS, {
      cache: "no-store",
    });

    if (response.ok) {
      const data = (await response.json()) as {
        pool: {
          apy: number;
          total_amount: number;
          current_nominators: number;
          min_stake: number;
        };
      };

      return {
        apy: (data.pool.apy * 100).toFixed(2) + "%",
        tvlTon: (data.pool.total_amount / 1e9).toFixed(0),
        tstonRate: "~1:1 (liquid)",
        minStake: (data.pool.min_stake / 1e9).toFixed(0) + " TON",
        stakersCount: data.pool.current_nominators.toString(),
      };
    }
  } catch {
    // Fall through to defaults
  }

  // Fallback / mock data for demo
  return {
    apy: "4.2%",
    tvlTon: "45,000,000",
    tstonRate: "~1:1.04",
    minStake: "1 TON",
    stakersCount: "100,000+",
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

import "server-only";
import { Tonstakers } from "tonstakers-sdk";

export interface StakingInfo {
  apy: string;
  tvlTon: string;
  tstonRate: string;
  minStake: string;
  stakersCount: string;
}

const TON_NANO = 1_000_000_000n;

// SDK internal types matched structurally
interface TransactionMessage {
    address: string;
    amount: string;
    payload: string;
}
interface TransactionDetails {
    validUntil: number;
    messages: TransactionMessage[];
}

/** A dummy connector for read-only Tonstakers SDK use */
class ReadOnlyConnector {
  async sendTransaction(): Promise<{ boc: string }> {
    return { boc: "" };
  }
  onStatusChange(callback: (wallet: any) => void): void {
    // no-op
  }
}

/** InterceptConnector catches the transaction payload without sending it */
class InterceptConnector {
  public capturedTx: TransactionDetails | null = null;
  async sendTransaction(tx: TransactionDetails): Promise<{ boc: string }> {
    this.capturedTx = tx;
    return { boc: "" };
  }
  onStatusChange(): void {
    // no-op
  }
}

export const TONSTAKERS_POOL_ADDRESS = "EQCkWxfyhAkim3g2DjKQQg8T5P4g-Q1-K_jErGcDJZ4i-vqR";

function getTonstakersInstance(connector: any) {
  return new Tonstakers({
    connector,
    tonApiKey: process.env.TONAPI_KEY?.trim() || undefined,
  });
}

function formatTonFromNano(value: number): string {
  const wholeTon = BigInt(Math.floor(value)) / TON_NANO;
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(wholeTon);
}

/**
 * Fetch current staking information from Tonstakers SDK.
 */
export async function getStakingInfo(): Promise<StakingInfo> {
  const ts = getTonstakersInstance(new ReadOnlyConnector());

  try {
    const apy = await ts.getCurrentApy();
    const tvl = await ts.getTvl();
    const stakers = await ts.getStakersCount();
    const rates = await ts.getRates();

    const currentRate = rates?.tsTonToTon ?? 1.0;

    return {
      apy: `${apy.toFixed(2)}%`,
      tvlTon: formatTonFromNano(tvl),
      tstonRate: `1 tsTON ≈ ${currentRate.toFixed(4)} TON`,
      minStake: "1 TON",
      stakersCount: new Intl.NumberFormat("en-US").format(stakers),
    };
  } catch (error) {
    console.error("[Stake] Failed to fetch staking info from SDK:", error);
    return {
      apy: "--",
      tvlTon: "--",
      tstonRate: "--",
      minStake: "1 TON",
      stakersCount: "--",
    };
  }
}

export interface StakeTransactionParams {
  type: "stake" | "unstake";
  amount: string;
  poolAddress: string;
  description: string;
}

/**
 * Standard description builder for compatibility
 */
export function buildStakeTransaction(amountTon: string): StakeTransactionParams {
  return {
    type: "stake",
    amount: amountTon,
    poolAddress: TONSTAKERS_POOL_ADDRESS,
    description: `Stake ${amountTon} TON with Tonstakers. You will receive tsTON (liquid staking token) that earns staking rewards automatically.`,
  };
}

export function buildUnstakeTransaction(amountTsTon: string): StakeTransactionParams {
  return {
    type: "unstake",
    amount: amountTsTon,
    poolAddress: TONSTAKERS_POOL_ADDRESS,
    description: `Unstake ${amountTsTon} tsTON from Tonstakers. Standard unstaking takes ~18 hours (end of validation cycle).`,
  };
}

/**
 * Generates exact blockchain payload messages using Tonstakers SDK natively.
 */
export async function generateStakeMessages(amountNano: bigint) {
  const interceptor = new InterceptConnector();
  const ts = getTonstakersInstance(interceptor);
  await ts.stake(amountNano); // Populates the interceptor securely without signing
  return interceptor.capturedTx?.messages ?? [];
}

export async function generateUnstakeMessages(amountNano: bigint) {
  const interceptor = new InterceptConnector();
  const ts = getTonstakersInstance(interceptor);
  await ts.unstake(amountNano); 
  return interceptor.capturedTx?.messages ?? [];
}

import "server-only";

import { tool } from "ai";
import { z } from "zod";

import { getBalanceFormatted, getJettonBalances } from "@/lib/ton/client";
import { simulateSwap, getTokenPrice } from "@/lib/defi/swap";
import {
  getStakingInfo,
  buildStakeTransaction,
  buildUnstakeTransaction,
} from "@/lib/defi/stake";
import { formatTokenAmount } from "@/lib/defi/tokens";

/**
 * All DeFi tools available to the Jarvis AI agent.
 * Each tool is a function the LLM can invoke via structured tool calling.
 */
export const agentTools = {
  check_balance: tool({
    description:
      "Check the TON balance and all jetton (token) balances for the user's wallet address.",
    inputSchema: z.object({
      walletAddress: z
        .string()
        .describe("The TON wallet address to check balances for"),
    }),
    execute: async ({ walletAddress }) => {
      try {
        const [tonBalance, jettons] = await Promise.all([
          getBalanceFormatted(walletAddress),
          getJettonBalances(walletAddress),
        ]);

        const jettonBalances = jettons.map((j) => ({
          symbol: j.symbol,
          name: j.name,
          balance: j.balance,
        }));

        return {
          success: true,
          tonBalance: tonBalance + " TON",
          jettonBalances,
          totalTokens: jettonBalances.length + 1,
        };
      } catch (error) {
        return {
          success: false,
          error: `Failed to fetch balance: ${error instanceof Error ? error.message : "Unknown error"}`,
        };
      }
    },
  }),

  swap_tokens: tool({
    description:
      "Simulate a token swap on STON.fi DEX. Returns estimated output, price impact, and swap rate for user confirmation. Does NOT execute the swap.",
    inputSchema: z.object({
      fromToken: z
        .string()
        .describe(
          "The token to swap FROM (e.g., 'TON', 'USDT', 'tsTON')",
        ),
      toToken: z
        .string()
        .describe("The token to swap TO (e.g., 'USDT', 'TON', 'STON')"),
      amount: z
        .string()
        .describe(
          "The amount of the from-token to swap (human readable, e.g., '5.5')",
        ),
    }),
    execute: async ({ fromToken, toToken, amount }) => {
      try {
        const simulation = await simulateSwap({
          offerTokenSymbol: fromToken,
          askTokenSymbol: toToken,
          offerAmount: amount,
        });

        return {
          success: true,
          from: `${simulation.offerAmount} ${simulation.offerToken.symbol}`,
          to: `${simulation.askAmount} ${simulation.askToken.symbol}`,
          minimumReceived: `${simulation.minAskAmount} ${simulation.askToken.symbol}`,
          priceImpact: simulation.priceImpact,
          swapRate: `1 ${simulation.offerToken.symbol} = ${simulation.swapRate} ${simulation.askToken.symbol}`,
          status: "preview",
          message:
            "This is a simulation. Ask the user to confirm before executing.",
        };
      } catch (error) {
        return {
          success: false,
          error: `Swap simulation failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        };
      }
    },
  }),

  stake_ton: tool({
    description:
      "Prepare a TON staking transaction via Tonstakers. The user will receive tsTON (liquid staking token) that earns staking rewards automatically.",
    inputSchema: z.object({
      amount: z
        .string()
        .describe("Amount of TON to stake (human readable, e.g., '10')"),
    }),
    execute: async ({ amount }) => {
      try {
        const [txParams, stakingInfo] = await Promise.all([
          Promise.resolve(buildStakeTransaction(amount)),
          getStakingInfo(),
        ]);

        return {
          success: true,
          action: "stake",
          amount: `${amount} TON`,
          willReceive: "~" + amount + " tsTON",
          currentApy: stakingInfo.apy,
          poolTvl: stakingInfo.tvlTon + " TON",
          minStake: stakingInfo.minStake,
          description: txParams.description,
          status: "ready_to_execute",
          message:
            "Transaction prepared. Ask the user to confirm before sending.",
        };
      } catch (error) {
        return {
          success: false,
          error: `Staking preparation failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        };
      }
    },
  }),

  unstake_ton: tool({
    description:
      "Prepare an unstaking transaction to convert tsTON back to TON via Tonstakers. Standard unstaking takes ~18 hours.",
    inputSchema: z.object({
      amount: z
        .string()
        .describe(
          "Amount of tsTON to unstake (human readable, e.g., '10')",
        ),
    }),
    execute: async ({ amount }) => {
      try {
        const txParams = buildUnstakeTransaction(amount);

        return {
          success: true,
          action: "unstake",
          amount: `${amount} tsTON`,
          willReceive: "~" + amount + " TON",
          estimatedTime: "~18 hours (end of validation cycle)",
          description: txParams.description,
          status: "ready_to_execute",
          message:
            "Transaction prepared. Ask the user to confirm before sending.",
        };
      } catch (error) {
        return {
          success: false,
          error: `Unstaking preparation failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        };
      }
    },
  }),

  get_staking_info: tool({
    description:
      "Get current Tonstakers liquid staking information including APY, TVL, tsTON rate, and minimum stake amount.",
    inputSchema: z.object({}),
    execute: async () => {
      try {
        const info = await getStakingInfo();
        return {
          success: true,
          apy: info.apy,
          tvlTon: info.tvlTon + " TON",
          tstonRate: info.tstonRate,
          minStake: info.minStake,
          stakersCount: info.stakersCount,
          protocol: "Tonstakers",
          token: "tsTON",
        };
      } catch (error) {
        return {
          success: false,
          error: `Failed to fetch staking info: ${error instanceof Error ? error.message : "Unknown error"}`,
        };
      }
    },
  }),

  get_token_price: tool({
    description:
      "Get the current USD price of a token on the TON blockchain via STON.fi.",
    inputSchema: z.object({
      token: z
        .string()
        .describe(
          "Token symbol or name (e.g., 'TON', 'USDT', 'tsTON', 'STON')",
        ),
    }),
    execute: async ({ token }) => {
      try {
        const price = await getTokenPrice(token);
        if (!price) {
          return {
            success: false,
            error: `Could not find price for token: ${token}`,
          };
        }
        return {
          success: true,
          symbol: price.symbol,
          priceUsd: "$" + price.priceUsd,
        };
      } catch (error) {
        return {
          success: false,
          error: `Failed to fetch price: ${error instanceof Error ? error.message : "Unknown error"}`,
        };
      }
    },
  }),
};

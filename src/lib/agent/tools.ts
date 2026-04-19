import "server-only";

import { randomUUID } from "node:crypto";

import { tool } from "ai";
import { z } from "zod";

import { getBalanceFormatted, getJettonBalances } from "@/lib/ton/client";
import { simulateSwap, getTokenPrice } from "@/lib/defi/swap";
import {
  getStakingInfo,
  buildStakeTransaction,
  buildUnstakeTransaction,
} from "@/lib/defi/stake";

type InteractionMode = "overview" | "voice" | "chat";

interface CreateAgentToolsOptions {
  defaultWalletAddress?: string;
  interactionMode?: InteractionMode;
  requestOrigin?: string;
}

interface AutomationResult {
  requestId?: string;
  action?: string;
  walletAddress?: string;
  quote?: {
    offerAmount?: string;
    offerToken?: string;
    askAmount?: string;
    askToken?: string;
  };
  amountTon?: string;
  submitted?: {
    walletAddress?: string;
    seqno?: number;
    sentMessages?: number;
  } | null;
}

function formatUnknownError(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

function normalizeOrigin(rawOrigin?: string): string | null {
  if (!rawOrigin) {
    return null;
  }

  const value = rawOrigin.trim();
  if (!value) {
    return null;
  }

  if (/^https?:\/\//i.test(value)) {
    return value.replace(/\/+$/, "");
  }

  return `https://${value}`.replace(/\/+$/, "");
}

function resolveAutomationEndpoint(requestOrigin?: string): string | null {
  const configuredN8nWebhook = process.env.N8N_AGENT_WEBHOOK_URL?.trim();
  if (configuredN8nWebhook) {
    return configuredN8nWebhook;
  }

  const fallbackOrigin = normalizeOrigin(requestOrigin)
    ?? normalizeOrigin(process.env.APP_BASE_URL)
    ?? normalizeOrigin(process.env.NEXT_PUBLIC_APP_URL)
    ?? normalizeOrigin(process.env.VERCEL_URL);

  if (!fallbackOrigin) {
    return null;
  }

  return `${fallbackOrigin}/api/automation/n8n`;
}

async function parseJsonSafe(response: Response): Promise<unknown> {
  try {
    return (await response.json()) as unknown;
  } catch {
    return null;
  }
}

async function runN8nAutomation(
  action: "swap" | "stake",
  payload: Record<string, unknown>,
  requestOrigin?: string,
): Promise<AutomationResult> {
  const endpoint = resolveAutomationEndpoint(requestOrigin);
  if (!endpoint) {
    throw new Error(
      "Automation endpoint is not configured. Set N8N_AGENT_WEBHOOK_URL or APP_BASE_URL.",
    );
  }

  const secret = process.env.N8N_WEBHOOK_SECRET?.trim();
  if (!secret) {
    throw new Error("N8N_WEBHOOK_SECRET is required for automation execution.");
  }

  const requestId = `jarvis-${action}-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-jarvis-n8n-secret": secret,
    },
    body: JSON.stringify({
      requestId,
      action,
      dryRun: false,
      ...payload,
    }),
    cache: "no-store",
  });

  const data = await parseJsonSafe(response);
  if (typeof data !== "object" || data === null) {
    throw new Error(`Automation request failed (${response.status}).`);
  }

  const payloadError = "error" in data && typeof data.error === "string"
    ? data.error
    : `Automation request failed (${response.status}).`;
  if (!response.ok || ("ok" in data && data.ok !== true)) {
    throw new Error(payloadError);
  }

  const result = "result" in data && typeof data.result === "object" && data.result !== null
    ? (data.result as AutomationResult)
    : null;

  if (!result) {
    throw new Error("Automation response did not include a result payload.");
  }

  return result;
}

/**
 * All DeFi tools available to the Jarvis AI agent.
 * Each tool is a function the LLM can invoke via structured tool calling.
 */
export function createAgentTools(options?: string | CreateAgentToolsOptions) {
  const resolvedOptions = typeof options === "string"
    ? { defaultWalletAddress: options }
    : options ?? {};
  const {
    defaultWalletAddress,
    interactionMode = "chat",
    requestOrigin,
  } = resolvedOptions;
  const resolvedDefaultWalletAddress = defaultWalletAddress?.trim() || undefined;
  const shouldExecuteViaN8n = interactionMode === "voice";

  return {
    check_balance: tool({
      description:
        "Check the TON balance and all jetton (token) balances for the user's wallet address.",
      inputSchema: z.object({
        walletAddress: z
          .string()
          .optional()
          .describe(
            "Optional TON wallet address override. If omitted, use the current user's connected wallet address.",
          ),
      }),
      execute: async ({ walletAddress }) => {
        try {
          const targetWalletAddress = walletAddress?.trim() || resolvedDefaultWalletAddress;
          if (!targetWalletAddress) {
            return {
              success: false,
              error:
                "No wallet address is available. Ask the user to connect their wallet first.",
            };
          }

          const [tonBalance, jettons] = await Promise.all([
            getBalanceFormatted(targetWalletAddress),
            getJettonBalances(targetWalletAddress),
          ]);

          const jettonBalances = jettons.map((j) => ({
            symbol: j.symbol,
            name: j.name,
            balance: j.balance,
          }));

          return {
            success: true,
            walletAddress: targetWalletAddress,
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
      "Swap tool. In voice mode executes swap through n8n automation; in chat mode returns STON.fi preview for confirmation.",
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
        const offerTokenSymbol = fromToken.trim().toUpperCase();
        const askTokenSymbol = toToken.trim().toUpperCase();
        const offerAmount = amount.trim();

        if (shouldExecuteViaN8n) {
          const automationResult = await runN8nAutomation(
            "swap",
            {
              offerTokenSymbol,
              askTokenSymbol,
              offerAmount,
            },
            requestOrigin,
          );
          const quote = automationResult.quote;

          return {
            success: true,
            status: "executed_via_n8n",
            executionMode: "automation",
            requestId: automationResult.requestId,
            from: quote?.offerAmount && quote?.offerToken
              ? `${quote.offerAmount} ${quote.offerToken}`
              : `${offerAmount} ${offerTokenSymbol}`,
            to: quote?.askAmount && quote?.askToken
              ? `${quote.askAmount} ${quote.askToken}`
              : askTokenSymbol,
            submittedBy: "n8n",
            automationWallet: automationResult.walletAddress
              ?? automationResult.submitted?.walletAddress
              ?? null,
            seqno: automationResult.submitted?.seqno ?? null,
            message: "Swap submitted via n8n automation.",
          };
        }

        const simulation = await simulateSwap({
          offerTokenSymbol,
          askTokenSymbol,
          offerAmount,
        });

        return {
          success: true,
          from: `${simulation.offerAmount} ${simulation.offerToken.symbol}`,
          to: `${simulation.askAmount} ${simulation.askToken.symbol}`,
          offerAmount: simulation.offerAmount,
          offerTokenSymbol: simulation.offerToken.symbol,
          askTokenSymbol: simulation.askToken.symbol,
          minimumReceived: `${simulation.minAskAmount} ${simulation.askToken.symbol}`,
          priceImpact: simulation.priceImpact,
          swapRate: `1 ${simulation.offerToken.symbol} = ${simulation.swapRate} ${simulation.askToken.symbol}`,
          status: "preview",
          executionMode: "preview",
          message:
            "Swap preview prepared and ready for execution.",
        };
      } catch (error) {
        return {
          success: false,
          error: `Swap failed: ${formatUnknownError(error)}`,
        };
      }
    },
  }),

    stake_ton: tool({
    description:
      "Stake TON tool. In voice mode executes staking through n8n automation; in chat mode prepares staking details for confirmation.",
    inputSchema: z.object({
      amount: z
        .string()
        .describe("Amount of TON to stake (human readable, e.g., '10')"),
    }),
    execute: async ({ amount }) => {
      try {
        const amountTon = amount.trim();

        if (shouldExecuteViaN8n) {
          const automationResult = await runN8nAutomation(
            "stake",
            { amountTon },
            requestOrigin,
          );

          return {
            success: true,
            action: "stake",
            amount: `${automationResult.amountTon ?? amountTon} TON`,
            amountTon: automationResult.amountTon ?? amountTon,
            willReceive: `~${automationResult.amountTon ?? amountTon} tsTON`,
            status: "executed_via_n8n",
            executionMode: "automation",
            requestId: automationResult.requestId,
            submittedBy: "n8n",
            automationWallet: automationResult.walletAddress
              ?? automationResult.submitted?.walletAddress
              ?? null,
            seqno: automationResult.submitted?.seqno ?? null,
            message: "Stake submitted via n8n automation.",
          };
        }

        const [txParams, stakingInfo] = await Promise.all([
          Promise.resolve(buildStakeTransaction(amountTon)),
          getStakingInfo(),
        ]);

        return {
          success: true,
          action: "stake",
          amount: `${amountTon} TON`,
          amountTon: txParams.amount,
          poolAddress: txParams.poolAddress,
          willReceive: "~" + amountTon + " tsTON",
          currentApy: stakingInfo.apy,
          poolTvl: stakingInfo.tvlTon + " TON",
          minStake: stakingInfo.minStake,
          description: txParams.description,
          status: "ready_to_execute",
          executionMode: "preview",
          message:
            "Transaction prepared and ready to execute.",
        };
      } catch (error) {
        return {
          success: false,
          error: `Staking failed: ${formatUnknownError(error)}`,
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
}

export const agentTools = createAgentTools();

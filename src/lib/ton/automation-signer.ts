import "server-only";

import { Address as TonAddress, Cell, internal, loadStateInit, SendMode } from "@ton/core";
import { mnemonicToPrivateKey } from "@ton/crypto";
import { WalletContractV4 } from "@ton/ton";

import { requireEnv } from "@/lib/server/env";

const DEFAULT_TONAPI_BASE_URL = "https://tonapi.io";

export interface AutomationTransferMessage {
  targetAddress: string;
  sendAmount: string;
  payload?: string;
  jettonWalletStateInit?: string;
}

interface AutomationSignerContext {
  walletAddress: string;
  walletContract: WalletContractV4;
  secretKey: Buffer;
  tonApiBaseUrl: string;
  tonApiKey: string;
}

let signerContextPromise: Promise<AutomationSignerContext> | null = null;

function normalizeTonAddress(address: string): string {
  return TonAddress.parse(address).toString({
    bounceable: false,
    testOnly: false,
  });
}

function parseMnemonic(rawMnemonic: string): string[] {
  const mnemonic = rawMnemonic
    .trim()
    .replace(/^['"]|['"]$/g, "")
    .split(/[\s,]+/)
    .map((word) => word.trim())
    .filter(Boolean);

  if (mnemonic.length < 12) {
    throw new Error("AUTOMATION_WALLET_MNEMONIC must contain a valid mnemonic phrase.");
  }

  return mnemonic;
}

function parseCellFromEncoded(rawCell?: string): Cell | undefined {
  const serialized = rawCell?.trim();
  if (!serialized) {
    return undefined;
  }

  const normalizedBase64 = serialized.replace(/-/g, "+").replace(/_/g, "/");
  try {
    return Cell.fromBase64(normalizedBase64);
  } catch {
    // Fall back to hex parsing for providers that return BOC in hex.
  }

  if (/^[0-9a-f]+$/i.test(serialized) && serialized.length % 2 === 0) {
    return Cell.fromHex(serialized);
  }

  throw new Error("Automation transfer message contains an invalid TON cell.");
}

async function buildSignerContext(): Promise<AutomationSignerContext> {
  const mnemonicWords = parseMnemonic(requireEnv("AUTOMATION_WALLET_MNEMONIC"));
  const configuredAddress = normalizeTonAddress(requireEnv("AUTOMATION_WALLET_ADDRESS"));
  const tonApiKey = requireEnv("TONAPI_KEY");
  const keyPair = await mnemonicToPrivateKey(mnemonicWords);
  const walletContract = WalletContractV4.create({
    workchain: 0,
    publicKey: keyPair.publicKey,
  });
  const derivedAddress = walletContract.address.toString({
    bounceable: false,
    testOnly: false,
  });

  if (derivedAddress !== configuredAddress) {
    throw new Error(
      `AUTOMATION_WALLET_ADDRESS does not match AUTOMATION_WALLET_MNEMONIC. Expected ${derivedAddress}.`,
    );
  }

  return {
    walletAddress: configuredAddress,
    walletContract,
    secretKey: Buffer.from(keyPair.secretKey),
    tonApiBaseUrl:
      process.env.AUTOMATION_TONAPI_BASE_URL?.trim() || DEFAULT_TONAPI_BASE_URL,
    tonApiKey,
  };
}

async function getSignerContext(): Promise<AutomationSignerContext> {
  if (!signerContextPromise) {
    signerContextPromise = buildSignerContext();
  }

  return signerContextPromise;
}

export async function getAutomationWalletAddress(): Promise<string> {
  const context = await getSignerContext();
  return context.walletAddress;
}

function parseIntegerLike(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (/^-?0x[0-9a-f]+$/i.test(trimmed)) {
    return Number.parseInt(trimmed, 16);
  }

  if (/^-?\d+$/.test(trimmed)) {
    return Number.parseInt(trimmed, 10);
  }

  return null;
}

function readSeqnoFromMethodResult(payload: unknown): number | null {
  if (typeof payload !== "object" || payload === null) {
    return null;
  }

  const decoded = (payload as { decoded?: unknown }).decoded;
  if (typeof decoded === "object" && decoded !== null && "seqno" in decoded) {
    const parsed = parseIntegerLike((decoded as { seqno?: unknown }).seqno);
    if (parsed !== null && parsed >= 0) {
      return parsed;
    }
  }

  const stack = (payload as { stack?: unknown }).stack;
  if (Array.isArray(stack)) {
    for (const item of stack) {
      if (typeof item !== "object" || item === null) {
        continue;
      }

      const candidate = parseIntegerLike((item as { num?: unknown }).num);
      if (candidate !== null && candidate >= 0) {
        return candidate;
      }
    }
  }

  return null;
}

async function fetchAutomationWalletSeqno(
  tonApiBaseUrl: string,
  tonApiKey: string,
  walletAddress: string,
): Promise<number> {
  const endpoint = new URL(
    `/v2/blockchain/accounts/${encodeURIComponent(walletAddress)}/methods/seqno`,
    tonApiBaseUrl,
  ).toString();

  const response = await fetch(endpoint, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${tonApiKey}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });

  const payload = (await response.json()) as unknown;
  if (!response.ok) {
    throw new Error(
      `TonAPI seqno request failed (${response.status}).`,
    );
  }

  const seqno = readSeqnoFromMethodResult(payload);
  if (seqno === null) {
    throw new Error("TonAPI did not return a readable seqno for automation wallet.");
  }

  return seqno;
}

async function submitBlockchainMessage(
  tonApiBaseUrl: string,
  tonApiKey: string,
  externalMessageBoc: string,
): Promise<void> {
  const endpoint = new URL("/v2/blockchain/message", tonApiBaseUrl).toString();
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${tonApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      boc: externalMessageBoc,
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    const payload = (await response.json()) as unknown;
    const message = (
      typeof payload === "object"
      && payload !== null
      && "error" in payload
      && typeof (payload as { error?: unknown }).error === "string"
    )
      ? (payload as { error: string }).error
      : `TonAPI message submission failed (${response.status}).`;
    throw new Error(message);
  }
}

export async function sendAutomationTransfer(
  messages: AutomationTransferMessage[],
): Promise<{ walletAddress: string; seqno: number; sentMessages: number }> {
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new Error("At least one transfer message is required.");
  }

  const context = await getSignerContext();
  const seqno = await fetchAutomationWalletSeqno(
    context.tonApiBaseUrl,
    context.tonApiKey,
    context.walletAddress,
  );

  const transferMessages = messages.map((message) => {
    const body = parseCellFromEncoded(message.payload);
    const stateInitCell = parseCellFromEncoded(message.jettonWalletStateInit);

    return internal({
      to: message.targetAddress,
      value: BigInt(message.sendAmount),
      body,
      init: stateInitCell ? loadStateInit(stateInitCell.beginParse()) : undefined,
      });
  });

  const externalMessage = context.walletContract.createTransfer({
    seqno,
    secretKey: context.secretKey,
    sendMode: SendMode.PAY_GAS_SEPARATELY,
    messages: transferMessages,
  });
  const externalMessageBoc = externalMessage.toBoc().toString("base64");

  await submitBlockchainMessage(
    context.tonApiBaseUrl,
    context.tonApiKey,
    externalMessageBoc,
  );

  return {
    walletAddress: context.walletAddress,
    seqno,
    sentMessages: transferMessages.length,
  };
}

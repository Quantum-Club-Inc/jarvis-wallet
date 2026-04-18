"use client";

import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { AnimatePresence, motion } from "framer-motion";
import { Cell, internal, loadStateInit, SendMode } from "@ton/core";
import { TonClient, WalletContractV4 } from "@ton/ton";
import {
  ArrowLeftRight,
  ArrowRight,
  ChevronDown,
  House,
  MessageCircle,
  Mic,
  TrendingUp,
} from "lucide-react";

import { AssetOverview } from "@/components/AssetOverview";
import { ChatThread } from "@/components/ChatThread";
import { TelegramInit, useTelegram } from "@/components/TelegramInit";
import { VoiceOrb, type OrbState } from "@/components/VoiceOrb";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { useTTS } from "@/hooks/useTTS";
import { useVoice } from "@/hooks/useVoice";
import { cn } from "@/lib/utils";
import {
  generateWallet,
  loadWalletFromSecureStorage,
  restoreWalletFromMnemonic,
  storeWalletInSecureStorage,
} from "@/lib/ton/wallet-client";
import { KNOWN_TOKENS } from "@/lib/defi/tokens";

const QUICK_PROMPTS = [
  "Help me stake my TON safely",
  "Help me swap TON for another token",
  "Explain what I can do with Jarvis",
] as const;

const WELCOME_STORAGE_NAMESPACE = "jarvis_welcome_v1";
const APP_SHELL_CLASS =
  "relative mx-auto flex h-[var(--tg-viewport-height)] min-h-dvh w-full max-w-[480px] flex-col overflow-hidden px-[max(16px,calc(var(--tg-content-safe-area-inset-left)+16px))] pt-[calc(var(--tg-content-safe-area-inset-top)+36px)] pb-[max(14px,calc(var(--tg-content-safe-area-inset-bottom)+14px))] pr-[max(16px,calc(var(--tg-content-safe-area-inset-right)+16px))]";
const FLOATING_NAV_HEIGHT = 78;
const FLOATING_NAV_BOTTOM_OFFSET = 36;
const LOADER_MESSAGES = [
  "Preparing for an agentic future...",
  "Readying your wallet...",
  "Polishing experiences...",
  "Initializing intelligence...",
  "Waking Jarvis up...",
] as const;
const FIRST_TIME_INTRO_MESSAGES = [
  "Welcome. I'm Jarvis, your personal wallet assistant.",
  "Are you ready for the future?",
] as const;
const FIRST_TIME_INTRO_INTERVAL_MS = 3000;
const WALLET_STORAGE_TIMEOUT_MS = 5000;
const WELCOME_STORAGE_TIMEOUT_MS = 3000;
const TONCENTER_RPC_ENDPOINT = "https://toncenter.com/api/v2/jsonRPC";
const WALLET_PAGES = [
  { id: "home", label: "Home" },
  { id: "swap", label: "Swap" },
  { id: "stake", label: "Stake" },
] as const;
type WalletPage = (typeof WALLET_PAGES)[number]["id"];
type HomeMode = "overview" | "voice" | "chat";
interface WalletSummary {
  totalUsd: string | null;
  totalTon: string | null;
  assets: Array<{
    symbol: string;
    amount: string;
    valueUsd: string | null;
    imageUrl: string | null;
  }>;
}

interface SwapTokenOption {
  symbol: string;
  name: string;
  address: string;
  decimals: number;
  imageUrl: string | null;
}

interface SwapRouteChunk {
  id: string;
  protocol: string;
  offerAmount: string;
  askAmount: string;
}

interface SwapRouteStep {
  id: string;
  fromSymbol: string;
  toSymbol: string;
  chunks: SwapRouteChunk[];
}

interface SwapRoutePreview {
  id: string;
  steps: SwapRouteStep[];
}

interface SwapQuoteResponse {
  rfqId: string;
  quoteId: string;
  quotePayload: unknown;
  resolverName: string;
  offerToken: {
    symbol: string;
    decimals: number;
    address: string;
  };
  askToken: {
    symbol: string;
    decimals: number;
    address: string;
  };
  offerAmount: string;
  askAmount: string;
  rate: string;
  tradeStartDeadline: number;
  gasBudget: string;
  estimatedGasConsumption: string;
  routes: SwapRoutePreview[];
}

interface SwapExecuteMessage {
  targetAddress: string;
  sendAmount: string;
  payload: string;
  jettonWalletStateInit?: string;
}

interface SwapExecuteResponse {
  quoteId: string;
  messages: SwapExecuteMessage[];
}

interface StakeOverviewResponse {
  apy: string;
  tvlTon: string;
  tstonRate: string;
  minStake: string;
  stakersCount: string;
}

const FALLBACK_SWAP_TOKENS: SwapTokenOption[] = KNOWN_TOKENS.map((token) => ({
  symbol: token.symbol.toUpperCase(),
  name: token.name,
  address: token.address,
  decimals: token.decimals,
  imageUrl: null,
}));

function SwapTokenIcon({
  symbol,
  imageUrl,
  className,
}: {
  symbol: string;
  imageUrl: string | null;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const shortLabel = symbol.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 2) || "?";

  if (imageUrl && !failed) {
    return (
      <span className={cn("inline-flex items-center justify-center overflow-hidden rounded-full border border-white/15", className)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl}
          alt={`${symbol} icon`}
          className="size-full object-cover"
          loading="lazy"
          onError={() => setFailed(true)}
        />
      </span>
    );
  }

  return (
    <span className={cn("inline-flex items-center justify-center rounded-full border border-white/20 bg-zinc-800 text-[0.62rem] font-semibold text-zinc-200", className)}>
      {shortLabel}
    </span>
  );
}

function SwapTokenDropdown({
  label,
  value,
  tokens,
  onValueChange,
}: {
  label: string;
  value: string;
  tokens: SwapTokenOption[];
  onValueChange: (symbol: string) => void;
}) {
  const selectedToken = tokens.find((token) => token.symbol === value) ?? null;
  const [open, setOpen] = useState(false);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        render={(
          <Button
            type="button"
            variant="outline"
            className="h-11 w-full justify-between rounded-xl border-white/12 bg-zinc-900/80 px-3 text-sm text-zinc-100 hover:bg-zinc-900/90"
          />
        )}
      >
        <span className="flex min-w-0 items-center gap-2">
          <SwapTokenIcon
            symbol={selectedToken?.symbol ?? value}
            imageUrl={selectedToken?.imageUrl ?? null}
            className="size-5"
          />
          <span className="truncate">{selectedToken?.symbol ?? value}</span>
        </span>
        <ChevronDown className="size-4 text-zinc-400" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        sideOffset={6}
        className="max-h-72 min-w-[220px] bg-zinc-950 text-zinc-100"
      >
        <DropdownMenuGroup>
          <DropdownMenuLabel>{label} token</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={value}
            onValueChange={(nextSymbol) => {
              onValueChange(nextSymbol);
              setOpen(false);
            }}
          >
            {tokens.map((token) => (
              <DropdownMenuRadioItem key={`${label}-${token.symbol}`} value={token.symbol}>
                <SwapTokenIcon
                  symbol={token.symbol}
                  imageUrl={token.imageUrl}
                  className="size-5"
                />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-sm leading-none">{token.symbol}</span>
                  <span className="mt-1 truncate text-xs text-zinc-400">{token.name}</span>
                </span>
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function getWalletPageIcon(pageId: WalletPage) {
  if (pageId === "home") {
    return <House className="size-3.5" />;
  }
  if (pageId === "swap") {
    return <ArrowLeftRight className="size-3.5" />;
  }
  return <TrendingUp className="size-3.5" />;
}

function withTimeout<T>(
  task: Promise<T>,
  fallback: T,
  timeoutMs: number,
  timeoutMessage: string,
): Promise<T> {
  return new Promise((resolve) => {
    let settled = false;

    const timeoutId = window.setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      console.warn(timeoutMessage);
      resolve(fallback);
    }, timeoutMs);

    task
      .then((result) => {
        if (settled) {
          return;
        }
        settled = true;
        window.clearTimeout(timeoutId);
        resolve(result);
      })
      .catch(() => {
        if (settled) {
          return;
        }
        settled = true;
        window.clearTimeout(timeoutId);
        resolve(fallback);
      });
  });
}

function parseCellFromHex(rawHex?: string): Cell | undefined {
  const hex = rawHex?.trim();
  if (!hex) {
    return undefined;
  }

  return Cell.fromHex(hex);
}

function InitialLoader() {
  const [messageIndex, setMessageIndex] = useState(0);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setMessageIndex((current) => (current + 1) % LOADER_MESSAGES.length);
    }, 1800);

    return () => window.clearInterval(intervalId);
  }, []);

  return (
    <div className="relative z-10 flex w-full max-w-[480px] flex-col items-center justify-center gap-6 px-6 text-center">
      <div className="size-11 animate-spin rounded-full border-2 border-zinc-700 border-t-zinc-100" />
      <div className="min-h-7">
        <AnimatePresence mode="wait">
          <motion.p
            key={LOADER_MESSAGES[messageIndex]}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.45, ease: "easeInOut" }}
            className="m-0 text-[0.95rem] leading-[1.6] text-zinc-300"
          >
            {LOADER_MESSAGES[messageIndex]}
          </motion.p>
        </AnimatePresence>
      </div>
    </div>
  );
}

function FirstTimeIntro({ message }: { message: string }) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center px-[max(24px,calc(var(--tg-content-safe-area-inset-left)+24px))] pt-[max(24px,calc(var(--tg-content-safe-area-inset-top)+24px))] pb-[max(24px,calc(var(--tg-content-safe-area-inset-bottom)+24px))] pr-[max(24px,calc(var(--tg-content-safe-area-inset-right)+24px))]">
      <div className="w-full max-w-[520px] text-center">
        <AnimatePresence mode="wait">
          <motion.p
            key={message}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.45, ease: "easeInOut" }}
            className="m-0 text-[1.1rem] leading-[1.6] text-zinc-100"
          >
            {message}
          </motion.p>
        </AnimatePresence>
      </div>
    </div>
  );
}

function WalletNavbar({
  currentPage,
  onChange,
}: {
  currentPage: WalletPage;
  onChange: (nextPage: WalletPage) => void;
}) {
  return (
    <nav
      className="fixed left-1/2 z-30 grid w-[min(440px,calc(100%-24px))] -translate-x-1/2 grid-cols-3 gap-2 rounded-[18px] border border-white/10 bg-zinc-950/88 p-1.5 shadow-[0_18px_48px_rgba(0,0,0,0.45)] backdrop-blur-xl"
      style={{
        bottom: `calc(var(--tg-content-safe-area-inset-bottom) + ${FLOATING_NAV_BOTTOM_OFFSET}px)`,
      }}
    >
      {WALLET_PAGES.map((page) => {
        const isActive = currentPage === page.id;
        return (
          <Button
            key={page.id}
            variant="ghost"
            size="sm"
            className={cn(
              "rounded-[12px] text-[0.73rem] font-semibold tracking-[0.12em]",
              "inline-flex items-center gap-1.5",
              isActive
                ? "bg-white text-zinc-900 hover:bg-zinc-100 hover:text-zinc-900 !hover:text-zinc-900"
                : "text-zinc-300 hover:bg-zinc-900/80 hover:text-zinc-100",
            )}
            onClick={() => onChange(page.id)}
            aria-current={isActive ? "page" : undefined}
          >
            {getWalletPageIcon(page.id)}
            {page.label}
          </Button>
        );
      })}
    </nav>
  );
}

function getWelcomeStorageKey(userId?: number) {
  const raw = `${WELCOME_STORAGE_NAMESPACE}_${userId ?? "guest"}`;
  const normalized = raw.replace(/[^a-zA-Z0-9_]/g, "_").slice(0, 128);
  return normalized || WELCOME_STORAGE_NAMESPACE;
}

function readLocalWelcomeState(key: string) {
  try {
    return window.localStorage.getItem(key) === "seen";
  } catch {
    return false;
  }
}

function writeLocalWelcomeState(key: string) {
  try {
    window.localStorage.setItem(key, "seen");
  } catch {
    // Ignore local storage restrictions in privacy modes.
  }
}

function readCloudWelcomeState(tg: TelegramWebApp, key: string) {
  return new Promise<string | null>((resolve) => {
    try {
      if (!tg.CloudStorage) {
        resolve(null);
        return;
      }
      tg.CloudStorage.getItem(key, (error, value) => {
        if (error) {
          console.error("[Welcome] Failed to read Telegram CloudStorage:", error);
          resolve(null);
          return;
        }

        resolve(value ?? null);
      });
    } catch (error) {
      console.error("[Welcome] Telegram CloudStorage read threw:", error);
      resolve(null);
    }
  });
}

function writeCloudWelcomeState(tg: TelegramWebApp, key: string) {
  return new Promise<void>((resolve) => {
    try {
      if (!tg.CloudStorage) {
        resolve();
        return;
      }
      tg.CloudStorage.setItem(key, "seen", (error) => {
        if (error) {
          console.error("[Welcome] Failed to write Telegram CloudStorage:", error);
        }

        resolve();
      });
    } catch (error) {
      console.error("[Welcome] Telegram CloudStorage write threw:", error);
      resolve();
    }
  });
}

function JarvisApp() {
  const { isReady, user, authError } = useTelegram();
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [walletBalance, setWalletBalance] = useState<string | null>(null);
  const [walletSummary, setWalletSummary] = useState<WalletSummary | null>(null);
  const [walletPage, setWalletPage] = useState<WalletPage>("home");
  const [homeMode, setHomeMode] = useState<HomeMode>("overview");
  const [orbState, setOrbState] = useState<OrbState>("idle");
  const [textInput, setTextInput] = useState("");
  const [swapTokens, setSwapTokens] = useState<SwapTokenOption[]>(FALLBACK_SWAP_TOKENS);
  const [swapTokensLoading, setSwapTokensLoading] = useState(true);
  const [swapFromSymbol, setSwapFromSymbol] = useState("TON");
  const [swapToSymbol, setSwapToSymbol] = useState("USDT");
  const [swapAmount, setSwapAmount] = useState("1");
  const [swapQuote, setSwapQuote] = useState<SwapQuoteResponse | null>(null);
  const [swapLoading, setSwapLoading] = useState(false);
  const [swapError, setSwapError] = useState<string | null>(null);
  const [swapExecuting, setSwapExecuting] = useState(false);
  const [swapSuccess, setSwapSuccess] = useState<string | null>(null);
  const swapQuoteAbortRef = useRef<AbortController | null>(null);
  const swapQuoteCacheRef = useRef<Map<string, SwapQuoteResponse>>(new Map());
  const [stakeOverview, setStakeOverview] = useState<StakeOverviewResponse | null>(null);
  const [stakeLoading, setStakeLoading] = useState(false);
  const [stakeError, setStakeError] = useState<string | null>(null);
  const [stakeAmountInput, setStakeAmountInput] = useState("10");
  const [walletLoading, setWalletLoading] = useState(true);
  const [welcomeMode, setWelcomeMode] = useState<"first" | "returning">("first");
  const [welcomeReady, setWelcomeReady] = useState(false);
  const [newMnemonic, setNewMnemonic] = useState<string[] | null>(null);
  const [introMessageIndex, setIntroMessageIndex] = useState(0);
  const [isFirstTimeIntroDone, setIsFirstTimeIntroDone] = useState(false);

  const {
    transcript,
    isListening,
    resetTranscript,
    startListening,
    stopListening,
    error: voiceError,
  } = useVoice();
  const { speak, stop: stopSpeaking, isSpeaking, words: spokenWords, currentWordIndex } = useTTS();

  useEffect(() => {
    if (!isReady) {
      return;
    }

    let active = true;

    async function syncWalletToFirestore(address: string) {
      try {
        await fetch("/api/wallet/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ walletAddress: address }),
        });
      } catch (err) {
        console.warn("[Wallet] Failed to sync address to Firestore:", err);
      }
    }

    async function initWallet() {
      try {
        const storedWallet = await withTimeout(
          loadWalletFromSecureStorage(),
          null,
          WALLET_STORAGE_TIMEOUT_MS,
          "[Wallet] Storage read timed out, continuing with wallet setup.",
        );
        if (!active) {
          return;
        }

        if (storedWallet) {
          setWalletAddress(storedWallet.address);
          void syncWalletToFirestore(storedWallet.address);
          return;
        }

        const wallet = await generateWallet();
        if (!active) {
          return;
        }

        setNewMnemonic(wallet.mnemonic);

        const stored = await withTimeout(
          storeWalletInSecureStorage(wallet.mnemonic, wallet.address),
          false,
          WALLET_STORAGE_TIMEOUT_MS,
          "[Wallet] Storage write timed out, continuing with generated wallet.",
        );

        if (!active) {
          return;
        }

        if (!stored) {
          console.error("[Wallet] Failed to store wallet in Telegram SecureStorage");
        }

        setWalletAddress(wallet.address);
        void syncWalletToFirestore(wallet.address);
      } catch (error) {
        console.error("[Wallet] Init error:", error);
      } finally {
        if (active) {
          setWalletLoading(false);
        }
      }
    }

    void initWallet();

    return () => {
      active = false;
    };
  }, [isReady]);

  useEffect(() => {
    if (!walletAddress) {
      return;
    }

    let active = true;

    void (async () => {
      try {
        const response = await fetch(
          `/api/wallet/summary?address=${encodeURIComponent(walletAddress)}`,
        );
        if (!response.ok) {
          throw new Error("Failed to load wallet summary.");
        }

        const summary = (await response.json()) as WalletSummary;
        if (!active) {
          return;
        }

        setWalletBalance(summary.totalTon ?? null);
        setWalletSummary(summary);
      } catch (error) {
        if (!active) {
          return;
        }
        console.error("[Wallet] Failed to load wallet summary:", error);
        setWalletBalance(null);
        setWalletSummary({
          totalUsd: null,
          totalTon: null,
          assets: [],
        });
      }
    })();

    return () => {
      active = false;
    };
  }, [walletAddress]);

  useEffect(() => {
    let active = true;

    void (async () => {
      try {
        const response = await fetch("/api/swap/tokens");
        if (!response.ok) {
          throw new Error("Failed to load swap token list.");
        }
        const payload = (await response.json()) as unknown;
        const tokenList = (
          typeof payload === "object"
          && payload !== null
          && "tokens" in payload
          && Array.isArray((payload as { tokens?: unknown }).tokens)
        )
          ? (payload as { tokens: SwapTokenOption[] }).tokens
          : [];

        if (!active || tokenList.length === 0) {
          return;
        }

        const uniqueBySymbol = tokenList.reduce<SwapTokenOption[]>((acc, token) => {
          if (!token?.symbol || !token?.address || !Number.isFinite(token.decimals)) {
            return acc;
          }

          if (!acc.some((item) => item.symbol === token.symbol)) {
            acc.push({
              symbol: token.symbol.toUpperCase(),
              name: token.name,
              address: token.address,
              decimals: token.decimals,
              imageUrl: token.imageUrl,
            });
          }

          return acc;
        }, []);

        if (uniqueBySymbol.length === 0) {
          return;
        }

        setSwapTokens(uniqueBySymbol);

        setSwapFromSymbol((current) => (
          uniqueBySymbol.some((token) => token.symbol === current)
            ? current
            : uniqueBySymbol[0].symbol
        ));
        setSwapToSymbol((current) => (
          uniqueBySymbol.some((token) => token.symbol === current)
            ? current
            : uniqueBySymbol.find((token) => token.symbol !== uniqueBySymbol[0].symbol)?.symbol
              ?? uniqueBySymbol[0].symbol
        ));
      } catch (error) {
        console.error("[Swap] Failed to load token symbols:", error);
      } finally {
        if (active) {
          setSwapTokensLoading(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    return () => {
      swapQuoteAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (walletPage !== "stake") {
      return;
    }

    let active = true;

    void (async () => {
      try {
        const response = await fetch("/api/stake/overview", { cache: "no-store" });
        if (!response.ok) {
          throw new Error("Failed to load staking overview.");
        }

        const payload = (await response.json()) as unknown;
        if (
          !active
          || typeof payload !== "object"
          || payload === null
          || !("apy" in payload)
        ) {
          return;
        }

        setStakeOverview(payload as StakeOverviewResponse);
      } catch (error) {
        if (!active) {
          return;
        }
        setStakeError(
          error instanceof Error ? error.message : "Could not load staking overview.",
        );
      } finally {
        if (active) {
          setStakeLoading(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [walletPage]);

  useEffect(() => {
    if (!isReady) {
      return;
    }

    let active = true;
    const key = getWelcomeStorageKey(user?.id);
    const tg = window.Telegram?.WebApp;

    async function resolveWelcomeState() {
      let seen = readLocalWelcomeState(key);

      if (!seen && tg && user?.id) {
        const cloudValue = await withTimeout(
          readCloudWelcomeState(tg, key),
          null,
          WELCOME_STORAGE_TIMEOUT_MS,
          "[Welcome] CloudStorage read timed out, falling back to local welcome state.",
        );
        seen = cloudValue === "seen";
      }

      if (!active) {
        return;
      }

      setWelcomeMode(seen ? "returning" : "first");
      setWelcomeReady(true);

      if (!seen) {
        writeLocalWelcomeState(key);
        if (tg && user?.id) {
          void writeCloudWelcomeState(tg, key);
        }
      }
    }

    void resolveWelcomeState();

    return () => {
      active = false;
    };
  }, [isReady, user?.id]);

  useEffect(() => {
    if (!isReady || walletLoading || !welcomeReady) {
      return;
    }

    if (welcomeMode !== "first") {
      return;
    }

    let active = true;

    const nextMessageTimer = window.setTimeout(() => {
      if (!active) {
        return;
      }
      setIntroMessageIndex(1);
    }, FIRST_TIME_INTRO_INTERVAL_MS);

    const finishIntroTimer = window.setTimeout(() => {
      if (!active) {
        return;
      }
      setIsFirstTimeIntroDone(true);
    }, FIRST_TIME_INTRO_INTERVAL_MS * 2);

    return () => {
      active = false;
      window.clearTimeout(nextMessageTimer);
      window.clearTimeout(finishIntroTimer);
    };
  }, [isReady, walletLoading, welcomeMode, welcomeReady]);

  const { messages, sendMessage, status, error: chatError } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/chat",
      body: { walletAddress, isFirstTime: welcomeMode === "first", newMnemonic: newMnemonic?.join(" ") },
    }),
    onFinish: ({ message }: { message: UIMessage }) => {
      if (message.role !== "assistant") {
        return;
      }

      const textPart = message.parts.find((part) => part.type === "text" && part.text);
      if (textPart?.type === "text" && textPart.text) {
        speak(textPart.text);
      }
    },
    onError: () => {
      setOrbState("error");
      setTimeout(() => setOrbState("idle"), 2000);
    },
  });

  const isLoading = status === "submitted" || status === "streaming";
  const firstName = user?.first_name?.trim() || "there";
  const inlineNotice = walletPage !== "home"
    ? null
    : homeMode === "voice"
      ? voiceError ?? chatError?.message ?? authError
      : homeMode === "chat"
        ? chatError?.message ?? authError
        : authError;
  const displayOrbState: OrbState = isLoading
    ? "processing"
    : isSpeaking
      ? "speaking"
      : orbState === "processing" || orbState === "speaking"
        ? "idle"
        : orbState;
  const reserveBottomSpace = !(walletPage === "home" && homeMode === "chat");
  const activeSwapTokens = swapTokens.length > 0 ? swapTokens : FALLBACK_SWAP_TOKENS;
  const selectedSwapFrom = activeSwapTokens.find((token) => token.symbol === swapFromSymbol) ?? null;
  const selectedSwapTo = activeSwapTokens.find((token) => token.symbol === swapToSymbol) ?? null;
  const numericStakeAmount = Number(stakeAmountInput);
  const stakeAmountIsValid = Number.isFinite(numericStakeAmount) && numericStakeAmount > 0;
  const numericStakeApy = stakeOverview?.apy ? Number.parseFloat(stakeOverview.apy) : 0;
  const estimatedYearlyRewards = stakeAmountIsValid && Number.isFinite(numericStakeApy)
    ? (numericStakeAmount * numericStakeApy) / 100
    : 0;
  const estimatedTsTon = stakeAmountIsValid ? numericStakeAmount : 0;

  useEffect(() => {
    if (!isListening && transcript.trim()) {
      sendMessage({ text: transcript });
      resetTranscript();
    }
  }, [isListening, resetTranscript, sendMessage, transcript]);

  useEffect(() => {
    if (isListening || orbState !== "listening" || Boolean(transcript)) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setOrbState("idle");
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [isListening, orbState, transcript]);

  useEffect(() => {
    if (!voiceError) {
      return;
    }

    const enterErrorTimeoutId = window.setTimeout(() => {
      setOrbState("error");
    }, 0);
    const timeoutId = window.setTimeout(() => {
      setOrbState("idle");
    }, 1800);

    return () => {
      window.clearTimeout(enterErrorTimeoutId);
      window.clearTimeout(timeoutId);
    };
  }, [voiceError]);

  const handleOrbPress = useCallback(() => {
    if (isListening || orbState === "listening") {
      stopListening();
      setOrbState("idle");
      return;
    }

    if (isSpeaking) {
      stopSpeaking();
      setOrbState("idle");
      return;
    }

    if (isLoading) {
      return;
    }

    stopSpeaking();
    startListening();
    setOrbState("listening");
  }, [isListening, isLoading, isSpeaking, orbState, startListening, stopListening, stopSpeaking]);

  const handleQuickPrompt = useCallback(
    (prompt: string) => {
      if (isLoading) {
        return;
      }

      stopSpeaking();
      resetTranscript();
      setHomeMode("chat");
      sendMessage({ text: prompt });
    },
    [isLoading, resetTranscript, sendMessage, stopSpeaking],
  );

  const handleWalletPageChange = useCallback((nextPage: WalletPage) => {
    setWalletPage(nextPage);
    if (nextPage === "stake") {
      setStakeLoading(true);
      setStakeError(null);
    }
    if (nextPage !== "home") {
      setHomeMode("overview");
      stopListening();
      stopSpeaking();
      setOrbState("idle");
    }
  }, [stopListening, stopSpeaking]);

  const openVoiceMode = useCallback(() => {
    stopListening();
    stopSpeaking();
    setOrbState("idle");
    setHomeMode("voice");
  }, [stopListening, stopSpeaking]);

  const openChatMode = useCallback(() => {
    stopListening();
    stopSpeaking();
    setOrbState("idle");
    setHomeMode("chat");
  }, [stopListening, stopSpeaking]);

  const backToHomeOverview = useCallback(() => {
    stopListening();
    stopSpeaking();
    setOrbState("idle");
    setHomeMode("overview");
  }, [stopListening, stopSpeaking]);

  const handleNativeBack = useCallback(() => {
    if (walletPage !== "home") {
      handleWalletPageChange("home");
      return;
    }

    if (homeMode !== "overview") {
      backToHomeOverview();
    }
  }, [backToHomeOverview, handleWalletPageChange, homeMode, walletPage]);

  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    const backButton = tg?.BackButton;
    if (!backButton) {
      return;
    }

    const shouldShow = walletPage !== "home" || homeMode !== "overview";
    if (!shouldShow) {
      backButton.hide();
      return;
    }

    backButton.show();
    backButton.onClick(handleNativeBack);
    return () => {
      backButton.offClick(handleNativeBack);
    };
  }, [handleNativeBack, homeMode, walletPage]);

  const handleTextSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!textInput.trim() || isLoading) {
        return;
      }

      sendMessage({ text: textInput });
      setTextInput("");
    },
    [isLoading, sendMessage, textInput],
  );

  const handleSwapQuote = useCallback(async () => {
    if (!selectedSwapFrom || !selectedSwapTo) {
      setSwapError("Swap tokens are still loading. Please try again.");
      return;
    }

    if (!swapAmount.trim()) {
      setSwapError("Enter an amount to quote.");
      return;
    }

    if (selectedSwapFrom.symbol === selectedSwapTo.symbol) {
      setSwapError("Select two different tokens.");
      return;
    }

    const normalizedAmount = swapAmount.trim();
    const quoteRequestKey = [
      selectedSwapFrom.symbol,
      selectedSwapTo.symbol,
      normalizedAmount,
    ].join(":");
    const cachedQuote = swapQuoteCacheRef.current.get(quoteRequestKey);
    if (cachedQuote) {
      setSwapError(null);
      setSwapQuote(cachedQuote);
      return;
    }

    swapQuoteAbortRef.current?.abort();
    const controller = new AbortController();
    swapQuoteAbortRef.current = controller;

    setSwapLoading(true);
    setSwapError(null);
    setSwapSuccess(null);
    setSwapQuote(null);

    try {
      const response = await fetch("/api/swap/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          offerTokenSymbol: selectedSwapFrom.symbol,
          askTokenSymbol: selectedSwapTo.symbol,
          offerAmount: normalizedAmount,
        }),
      });

      const payload = (await response.json()) as unknown;
      if (!response.ok) {
        const message = (
          typeof payload === "object"
          && payload !== null
          && "error" in payload
          && typeof (payload as { error?: unknown }).error === "string"
        )
          ? (payload as { error: string }).error
          : "Failed to fetch a quote.";
        throw new Error(message);
      }

      const quote = payload as SwapQuoteResponse;
      swapQuoteCacheRef.current.set(quoteRequestKey, quote);
      if (swapQuoteCacheRef.current.size > 16) {
        const oldestKey = swapQuoteCacheRef.current.keys().next().value;
        if (oldestKey) {
          swapQuoteCacheRef.current.delete(oldestKey);
        }
      }
      setSwapQuote(quote);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }
      setSwapError(
        error instanceof Error ? error.message : "Failed to fetch swap quote.",
      );
    } finally {
      if (swapQuoteAbortRef.current === controller) {
        swapQuoteAbortRef.current = null;
        setSwapLoading(false);
      }
    }
  }, [selectedSwapFrom, selectedSwapTo, swapAmount]);

  const handleSwapExecution = useCallback(async () => {
    if (!walletAddress) {
      setSwapError("Wallet is not ready yet.");
      return;
    }

    if (!swapQuote) {
      setSwapError("Get a quote before swapping.");
      return;
    }

    setSwapExecuting(true);
    setSwapError(null);
    setSwapSuccess(null);

    try {
      const storedWallet = await loadWalletFromSecureStorage();
      if (!storedWallet?.mnemonic || storedWallet.mnemonic.length === 0) {
        throw new Error("Wallet credentials are unavailable on this device.");
      }

      const restoredWallet = await restoreWalletFromMnemonic(storedWallet.mnemonic);
      if (restoredWallet.address !== walletAddress) {
        throw new Error("Wallet key mismatch. Re-open the app and try again.");
      }

      const executionResponse = await fetch("/api/swap/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quoteId: swapQuote.quoteId,
          quotePayload: swapQuote.quotePayload,
          walletAddress,
        }),
      });

      const executionPayload = (await executionResponse.json()) as unknown;
      if (!executionResponse.ok) {
        const message = (
          typeof executionPayload === "object"
          && executionPayload !== null
          && "error" in executionPayload
          && typeof (executionPayload as { error?: unknown }).error === "string"
        )
          ? (executionPayload as { error: string }).error
          : "Failed to prepare swap execution.";
        throw new Error(message);
      }

      const execution = executionPayload as SwapExecuteResponse;
      if (!Array.isArray(execution.messages) || execution.messages.length === 0) {
        throw new Error("No execution messages were returned.");
      }

      const tonClient = new TonClient({
        endpoint: TONCENTER_RPC_ENDPOINT,
      });
      const wallet = WalletContractV4.create({
        workchain: 0,
        publicKey: restoredWallet.keyPair.publicKey,
      });
      const openedWallet = tonClient.open(wallet);
      const seqno = await openedWallet.getSeqno();

      const transferMessages = execution.messages.map((message) => {
        const body = parseCellFromHex(message.payload);
        const stateInitCell = parseCellFromHex(message.jettonWalletStateInit);

        return internal({
          to: message.targetAddress,
          value: BigInt(message.sendAmount),
          body,
          init: stateInitCell ? loadStateInit(stateInitCell.beginParse()) : undefined,
        });
      });

      await openedWallet.sendTransfer({
        seqno,
        secretKey: restoredWallet.keyPair.secretKey,
        sendMode: SendMode.PAY_GAS_SEPARATELY,
        messages: transferMessages,
      });

      setSwapSuccess("Swap submitted on-chain. Track your balance for settlement.");
    } catch (error) {
      setSwapError(
        error instanceof Error ? error.message : "Failed to submit swap transaction.",
      );
    } finally {
      setSwapExecuting(false);
    }
  }, [swapQuote, walletAddress]);

  const flipSwapPair = useCallback(() => {
    setSwapFromSymbol((currentFrom) => {
      setSwapToSymbol(currentFrom);
      return swapToSymbol;
    });
    setSwapQuote(null);
    setSwapError(null);
    setSwapSuccess(null);
  }, [swapToSymbol]);

  if (!isReady || walletLoading || !welcomeReady) {
    return (
      <div className={cn(APP_SHELL_CLASS, "items-center justify-center")}>
        <InitialLoader />
      </div>
    );
  }

  if (welcomeMode === "first" && !isFirstTimeIntroDone) {
    const introMessage =
      FIRST_TIME_INTRO_MESSAGES[
        Math.min(introMessageIndex, FIRST_TIME_INTRO_MESSAGES.length - 1)
      ];

    return (
      <div className={cn(APP_SHELL_CLASS, "items-center justify-center")}>
        <FirstTimeIntro message={introMessage} />
      </div>
    );
  }

  return (
    <div className={cn(APP_SHELL_CLASS, "gap-3")}>
      {walletPage === "home" && homeMode === "overview" && (
        <p className="relative z-10 m-0 text-[clamp(1.2rem,5vw,1.8rem)] leading-[1.2] font-semibold tracking-[-0.02em] text-zinc-100">
          Welcome back, {firstName}. What would you want me to do today?
        </p>
      )}
      {walletPage === "home" && homeMode === "overview" && (
        <div className="relative z-10 -mt-1 flex flex-wrap gap-2">
          {QUICK_PROMPTS.map((prompt) => (
            <Button
              key={prompt}
              variant="outline"
              size="sm"
              type="button"
              className="h-9 rounded-full border-white/10 bg-zinc-950/78 px-3 text-[0.74rem] leading-none text-zinc-300 hover:border-white/20 hover:bg-zinc-900/80 hover:text-zinc-100"
              disabled={isLoading}
              onClick={() => handleQuickPrompt(prompt)}
            >
              {prompt}
            </Button>
          ))}
        </div>
      )}

      {walletPage === "home" && homeMode === "overview" && (
        <>
          <AssetOverview
            address={walletAddress}
            totalUsd={walletSummary?.totalUsd ?? null}
            totalTon={walletSummary?.totalTon ?? walletBalance}
            assets={walletSummary?.assets ?? []}
            isLoading={Boolean(walletAddress) && walletSummary === null}
          />

          {inlineNotice && (
            <div className="relative z-10 rounded-[14px] border border-white/10 bg-zinc-950/85 px-3 py-2.5 text-[0.8rem] leading-[1.4] text-zinc-300">
              {inlineNotice}
            </div>
          )}
        </>
      )}

      {walletPage === "home" && homeMode === "overview" && (
        <div className="relative z-10 mt-1 grid grid-cols-2 gap-2.5">
          <Button
            type="button"
            variant="outline"
            className="h-12 rounded-xl border-white/10 bg-zinc-950/84 text-zinc-200 hover:border-white/20 hover:bg-zinc-900/80 hover:text-zinc-50"
            onClick={openVoiceMode}
          >
            <Mic className="mr-2 size-4" />
            Voice
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-12 rounded-xl border-white/10 bg-zinc-950/84 text-zinc-200 hover:border-white/20 hover:bg-zinc-900/80 hover:text-zinc-50"
            onClick={openChatMode}
          >
            <MessageCircle className="mr-2 size-4" />
            Chat
          </Button>
        </div>
      )}

      {walletPage === "home" ? (
        homeMode === "voice" ? (
          <section className="relative z-10 flex min-h-0 flex-1 flex-col gap-3">
            {inlineNotice && (
              <div className="rounded-[14px] border border-white/10 bg-zinc-950/85 px-3 py-2.5 text-[0.8rem] leading-[1.4] text-zinc-300">
                {inlineNotice}
              </div>
            )}

            {welcomeMode === "first" && newMnemonic && (
              <div className="rounded-[18px] border border-white/10 bg-zinc-950/82 p-3 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-1000 fill-mode-both">
                <p className="mb-2 text-[0.8rem] leading-[1.45] text-zinc-300">
                  Your wallet was created. Say each recovery word back to verify it.
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {newMnemonic.map((word) => (
                    <Badge
                      key={word}
                      variant="secondary"
                      className="border border-white/15 bg-white/5 font-mono text-[0.72rem] text-zinc-200"
                    >
                      {word}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-3 flex min-h-0 flex-1 items-center justify-center">
              <VoiceOrb
                state={displayOrbState}
                onPress={handleOrbPress}
                transcript={transcript}
                spokenWords={spokenWords}
                currentWordIndex={currentWordIndex}
              />
            </div>
          </section>
        ) : homeMode === "chat" ? (
          <section className="relative z-10 flex min-h-0 flex-1 flex-col gap-3">
            {inlineNotice && (
              <div className="rounded-[14px] border border-white/10 bg-zinc-950/85 px-3 py-2.5 text-[0.8rem] leading-[1.4] text-zinc-300">
                {inlineNotice}
              </div>
            )}

            <ChatThread messages={messages} isLoading={isLoading} />

            <form
              className="relative z-10 mt-1 flex items-center gap-2.5 rounded-[22px] border border-white/10 bg-zinc-950/88 p-3 backdrop-blur-xl"
              style={{
                marginBottom: `calc(var(--tg-content-safe-area-inset-bottom) + ${
                  FLOATING_NAV_HEIGHT + FLOATING_NAV_BOTTOM_OFFSET + 8
                }px)`,
              }}
              onSubmit={handleTextSubmit}
            >
              <input
                className="h-11 flex-1 rounded-2xl border-0 bg-white/5 px-3.5 text-foreground outline-none placeholder:text-zinc-500"
                type="text"
                placeholder="Ask Jarvis anything about your wallet..."
                value={textInput}
                onChange={(event) => setTextInput(event.target.value)}
              />
              <Button
                size="icon"
                className="size-[42px] rounded-full border-0 bg-zinc-200 text-zinc-900 shadow-[0_12px_30px_rgba(255,255,255,0.12)] transition-transform duration-200 active:scale-95 disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none"
                type="submit"
                disabled={!textInput.trim() || isLoading}
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                </svg>
              </Button>
            </form>
          </section>
        ) : null
      ) : walletPage === "swap" ? (
        <section className="relative z-10 flex min-h-0 flex-1 flex-col">
          <div>
            <p className="text-[0.72rem] font-medium tracking-[0.14em] text-cyan-200/75">Swap</p>
            <h2 className="mt-1 text-[1.28rem] leading-tight font-semibold text-zinc-100">
              STON.fi Omniston quotes
            </h2>
            <p className="mt-2 text-sm leading-[1.55] text-zinc-300">
              Select a token pair, request a live quote, then review the route before execution.
            </p>
            <p className="mt-1 text-xs text-cyan-200/70">Powered by STON.fi</p>
          </div>

          <div className="mt-4 grid gap-3">
            <div className="grid grid-cols-2 gap-2.5">
              <label className="flex flex-col gap-1.5">
                <span className="text-[0.7rem] tracking-[0.08em] text-zinc-400">From</span>
                {swapTokensLoading ? (
                  <Skeleton className="h-11 rounded-xl bg-zinc-900/70" />
                ) : (
                  <SwapTokenDropdown
                    label="From"
                    value={swapFromSymbol}
                    tokens={activeSwapTokens}
                    onValueChange={(symbol) => {
                      setSwapFromSymbol(symbol);
                      setSwapQuote(null);
                      setSwapError(null);
                      setSwapSuccess(null);
                    }}
                  />
                )}
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[0.7rem] tracking-[0.08em] text-zinc-400">To</span>
                {swapTokensLoading ? (
                  <Skeleton className="h-11 rounded-xl bg-zinc-900/70" />
                ) : (
                  <SwapTokenDropdown
                    label="To"
                    value={swapToSymbol}
                    tokens={activeSwapTokens}
                    onValueChange={(symbol) => {
                      setSwapToSymbol(symbol);
                      setSwapQuote(null);
                      setSwapError(null);
                      setSwapSuccess(null);
                    }}
                  />
                )}
              </label>
            </div>

            <label className="flex flex-col gap-1.5">
              <span className="text-[0.7rem] tracking-[0.08em] text-zinc-400">
                Amount ({selectedSwapFrom?.symbol ?? swapFromSymbol})
              </span>
              <Input
                className="h-11 rounded-xl border-white/12 bg-zinc-900/80 px-3 text-sm text-zinc-100 placeholder:text-zinc-500 focus-visible:border-cyan-200/40 focus-visible:ring-cyan-300/20"
                type="text"
                inputMode="decimal"
                placeholder="1.0"
                value={swapAmount}
                onChange={(event) => {
                  setSwapAmount(event.target.value);
                  setSwapQuote(null);
                  setSwapError(null);
                  setSwapSuccess(null);
                }}
              />
            </label>

            <div className="grid grid-cols-[1fr_auto] gap-2.5">
              <Button
                type="button"
                className="h-11 rounded-xl bg-white text-zinc-900 hover:bg-zinc-100"
                disabled={swapLoading || !selectedSwapFrom || !selectedSwapTo}
                onClick={handleSwapQuote}
              >
                {swapLoading ? "Fetching quote..." : "Get quote"}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-11 rounded-xl border-white/12 bg-zinc-900/80 px-3 text-zinc-100 hover:bg-zinc-800/80"
                onClick={flipSwapPair}
              >
                <ArrowLeftRight className="size-4" />
                <span className="sr-only">Flip pair</span>
              </Button>
            </div>
          </div>

          <Separator className="my-4 bg-white/10" />

          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
            {swapError && (
              <div className="rounded-xl border border-rose-300/30 bg-rose-900/20 px-3 py-2 text-sm text-rose-200">
                {swapError}
              </div>
            )}

            {swapQuote ? (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2 rounded-xl border border-white/10 bg-zinc-900/70 p-3 text-sm">
                  <div>
                    <p className="text-zinc-400">You pay</p>
                    <p className="font-medium text-zinc-100">
                      {swapQuote.offerAmount} {swapQuote.offerToken.symbol}
                    </p>
                  </div>
                  <div>
                    <p className="text-zinc-400">You receive</p>
                    <p className="font-medium text-zinc-100">
                      {swapQuote.askAmount} {swapQuote.askToken.symbol}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs text-zinc-400">
                  <p>
                    Rate: 1 {swapQuote.offerToken.symbol} = {swapQuote.rate}{" "}
                    {swapQuote.askToken.symbol}
                  </p>
                  <p className="text-right">Resolver: {swapQuote.resolverName}</p>
                </div>

                <div className="rounded-xl border border-white/10 bg-zinc-950/55 px-3 py-2 text-xs text-zinc-300">
                  Quote expires at:{" "}
                  {new Date(swapQuote.tradeStartDeadline * 1000).toLocaleTimeString()}
                </div>

                {swapQuote.routes.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-xs text-zinc-400">Route preview</p>
                    {swapQuote.routes[0].steps.map((step) => (
                      <div
                        key={step.id}
                        className="rounded-lg border border-white/10 bg-zinc-950/55 px-2.5 py-2 text-xs text-zinc-300"
                      >
                        <p className="flex items-center gap-1.5 font-medium text-zinc-100">
                          <span>{step.fromSymbol}</span>
                          <ArrowRight className="size-3.5 text-zinc-400" />
                          <span>{step.toSymbol}</span>
                        </p>
                        {step.chunks.map((chunk) => (
                          <p key={chunk.id} className="mt-0.5 flex items-center gap-1 text-zinc-400">
                            <span>{chunk.protocol}:</span>
                            <span>{chunk.offerAmount}</span>
                            <ArrowRight className="size-3 text-zinc-500" />
                            <span>{chunk.askAmount}</span>
                          </p>
                        ))}
                      </div>
                    ))}
                  </div>
                )}

                <Button
                  type="button"
                  className="h-11 w-full rounded-xl bg-white text-zinc-900 hover:bg-zinc-100"
                  disabled={swapExecuting || swapLoading}
                  onClick={handleSwapExecution}
                >
                  {swapExecuting ? "Submitting swap..." : "Swap now"}
                </Button>
              </div>
            ) : (
              <div className="rounded-xl border border-white/10 bg-zinc-950/45 px-3 py-2.5 text-xs text-zinc-400">
                Quote details will appear here for{" "}
                <span className="inline-flex items-center gap-1">
                  <span>{selectedSwapFrom?.symbol ?? swapFromSymbol}</span>
                  <ArrowRight className="size-3 text-zinc-500" />
                  <span>{selectedSwapTo?.symbol ?? swapToSymbol}</span>
                </span>
                .
              </div>
            )}

            {swapSuccess && (
              <div className="rounded-xl border border-emerald-300/30 bg-emerald-900/20 px-3 py-2 text-sm text-emerald-200">
                {swapSuccess}
              </div>
            )}
          </div>
        </section>
      ) : (
        <section className="relative z-10 flex min-h-0 flex-1 flex-col">
          <div>
            <p className="text-[0.72rem] font-medium tracking-[0.14em] text-emerald-200/75">Stake</p>
            <h2 className="mt-1 text-[1.28rem] leading-tight font-semibold text-zinc-100">
              TON liquid staking
            </h2>
            <p className="mt-2 text-sm leading-[1.55] text-zinc-300">
              Start staking TON with Tonstakers and receive tsTON while your position accrues rewards.
            </p>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2.5">
            <div className="rounded-xl border border-white/10 bg-zinc-900/60 p-3">
              <p className="text-[0.68rem] text-zinc-400">Current APY</p>
              <p className="mt-1 text-sm font-semibold text-zinc-100">
                {stakeLoading ? "..." : stakeOverview?.apy ?? "--"}
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-zinc-900/60 p-3">
              <p className="text-[0.68rem] text-zinc-400">TVL</p>
              <p className="mt-1 text-sm font-semibold text-zinc-100">
                {stakeLoading ? "..." : `${stakeOverview?.tvlTon ?? "--"} TON`}
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-zinc-900/60 p-3">
              <p className="text-[0.68rem] text-zinc-400">Stakers</p>
              <p className="mt-1 text-sm font-semibold text-zinc-100">
                {stakeLoading ? "..." : stakeOverview?.stakersCount ?? "--"}
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-zinc-900/60 p-3">
              <p className="text-[0.68rem] text-zinc-400">Min stake</p>
              <p className="mt-1 text-sm font-semibold text-zinc-100">
                {stakeLoading ? "..." : stakeOverview?.minStake ?? "--"}
              </p>
            </div>
          </div>

          <div className="mt-3 rounded-xl border border-white/10 bg-zinc-900/60 p-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-[0.7rem] tracking-[0.08em] text-zinc-400">Stake amount (TON)</span>
              <Input
                className="h-11 rounded-xl border-white/12 bg-zinc-900/80 px-3 text-sm text-zinc-100 placeholder:text-zinc-500"
                inputMode="decimal"
                value={stakeAmountInput}
                onChange={(event) => setStakeAmountInput(event.target.value)}
                placeholder="10"
              />
            </label>
            <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-zinc-400">
              <p>Estimated tsTON: {estimatedTsTon.toFixed(4)}</p>
              <p className="text-right">Projected yearly rewards: {estimatedYearlyRewards.toFixed(4)} TON</p>
            </div>
            <Button
              type="button"
              className="mt-3 h-11 w-full rounded-xl bg-white text-zinc-900 hover:bg-zinc-100"
              disabled={!stakeAmountIsValid}
              onClick={() => {
                setWalletPage("home");
                setHomeMode("chat");
                sendMessage({
                  text: `I want to stake ${stakeAmountInput} TON. Walk me through the safest way and required steps.`,
                });
              }}
            >
              Continue with staking assistant
            </Button>
          </div>

          {stakeError && (
            <div className="mt-3 rounded-xl border border-rose-300/30 bg-rose-900/20 px-3 py-2 text-sm text-rose-200">
              {stakeError}
            </div>
          )}

          <p className="mt-3 text-xs text-zinc-400">
            Wallet:{" "}
            {walletAddress
              ? `${walletAddress.slice(0, 8)}…${walletAddress.slice(-6)}`
              : "Wallet pending"}
          </p>
        </section>
      )}
      {reserveBottomSpace && (
        <div
          className="shrink-0"
          style={{
            height: `calc(${
              FLOATING_NAV_HEIGHT + FLOATING_NAV_BOTTOM_OFFSET + 8
            }px + var(--tg-content-safe-area-inset-bottom))`,
          }}
        />
      )}
      <WalletNavbar currentPage={walletPage} onChange={handleWalletPageChange} />
    </div>
  );
}

export default function Home() {
  return (
    <TelegramInit>
      <JarvisApp />
    </TelegramInit>
  );
}

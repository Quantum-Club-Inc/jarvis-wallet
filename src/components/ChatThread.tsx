"use client";

import { useEffect, useRef } from "react";
import type { UIMessage } from "ai";
import {
  ArrowDownCircle,
  ArrowLeftRight,
  BarChart3,
  Coins,
  TrendingUp,
  Wallet,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ChatThreadProps {
  messages: UIMessage[];
  isLoading: boolean;
}

/**
 * Chat thread that displays agent messages and tool result cards.
 * Auto-scrolls to the latest message.
 */
export function ChatThread({ messages, isLoading }: ChatThreadProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  if (messages.length === 0 && !isLoading) {
    return (
      <div className="relative z-10 flex h-full min-h-0 items-center justify-center px-3">
        <p className="m-0 max-w-80 text-center text-sm leading-7 text-zinc-300">
          Say something like &ldquo;What&rsquo;s my balance?&rdquo; or
          &ldquo;Swap 5 TON to USDT&rdquo;
        </p>
      </div>
    );
  }

  return (
    <div
      className="relative z-10 flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-1 pt-2 pb-[calc(16px+var(--tg-content-safe-area-inset-bottom))] [scrollbar-width:thin] [scrollbar-color:rgba(255,255,255,0.14)_transparent]"
      ref={scrollRef}
    >
      {messages.map((msg) => (
        <MessageBubble key={msg.id} message={msg} />
      ))}
      {isLoading && (
        <div className="inline-flex w-fit items-center gap-1.5 self-start rounded-[18px_18px_18px_8px] border border-white/10 bg-zinc-950/92 px-4 py-3 backdrop-blur-xl">
          <div className="size-1.5 animate-bounce rounded-full bg-zinc-300 [animation-delay:0ms]" />
          <div className="size-1.5 animate-bounce rounded-full bg-zinc-300 [animation-delay:120ms]" />
          <div className="size-1.5 animate-bounce rounded-full bg-zinc-300 [animation-delay:240ms]" />
        </div>
      )}
    </div>
  );
}

function MessageBubble({ message }: { message: UIMessage }) {
  const isUser = message.role === "user";

  return (
    <div
      className={cn(
        "w-fit max-w-[min(88%,520px)] animate-in fade-in slide-in-from-bottom-2 duration-200 max-sm:max-w-[92%]",
        isUser
          ? "self-end rounded-[18px_18px_8px_18px] border border-emerald-200/20 bg-emerald-950/55 px-3.5 py-3"
          : "self-start rounded-[18px_18px_18px_8px] border border-white/10 bg-zinc-950/92 px-3.5 py-3 backdrop-blur-xl",
      )}
    >
      {message.parts.map((part, i) => {
        if (part.type === "text" && part.text) {
          return (
            <p
              key={i}
              className={cn(
                "m-0 whitespace-pre-wrap leading-6",
                isUser ? "text-zinc-100" : "text-foreground",
              )}
            >
              {part.text}
            </p>
          );
        }
        // In AI SDK v6, tool parts have type "tool-${toolName}" 
        if (part.type.startsWith("tool-")) {
          const toolPart = part as unknown as {
            type: string;
            toolCallId: string;
            state: string;
            input?: unknown;
            output?: unknown;
          };
          const toolName = toolPart.type.replace("tool-", "");
          return (
            <ToolCard
              key={i}
              toolName={toolName}
              state={toolPart.state}
              output={toolPart.output as Record<string, unknown> | undefined}
            />
          );
        }
        return null;
      })}
    </div>
  );
}

function ToolCard({
  toolName,
  state,
  output,
}: {
  toolName: string;
  state: string;
  output?: Record<string, unknown>;
}) {
  const isComplete = state === "output-available";
  const data = output;

  return (
    <div
      className={cn(
        "mt-2.5 overflow-hidden rounded-2xl border bg-zinc-950/84",
        isComplete ? "border-white/20" : "border-white/10",
      )}
    >
      <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2.5 text-[0.74rem] tracking-[0.12em] text-zinc-300">
        <span className="inline-flex items-center justify-center text-zinc-200">
          {getToolIcon(toolName)}
        </span>
        <span className="flex-1">{getToolLabel(toolName)}</span>
        {!isComplete && (
          <span className="size-3 animate-spin rounded-full border-2 border-white/20 border-t-zinc-100" />
        )}
      </div>

      {isComplete && data && (
        <div className="px-3 pt-2 pb-3">
          {toolName === "check_balance" && <BalanceResult data={data} />}
          {toolName === "swap_tokens" && <SwapResult data={data} />}
          {(toolName === "stake_ton" || toolName === "unstake_ton") && (
            <StakeResult data={data} />
          )}
          {toolName === "get_staking_info" && <StakingInfoResult data={data} />}
          {toolName === "get_token_price" && <PriceResult data={data} />}
        </div>
      )}
    </div>
  );
}

function BalanceResult({ data }: { data: Record<string, unknown> }) {
  const jettons = (data.jettonBalances ?? []) as Array<{
    symbol: string;
    balance: string;
  }>;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-3 text-[0.86rem] text-zinc-300">
        <span>TON</span>
        <span className="text-right font-mono text-zinc-100">{String(data.tonBalance)}</span>
      </div>
      {jettons.map((j) => (
        <div key={j.symbol} className="flex items-center justify-between gap-3 text-[0.86rem] text-zinc-300">
          <span>{j.symbol}</span>
          <span className="text-right font-mono text-foreground">{j.balance}</span>
        </div>
      ))}
    </div>
  );
}

function SwapResult({ data }: { data: Record<string, unknown> }) {
  const isAutomation = data.executionMode === "automation" || data.status === "executed_via_n8n";
  return (
    <div className="flex flex-col gap-1.5">
      <ResultRow label="From" value={String(data.from)} />
      <ResultRow label="To" value={String(data.to)} highlight />
      {!isAutomation && (
        <>
          <ResultRow label="Min. Received" value={String(data.minimumReceived)} />
          <ResultRow label="Rate" value={String(data.swapRate)} />
          <ResultRow label="Price Impact" value={String(data.priceImpact)} />
        </>
      )}
      {isAutomation && (
        <>
          <ResultRow label="Mode" value="n8n automation" />
          <ResultRow label="Seqno" value={String(data.seqno ?? "--")} />
        </>
      )}
    </div>
  );
}

function StakeResult({ data }: { data: Record<string, unknown> }) {
  const isAutomation = data.executionMode === "automation" || data.status === "executed_via_n8n";
  return (
    <div className="flex flex-col gap-1.5">
      <ResultRow
        label={data.action === "stake" ? "Stake" : "Unstake"}
        value={String(data.amount)}
        highlight
      />
      <ResultRow label="Will Receive" value={String(data.willReceive)} />
      {!!data.currentApy && (
        <ResultRow label="APY" value={String(data.currentApy)} />
      )}
      {isAutomation && <ResultRow label="Mode" value="n8n automation" />}
    </div>
  );
}

function StakingInfoResult({ data }: { data: Record<string, unknown> }) {
  return (
    <div className="flex flex-col gap-1.5">
      <ResultRow label="APY" value={String(data.apy)} highlight />
      <ResultRow label="TVL" value={String(data.tvlTon)} />
      <ResultRow label="Rate" value={String(data.tstonRate)} />
      <ResultRow label="Min. Stake" value={String(data.minStake)} />
    </div>
  );
}

function PriceResult({ data }: { data: Record<string, unknown> }) {
  return (
    <div className="flex flex-col gap-1.5">
      <ResultRow label={String(data.symbol)} value={String(data.priceUsd)} highlight />
    </div>
  );
}

function ResultRow({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-[0.86rem] text-zinc-300">
      <span>{label}</span>
      <span className={cn("text-right font-mono", highlight ? "text-zinc-100" : "text-foreground")}>
        {value}
      </span>
    </div>
  );
}

function getToolIcon(toolName: string) {
  switch (toolName) {
    case "check_balance":
      return <Wallet className="size-3.5" />;
    case "swap_tokens":
      return <ArrowLeftRight className="size-3.5" />;
    case "stake_ton":
      return <TrendingUp className="size-3.5" />;
    case "unstake_ton":
      return <ArrowDownCircle className="size-3.5" />;
    case "get_staking_info":
      return <BarChart3 className="size-3.5" />;
    case "get_token_price":
      return <Coins className="size-3.5" />;
    default:
      return <Zap className="size-3.5" />;
  }
}

function getToolLabel(toolName: string): string {
  switch (toolName) {
    case "check_balance":
      return "Checking Balance";
    case "swap_tokens":
      return "Swap";
    case "stake_ton":
      return "Stake";
    case "unstake_ton":
      return "Unstake tsTON";
    case "get_staking_info":
      return "Staking Info";
    case "get_token_price":
      return "Token Price";
    default:
      return toolName;
  }
}

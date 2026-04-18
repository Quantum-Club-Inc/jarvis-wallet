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
      <div className="chat-empty">
        <p className="chat-empty-text">
          Say something like &ldquo;What&rsquo;s my balance?&rdquo; or
          &ldquo;Swap 5 TON to USDT&rdquo;
        </p>
      </div>
    );
  }

  return (
    <div className="chat-thread" ref={scrollRef}>
      {messages.map((msg) => (
        <MessageBubble key={msg.id} message={msg} />
      ))}
      {isLoading && (
        <div className="chat-typing">
          <div className="typing-dot" />
          <div className="typing-dot" />
          <div className="typing-dot" />
        </div>
      )}
    </div>
  );
}

function MessageBubble({ message }: { message: UIMessage }) {
  const isUser = message.role === "user";

  return (
    <div className={`chat-bubble ${isUser ? "user" : "assistant"}`}>
      {message.parts.map((part, i) => {
        if (part.type === "text" && part.text) {
          return (
            <p key={i} className="chat-text">
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
    <div className={`tool-card ${isComplete ? "complete" : "pending"}`}>
      <div className="tool-card-header">
        <span className="tool-icon">{getToolIcon(toolName)}</span>
        <span className="tool-name">{getToolLabel(toolName)}</span>
        {!isComplete && <span className="tool-spinner" />}
      </div>

      {isComplete && data && (
        <div className="tool-card-body">
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
    <div className="tool-result">
      <div className="tool-result-row highlight">
        <span>💎 TON</span>
        <span>{String(data.tonBalance)}</span>
      </div>
      {jettons.map((j) => (
        <div key={j.symbol} className="tool-result-row">
          <span>{j.symbol}</span>
          <span>{j.balance}</span>
        </div>
      ))}
    </div>
  );
}

function SwapResult({ data }: { data: Record<string, unknown> }) {
  return (
    <div className="tool-result">
      <div className="tool-result-row">
        <span>From</span>
        <span>{String(data.from)}</span>
      </div>
      <div className="tool-result-row highlight">
        <span>To</span>
        <span>{String(data.to)}</span>
      </div>
      <div className="tool-result-row">
        <span>Min. Received</span>
        <span>{String(data.minimumReceived)}</span>
      </div>
      <div className="tool-result-row">
        <span>Rate</span>
        <span>{String(data.swapRate)}</span>
      </div>
      <div className="tool-result-row">
        <span>Price Impact</span>
        <span>{String(data.priceImpact)}</span>
      </div>
    </div>
  );
}

function StakeResult({ data }: { data: Record<string, unknown> }) {
  return (
    <div className="tool-result">
      <div className="tool-result-row highlight">
        <span>{data.action === "stake" ? "Stake" : "Unstake"}</span>
        <span>{String(data.amount)}</span>
      </div>
      <div className="tool-result-row">
        <span>Will Receive</span>
        <span>{String(data.willReceive)}</span>
      </div>
      {!!data.currentApy && (
        <div className="tool-result-row">
          <span>APY</span>
          <span>{String(data.currentApy)}</span>
        </div>
      )}
    </div>
  );
}

function StakingInfoResult({ data }: { data: Record<string, unknown> }) {
  return (
    <div className="tool-result">
      <div className="tool-result-row highlight">
        <span>APY</span>
        <span>{String(data.apy)}</span>
      </div>
      <div className="tool-result-row">
        <span>TVL</span>
        <span>{String(data.tvlTon)}</span>
      </div>
      <div className="tool-result-row">
        <span>Rate</span>
        <span>{String(data.tstonRate)}</span>
      </div>
      <div className="tool-result-row">
        <span>Min. Stake</span>
        <span>{String(data.minStake)}</span>
      </div>
    </div>
  );
}

function PriceResult({ data }: { data: Record<string, unknown> }) {
  return (
    <div className="tool-result">
      <div className="tool-result-row highlight">
        <span>{String(data.symbol)}</span>
        <span>{String(data.priceUsd)}</span>
      </div>
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
      return "Swap Preview";
    case "stake_ton":
      return "Stake TON";
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

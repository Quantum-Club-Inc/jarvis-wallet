"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface WalletBarProps {
  address: string | null;
  balance: string | null;
  isConnected: boolean;
}

/**
 * Compact top wallet status bar using shadcn primitives.
 * Shows truncated address, TON balance, and connection status.
 */
export function WalletBar({ address, balance, isConnected }: WalletBarProps) {
  const [copied, setCopied] = useState(false);

  const truncatedAddress = address
    ? `${address.slice(0, 6)}…${address.slice(-4)}`
    : "No wallet";

  const handleCopy = () => {
    if (!address) return;
    navigator.clipboard.writeText(address).then(() => {
      setCopied(true);
      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred("success");
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div className="wallet-bar">
      <div className="flex items-center gap-2.5">
        <span
          className={`wallet-status-dot ${isConnected ? "connected" : "disconnected"}`}
        />
        <Button
          variant="ghost"
          size="sm"
          className="font-mono text-xs text-muted-foreground hover:text-foreground"
          onClick={handleCopy}
          title={address ?? "No wallet"}
        >
          {copied ? "Copied!" : truncatedAddress}
        </Button>
      </div>
      <div className="flex items-center gap-2">
        {balance ? (
          <Badge variant="secondary" className="font-mono text-xs gap-1.5">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 3h12l4 6-10 13L2 9z" />
            </svg>
            {balance} TON
          </Badge>
        ) : (
          <Badge variant="outline" className="font-mono text-xs text-muted-foreground">
            —
          </Badge>
        )}
      </div>
    </div>
  );
}

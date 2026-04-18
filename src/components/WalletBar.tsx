"use client";

import { useState } from "react";

interface WalletBarProps {
  address: string | null;
  balance: string | null;
  isConnected: boolean;
}

/**
 * Compact top wallet status bar.
 * Shows truncated address, TON balance, and connection status.
 */
export function WalletBar({ address, balance, isConnected }: WalletBarProps) {
  const [copied, setCopied] = useState(false);

  const truncatedAddress = address
    ? `${address.slice(0, 6)}...${address.slice(-4)}`
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
      <div className="wallet-bar-left">
        <div
          className={`wallet-status-dot ${isConnected ? "connected" : "disconnected"}`}
        />
        <button
          className="wallet-address"
          onClick={handleCopy}
          title={address ?? "No wallet"}
        >
          {copied ? "Copied!" : truncatedAddress}
        </button>
      </div>
      <div className="wallet-bar-right">
        <span className="wallet-balance">
          {balance ? `${balance} TON` : "—"}
        </span>
        <span className="wallet-balance-icon">💎</span>
      </div>
    </div>
  );
}

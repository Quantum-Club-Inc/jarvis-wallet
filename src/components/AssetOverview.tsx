"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

interface AssetItem {
  symbol: string;
  amount: string;
  valueUsd: string | null;
  imageUrl: string | null;
}

const ASSET_FALLBACK_COLORS = [
  "bg-sky-500/15 text-sky-200 border-sky-300/25",
  "bg-violet-500/15 text-violet-200 border-violet-300/25",
  "bg-emerald-500/15 text-emerald-200 border-emerald-300/25",
  "bg-amber-500/15 text-amber-200 border-amber-300/25",
  "bg-rose-500/15 text-rose-200 border-rose-300/25",
] as const;

interface AssetOverviewProps {
  address: string | null;
  totalUsd: string | null;
  totalTon: string | null;
  assets: AssetItem[];
  isLoading: boolean;
}

export function AssetOverview({
  address,
  totalUsd,
  totalTon,
  assets,
  isLoading,
}: AssetOverviewProps) {
  const [copied, setCopied] = useState(false);
  const displayUsd = totalUsd ?? "0.00";
  const displayTon = totalTon ?? "0.0000";
  const compactAddress =
    address && address.length > 16
      ? `${address.slice(0, 8)}...${address.slice(-8)}`
      : address;

  const handleCopyAddress = () => {
    if (!address) {
      return;
    }

    navigator.clipboard.writeText(address).then(() => {
      setCopied(true);
      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred("success");
      window.setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <section className="relative z-10 rounded-2xl border border-white/10 bg-zinc-950/88 p-4 shadow-[0_18px_48px_rgba(0,0,0,0.34)] backdrop-blur-xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[0.64rem] font-medium tracking-[0.2em] text-zinc-500">
            Total assets
          </p>
          {isLoading ? (
            <div className="mt-1 space-y-2">
              <Skeleton className="h-10 w-36 bg-zinc-800/70" />
              <Skeleton className="h-4 w-28 bg-zinc-800/70" />
              <Skeleton className="h-8 w-44 rounded-lg bg-zinc-800/70" />
            </div>
          ) : null}
          {!isLoading ? (
            <>
              <p className="mt-1 text-2xl leading-none font-semibold text-zinc-100">
                ${displayUsd}
              </p>
              <p className="mt-2 text-xs text-zinc-400">
                ≈ {displayTon} TON
              </p>
              {compactAddress ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-1 h-auto px-0 py-1 text-left font-normal text-zinc-400 hover:bg-transparent hover:text-zinc-100"
                  title={address ?? undefined}
                  onClick={handleCopyAddress}
                >
                  <span className="font-mono text-xs">
                    {copied ? "Address copied" : `Address: ${compactAddress}`}
                  </span>
                </Button>
              ) : null}
            </>
          ) : null}
        </div>
      </div>

      <div className="mt-3 space-y-2">
        {isLoading ? (
          <>
            <Skeleton className="h-14 rounded-xl bg-zinc-800/70" />
            <Skeleton className="h-14 rounded-xl bg-zinc-800/70" />
          </>
        ) : assets.length === 0 ? (
          <div className="rounded-xl border border-white/10 bg-zinc-900/50 px-3 py-2 text-xs text-zinc-400">
            No assets loaded yet.
          </div>
        ) : (
          assets.map((asset) => (
            <div
              key={asset.symbol}
              className="flex items-center justify-between rounded-xl border border-white/10 bg-zinc-900/55 px-3 py-2"
            >
              <div className="flex items-center gap-2.5">
                <AssetLogo symbol={asset.symbol} imageUrl={asset.imageUrl} />
                <div>
                  <p className="text-sm font-medium text-zinc-100">{asset.symbol}</p>
                  <p className="text-xs text-zinc-400">{asset.amount}</p>
                </div>
              </div>
              <p className="text-sm text-zinc-300">
                {asset.valueUsd ? `$${asset.valueUsd}` : "--"}
              </p>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function AssetLogo({ symbol, imageUrl }: { symbol: string; imageUrl: string | null }) {
  const normalized = symbol.trim().toUpperCase();
  const [imageFailed, setImageFailed] = useState(false);

  if (imageUrl && !imageFailed) {
    return (
      <div className="flex size-8 items-center justify-center overflow-hidden rounded-full">
        <img
          src={imageUrl}
          alt={`${normalized} logo`}
          className="size-full object-cover"
          loading="lazy"
          onError={() => setImageFailed(true)}
        />
      </div>
    );
  }

  if (normalized === "TON") {
    return (
      <div className="flex size-8 items-center justify-center rounded-full">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            fill="#fff"
            d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12s12-5.373 12-12S18.627 0 12 0M7.902 6.697h8.196c1.505 0 2.462 1.628 1.705 2.94l-5.059 8.765a.86.86 0 0 1-1.488 0L6.199 9.637c-.758-1.314.197-2.94 1.703-2.94m4.844 1.496v7.58l1.102-2.128l2.656-4.756a.465.465 0 0 0-.408-.696zM7.9 8.195a.464.464 0 0 0-.408.694l2.658 4.754l1.102 2.13V8.195z"
          />
        </svg>
      </div>
    );
  }

  const colorClass = ASSET_FALLBACK_COLORS[
    Math.abs(hashSymbol(normalized)) % ASSET_FALLBACK_COLORS.length
  ];
  const shortLabel = normalized.replace(/[^A-Z0-9]/g, "").slice(0, 2) || "?";

  return (
    <div className={`flex size-8 items-center justify-center rounded-full border text-[0.62rem] font-semibold ${colorClass}`}>
      {shortLabel}
    </div>
  );
}

function hashSymbol(value: string) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}

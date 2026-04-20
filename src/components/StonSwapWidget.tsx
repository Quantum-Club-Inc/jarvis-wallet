"use client";

import { useEffect, useRef, useState } from "react";
import omnistonWidgetLoader, { type OmnistonWidget as OmnistonWidgetInstance } from "@ston-fi/omniston-widget-loader";

import { KNOWN_TOKENS, TON_ADDRESS } from "@/lib/defi/tokens";
import { cn } from "@/lib/utils";

const DEFAULT_ASK_ASSET = KNOWN_TOKENS.find((token) => token.symbol === "USDT")?.address;

interface StonSwapWidgetProps {
  className?: string;
  onMountError?: (message: string) => void;
}

export function StonSwapWidget({ className, onMountError }: StonSwapWidgetProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let disposed = false;
    let widget: OmnistonWidgetInstance | null = null;

    async function mountWidget() {
      try {
        const OmnistonWidget = await omnistonWidgetLoader.load();
        if (disposed || !mountRef.current) {
          return;
        }

        widget = new OmnistonWidget({
          tonconnect: {
            type: "standalone",
            options: {
              manifestUrl: `${window.location.origin}/api/tonconnect-manifest`,
            },
          },
          widget: {
            defaultBidAsset: TON_ADDRESS,
            defaultAskAsset: DEFAULT_ASK_ASSET,
            defaultAssets: true,
          },
        });

        widget.mount(mountRef.current);
        setLoading(false);
      } catch (error) {
        if (disposed) {
          return;
        }

        const message = error instanceof Error ? error.message : "Could not load STON.fi widget.";
        onMountError?.(message);
      }
    }

    void mountWidget();

    return () => {
      disposed = true;
      widget?.unmount();
    };
  }, [onMountError]);

  return (
    <div
      className={cn(
        "relative min-h-[640px] overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/35",
        className,
      )}
    >
      <div ref={mountRef} className="min-h-[640px] w-full" />

      {loading && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center bg-zinc-950/55 text-sm text-zinc-300">
          Loading STON.fi widget...
        </div>
      )}
    </div>
  );
}

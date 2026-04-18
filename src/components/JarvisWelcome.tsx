"use client";

import { cn } from "@/lib/utils";

interface JarvisWelcomeProps {
  firstName: string;
  isReturning: boolean;
  isTelegram: boolean;
  isWalletReady: boolean;
  authState: "idle" | "authenticating" | "authenticated" | "error";
  authError: string | null;
}

export function JarvisWelcome({
  firstName,
  isReturning,
  isTelegram,
  isWalletReady,
  authState,
  authError,
}: JarvisWelcomeProps) {
  const authLabel =
    authState === "authenticated"
      ? "Identity verified"
      : authState === "authenticating"
        ? "Verifying identity"
        : authState === "error"
          ? "Identity issue"
          : "Identity pending";

  return (
    <section className="jarvis-welcome-panel" aria-live="polite">
      <div className="jarvis-welcome-copy">
        <span className="jarvis-welcome-eyebrow">Jarvis Voice Wallet</span>
        <h1 className="jarvis-welcome-title">
          {isReturning ? "Welcome back," : "Welcome,"} {firstName}.
        </h1>
        <p className="jarvis-welcome-lead">
          {isReturning
            ? "Ready for your next move."
            : "I'm Jarvis, your assistant for secure TON actions."}
        </p>
      </div>

      <div className="jarvis-status-row">
        <span className={cn("jarvis-status-pill", isTelegram ? "active" : "muted")}>
          {isTelegram ? "Telegram session" : "Browser preview"}
        </span>
        <span className={cn("jarvis-status-pill", isWalletReady ? "active" : "pending")}>
          {isWalletReady ? "Wallet connected" : "Preparing wallet"}
        </span>
        <span
          className={cn(
            "jarvis-status-pill",
            authState === "authenticated"
              ? "active"
              : authState === "error"
                ? "pending"
                : "muted",
          )}
        >
          {authLabel}
        </span>
      </div>

      {authError && (
        <div className="jarvis-presence-row">
          <p className="jarvis-presence-error">{authError}</p>
        </div>
      )}
    </section>
  );
}

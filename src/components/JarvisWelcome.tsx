"use client";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";

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
  const eyebrow = isReturning ? "Welcome back" : "Welcome";
  const primaryCopy = isReturning
    ? "Your wallet, Telegram session, and voice controls are standing by."
    : "I'm Jarvis, your personal AI wallet assistant.";
  const secondaryCopy = isReturning
    ? "Pick up where you left off or speak to start a new move on TON."
    : "Let's get you initialized and ready to manage TON with voice or chat.";

  return (
    <Card className="jarvis-welcome-panel border-border/50 bg-card/60 backdrop-blur-xl">
      <CardHeader className="gap-2">
        <span className="jarvis-welcome-eyebrow">{eyebrow}</span>
        <CardTitle className="jarvis-welcome-title">
          Hi, {firstName}.
        </CardTitle>
        <CardDescription className="jarvis-welcome-lead text-foreground/90">
          {primaryCopy}
        </CardDescription>
        <p className="text-sm text-muted-foreground leading-relaxed max-w-[28rem]">
          {secondaryCopy}
        </p>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-2" aria-label="Initialization status">
          <StatusBadge
            label={isTelegram ? "Telegram live" : "Browser preview"}
            tone={isTelegram ? "active" : "muted"}
          />
          <StatusBadge label="Gemini core" tone="active" />
          <StatusBadge
            label={isWalletReady ? "Wallet secured" : "Wallet loading"}
            tone={isWalletReady ? "active" : "pending"}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-sm text-muted-foreground">
            {authState === "authenticated" && "Telegram identity linked"}
            {authState === "authenticating" && "Linking your Telegram identity"}
            {authState === "error" && "Telegram auth needs attention"}
            {authState === "idle" && "Awaiting Telegram session"}
          </span>
          {authError && (
            <span className="text-sm text-destructive">{authError}</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function StatusBadge({
  label,
  tone,
}: {
  label: string;
  tone: "active" | "pending" | "muted";
}) {
  const variantMap = {
    active: "default" as const,
    pending: "secondary" as const,
    muted: "outline" as const,
  };

  return (
    <Badge
      variant={variantMap[tone]}
      className={
        tone === "active"
          ? "bg-primary/15 text-primary border-primary/20 hover:bg-primary/20"
          : tone === "pending"
            ? "bg-[#f4d18f]/10 text-[#ffe4b2] border-[#f4d18f]/20"
            : ""
      }
    >
      {label}
    </Badge>
  );
}

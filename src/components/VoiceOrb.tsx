"use client";

import { AlertTriangle, Mic, MicOff, Sparkles, Volume2 } from "lucide-react";

import { cn } from "@/lib/utils";

export type OrbState = "idle" | "listening" | "processing" | "speaking" | "error";

interface VoiceOrbProps {
  state: OrbState;
  voiceLevel?: number;
  transcript?: string;
  spokenWords?: string[];
  currentWordIndex?: number;
}
const HARMONIC_WEIGHTS = [0.34, 0.58, 0.92, 0.58, 0.34] as const;

export function VoiceOrb({
  state,
  voiceLevel = 0,
  transcript,
  spokenWords,
  currentWordIndex = -1,
}: VoiceOrbProps) {
  const isActive = state === "listening" || state === "processing" || state === "speaking";
  const isError = state === "error";
  const statusLabel = state === "listening"
    ? "Listening"
    : state === "processing"
      ? "Processing"
      : state === "speaking"
        ? "Speaking"
        : state === "error"
          ? "Mic issue"
          : "Ready";
  const statusHint = state === "listening"
    ? "Mic is on. Tap the mic to stop listening."
    : state === "processing"
      ? "Jarvis is processing your request..."
      : state === "speaking"
        ? "Jarvis is speaking. Mic will turn back on automatically."
        : state === "error"
          ? "Microphone unavailable. Check permissions and try again."
          : "Mic is off. Tap the mic button to start.";

  const isListening = state === "listening";
  const isProcessing = state === "processing";
  const isSpeaking = state === "speaking";
  const statusIcon = isListening
    ? <Mic className="size-7 text-zinc-100" />
    : isSpeaking
      ? <Volume2 className="size-7 text-zinc-100" />
      : isProcessing
        ? <Sparkles className="size-7 text-zinc-200" />
        : isError
          ? <AlertTriangle className="size-7 text-rose-200" />
          : <MicOff className="size-7 text-zinc-300" />;
  const ringEnergy = isListening
    ? Math.max(0.08, voiceLevel)
    : isSpeaking
      ? Math.max(0.2, 0.26 + (((currentWordIndex % 5) + 1) * 0.06))
      : isProcessing
        ? 0.2
      : 0;

  return (
    <div className="relative z-10 flex min-h-0 flex-1 flex-col items-center justify-center gap-4 py-[calc(2px+var(--tg-content-safe-area-inset-bottom))]">
      <div
        className={cn(
          "rounded-full border px-3 py-1 text-[0.68rem] font-medium tracking-[0.1em]",
          isError
            ? "border-rose-300/35 bg-rose-900/20 text-rose-100"
            : "border-white/12 bg-zinc-950/70 text-zinc-100",
        )}
      >
        {statusLabel}
      </div>

      <div
        className={cn(
          "grid h-28 w-28 place-items-center rounded-[28px] border border-white/12 bg-zinc-950/70 shadow-[0_16px_35px_rgba(0,0,0,0.35)]",
          isActive ? "animate-pulse motion-reduce:animate-none" : "",
          isActive && "border-white/20 bg-zinc-900/85",
          isError && "border-rose-300/45 bg-rose-900/20",
        )}
      >
        {statusIcon}
      </div>

      <div className="flex h-12 items-end gap-1.5">
        {HARMONIC_WEIGHTS.map((weight, index) => {
          const harmonicEnergy = Math.max(0.1, ringEnergy);
          const height = 8 + Math.round(harmonicEnergy * 30 * weight);
          return (
            <span
              key={index}
              className={cn(
                "w-1.5 rounded-full bg-zinc-200/90 transition-all duration-100",
                isActive ? "animate-pulse motion-reduce:animate-none" : "opacity-40",
                isError ? "bg-rose-200/80" : "",
              )}
              style={{
                height: `${height}px`,
                animationDelay: `${index * 110}ms`,
              }}
            />
          );
        })}
      </div>

      <p className={cn("max-w-[min(330px,88vw)] text-center text-[0.82rem] font-medium leading-6 text-zinc-300", isError && "text-rose-200")}>
        {statusHint}
      </p>

      {transcript && (state === "listening" || state === "processing") && (
        <div className="max-w-[min(330px,88vw)] rounded-[18px] border border-white/10 bg-zinc-950/82 px-4 py-3 text-center leading-6 text-foreground backdrop-blur-xl">
          <p className="text-[0.66rem] tracking-[0.1em] text-zinc-400">Heard</p>
          <p className="mt-1">{transcript}</p>
        </div>
      )}

      {state === "speaking" && spokenWords && spokenWords.length > 0 && (() => {
        const CHUNK = 8;
        const chunkIdx = Math.floor(Math.max(0, currentWordIndex) / CHUNK);
        const start = chunkIdx * CHUNK;
        const line = spokenWords.slice(start, start + CHUNK);
        return (
          <div className="max-w-[min(300px,84vw)] rounded-[18px] border border-white/10 bg-zinc-950/82 px-4 py-3 text-center text-[0.82rem] leading-6 backdrop-blur-xl">
            {line.map((word, i) => (
              <span
                key={start + i}
                className={cn(
                  "transition-colors duration-150",
                  start + i === currentWordIndex ? "text-white" : "text-zinc-500",
                )}
              >
                {word}{" "}
              </span>
            ))}
          </div>
        );
      })()}
    </div>
  );
}

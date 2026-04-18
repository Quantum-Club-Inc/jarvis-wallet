"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export type OrbState = "idle" | "listening" | "processing" | "speaking" | "error";

interface VoiceOrbProps {
  state: OrbState;
  onPress: () => void;
  transcript?: string;
  spokenWords?: string[];
  currentWordIndex?: number;
}

/**
 * VoiceOrb — the hero UI element.
 * A large animated orb that serves as the primary interaction point.
 * State-driven animations via CSS classes. Dynamically responds to voice volume.
 */
export function VoiceOrb({ state, onPress, transcript, spokenWords, currentWordIndex = -1 }: VoiceOrbProps) {
  const [volume, setVolume] = useState(0.1);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number>(0);
  const streamRef = useRef<MediaStream | null>(null);

  const handleClick = useCallback(() => {
    window.Telegram?.WebApp?.HapticFeedback?.impactOccurred("medium");
    onPress();
  }, [onPress]);


  function startVolumeTracking() {
    if (!navigator.mediaDevices?.getUserMedia) {
      return;
    }

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        streamRef.current = stream;
        const audioCtx = new (
          window.AudioContext
          || (window as Window & typeof globalThis & { webkitAudioContext: typeof AudioContext }).webkitAudioContext
        )();
        audioContextRef.current = audioCtx;
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        analyserRef.current = analyser;

        const source = audioCtx.createMediaStreamSource(stream);
        source.connect(analyser);

        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        const draw = () => {
          if (!analyserRef.current) {
            return;
          }

          analyserRef.current.getByteFrequencyData(dataArray);
          let sum = 0;
          for (let i = 0; i < bufferLength; i++) {
            sum += dataArray[i];
          }
          const avg = sum / bufferLength;
          const v = (avg / 128.0) * 2;
          setVolume(Math.max(0.2, Math.min(v, 2.5)));
          rafRef.current = requestAnimationFrame(draw);
        };
        draw();
      } catch (error) {
        const maybeDomError = error as DOMException | undefined;
        if (maybeDomError?.name !== "NotAllowedError") {
          console.error("Mic volume tracking failed:", error);
        }
        setVolume(0.1);
      }
    })();
  }

  function stopVolumeTracking() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(console.error);
      audioContextRef.current = null;
    }
    setTimeout(() => setVolume(0.1), 0);
  }

  useEffect(() => {
    if (state === "listening") {
      startVolumeTracking();
    } else {
      stopVolumeTracking();
    }
    return () => stopVolumeTracking();
  }, [state]);

  return (
    <div className="relative z-10 flex min-h-0 flex-1 flex-col items-center justify-center gap-1.5 py-[calc(2px+var(--tg-content-safe-area-inset-bottom))]">
      <div className="relative grid size-[132px] place-items-center md:size-[112px]">
        <div
          className={cn(
            "pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/15",
            state === "listening"
              ? "size-[88px] animate-ping opacity-100 motion-reduce:animate-none md:size-[76px]"
              : "size-[88px] opacity-0 md:size-[76px]",
          )}
        />
        <div
          className={cn(
            "pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/10 [animation-delay:200ms]",
            state === "listening"
              ? "size-[112px] animate-ping opacity-100 motion-reduce:animate-none md:size-[96px]"
              : "size-[112px] opacity-0 md:size-[96px]",
          )}
        />
        <div
          className={cn(
            "pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/10 [animation-delay:400ms]",
            state === "listening"
              ? "size-[132px] animate-ping opacity-100 motion-reduce:animate-none md:size-[112px]"
              : "size-[132px] opacity-0 md:size-[112px]",
          )}
        />

        <button
          id="voice-orb-button"
          className={cn(
            "relative z-10 grid size-[74px] place-items-center rounded-full border-0 text-foreground shadow-[0_22px_48px_rgba(2,6,16,0.45),0_0_0_1px_rgba(255,255,255,0.08),inset_0_1px_0_rgba(255,255,255,0.08)] transition-transform duration-200 ease-out active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-300/60 md:size-[64px]",
            state === "idle" &&
              "bg-zinc-900 motion-safe:animate-pulse motion-reduce:animate-none",
            state === "listening" &&
              "bg-zinc-800 shadow-[0_0_0_1px_rgba(255,255,255,0.12),0_24px_80px_rgba(40,40,40,0.56),0_0_48px_rgba(255,255,255,0.12)] motion-safe:animate-pulse motion-reduce:animate-none",
            state === "processing" &&
              "bg-zinc-800 shadow-[0_0_0_1px_rgba(255,255,255,0.14),0_24px_80px_rgba(32,32,32,0.6),0_0_42px_rgba(255,255,255,0.12)]",
            state === "speaking" &&
              "bg-zinc-700 shadow-[0_0_0_1px_rgba(255,255,255,0.14),0_24px_80px_rgba(32,32,32,0.58),0_0_44px_rgba(255,255,255,0.12)] motion-safe:animate-pulse motion-reduce:animate-none",
            state === "error" &&
              "bg-zinc-800 shadow-[0_0_0_1px_rgba(255,255,255,0.16),0_24px_80px_rgba(23,23,23,0.6),0_0_42px_rgba(255,255,255,0.1)]",
          )}
          onClick={handleClick}
          aria-label={
            state === "listening" ? "Stop listening" : "Start listening"
          }
        >
          <div
            className={cn(
              "text-zinc-200 transition-colors duration-200",
              (state === "listening" || state === "speaking") && "text-zinc-50",
              state === "error" && "text-zinc-200",
            )}
            style={{ transform: state === "listening" ? `scale(${1 + (volume * 0.15)})` : "scale(1)" }}
          >
            {state === "idle" && <MicIcon />}
            {state === "listening" && <WaveformIcon volume={volume} />}
            {state === "processing" && <SpinnerIcon />}
            {state === "speaking" && <SpeakerIcon />}
            {state === "error" && <ErrorIcon />}
          </div>
        </button>
      </div>

      <div
        className={cn(
          "text-[0.82rem] font-medium tracking-[0.08em]",
          state === "idle" && "text-zinc-500",
          (state === "listening" || state === "processing" || state === "speaking" || state === "error")
            && "text-zinc-300",
        )}
      >
        {state === "idle" && "Tap to speak"}
        {state === "listening" && "Listening..."}
        {state === "processing" && "Thinking..."}
        {state === "speaking" && "Speaking..."}
        {state === "error" && "Tap to retry"}
      </div>

      {transcript && (state === "listening" || state === "processing") && (
        <div className="max-w-[min(320px,88vw)] rounded-[18px] border border-white/10 bg-zinc-950/82 px-4 py-3 text-center leading-6 text-foreground backdrop-blur-xl">
          {transcript}
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

function MicIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="9" y="2" width="6" height="11" rx="3" />
      <path d="M5 10a7 7 0 0 0 14 0" />
      <line x1="12" y1="19" x2="12" y2="22" />
    </svg>
  );
}

function WaveformIcon({ volume = 1 }: { volume?: number }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      style={{ transform: `scaleY(${Math.max(0.3, Math.min(volume, 2))})` }}
    >
      <line x1="4" y1="8" x2="4" y2="16" className="origin-center animate-pulse motion-reduce:animate-none [animation-delay:0ms]" />
      <line x1="8" y1="5" x2="8" y2="19" className="origin-center animate-pulse motion-reduce:animate-none [animation-delay:80ms]" />
      <line x1="12" y1="3" x2="12" y2="21" className="origin-center animate-pulse motion-reduce:animate-none [animation-delay:160ms]" />
      <line x1="16" y1="5" x2="16" y2="19" className="origin-center animate-pulse motion-reduce:animate-none [animation-delay:240ms]" />
      <line x1="20" y1="8" x2="20" y2="16" className="origin-center animate-pulse motion-reduce:animate-none [animation-delay:320ms]" />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      className="animate-spin motion-reduce:animate-none"
    >
      <path d="M12 2a10 10 0 0 1 10 10" />
    </svg>
  );
}

function SpeakerIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" className="animate-pulse motion-reduce:animate-none" />
      <path
        d="M19.07 4.93a10 10 0 0 1 0 14.14"
        className="animate-pulse motion-reduce:animate-none [animation-delay:180ms]"
      />
    </svg>
  );
}

function ErrorIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="15" y1="9" x2="9" y2="15" />
      <line x1="9" y1="9" x2="15" y2="15" />
    </svg>
  );
}

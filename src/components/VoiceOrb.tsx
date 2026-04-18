"use client";

import { useCallback } from "react";

export type OrbState = "idle" | "listening" | "processing" | "speaking" | "error";

interface VoiceOrbProps {
  state: OrbState;
  onPress: () => void;
  transcript?: string;
}

/**
 * VoiceOrb — the hero UI element.
 * A large animated orb that serves as the primary interaction point.
 * State-driven animations via CSS classes.
 */
export function VoiceOrb({ state, onPress, transcript }: VoiceOrbProps) {
  const handleClick = useCallback(() => {
    window.Telegram?.WebApp?.HapticFeedback?.impactOccurred("medium");
    onPress();
  }, [onPress]);

  return (
    <div className="voice-orb-container">
      {/* Ambient glow rings */}
      <div className={`orb-ring orb-ring-1 ${state}`} />
      <div className={`orb-ring orb-ring-2 ${state}`} />
      <div className={`orb-ring orb-ring-3 ${state}`} />

      {/* Main orb button */}
      <button
        id="voice-orb-button"
        className={`voice-orb ${state}`}
        onClick={handleClick}
        aria-label={
          state === "listening" ? "Stop listening" : "Start listening"
        }
      >
        <div className="orb-inner">
          {state === "idle" && <MicIcon />}
          {state === "listening" && <WaveformIcon />}
          {state === "processing" && <SpinnerIcon />}
          {state === "speaking" && <SpeakerIcon />}
          {state === "error" && <ErrorIcon />}
        </div>
      </button>

      {/* State label */}
      <div className={`orb-label ${state}`}>
        {state === "idle" && "Tap to speak"}
        {state === "listening" && "Listening..."}
        {state === "processing" && "Thinking..."}
        {state === "speaking" && "Speaking..."}
        {state === "error" && "Tap to retry"}
      </div>

      {/* Live transcript */}
      {transcript && (state === "listening" || state === "processing") && (
        <div className="orb-transcript">{transcript}</div>
      )}
    </div>
  );
}

function MicIcon() {
  return (
    <svg
      width="32"
      height="32"
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

function WaveformIcon() {
  return (
    <svg
      width="32"
      height="32"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
    >
      <line x1="4" y1="8" x2="4" y2="16" className="wave-bar wave-1" />
      <line x1="8" y1="5" x2="8" y2="19" className="wave-bar wave-2" />
      <line x1="12" y1="3" x2="12" y2="21" className="wave-bar wave-3" />
      <line x1="16" y1="5" x2="16" y2="19" className="wave-bar wave-4" />
      <line x1="20" y1="8" x2="20" y2="16" className="wave-bar wave-5" />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg
      width="32"
      height="32"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      className="orb-spinner"
    >
      <path d="M12 2a10 10 0 0 1 10 10" />
    </svg>
  );
}

function SpeakerIcon() {
  return (
    <svg
      width="32"
      height="32"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" className="speaker-wave-1" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14" className="speaker-wave-2" />
    </svg>
  );
}

function ErrorIcon() {
  return (
    <svg
      width="32"
      height="32"
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

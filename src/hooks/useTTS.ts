"use client";

import { useState, useCallback, useRef } from "react";

interface UseTTSReturn {
  speak: (text: string) => void;
  stop: () => void;
  isSpeaking: boolean;
  words: string[];
  currentWordIndex: number;
}

export function useTTS(): UseTTSReturn {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [words, setWords] = useState<string[]>([]);
  const [currentWordIndex, setCurrentWordIndex] = useState(-1);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const timePerWordRef = useRef(0);
  const lastWordIdxRef = useRef(-1);

  const speak = useCallback((text: string) => {
    if (typeof window === "undefined") return;

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }

    const wordList = text.trim().split(/\s+/).filter(Boolean);
    setWords(wordList);
    setCurrentWordIndex(-1);
    lastWordIdxRef.current = -1;
    timePerWordRef.current = 0;

    fetch("/api/voice/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    })
      .then((res) => {
        if (!res.ok)
          throw new Error(`TTS request failed: ${res.status} ${res.statusText}`);
        return res.blob();
      })
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        objectUrlRef.current = url;
        const audio = new Audio(url);
        audioRef.current = audio;

        setIsSpeaking(true);

        audio.onloadedmetadata = () => {
          if (wordList.length > 0) {
            timePerWordRef.current = audio.duration / wordList.length;
          }
        };

        audio.ontimeupdate = () => {
          const tpw = timePerWordRef.current;
          if (tpw === 0) return;
          const idx = Math.min(
            Math.floor(audio.currentTime / tpw),
            wordList.length - 1,
          );
          if (idx !== lastWordIdxRef.current) {
            lastWordIdxRef.current = idx;
            setCurrentWordIndex(idx);
          }
        };

        audio.onended = () => {
          setIsSpeaking(false);
          setWords([]);
          setCurrentWordIndex(-1);
          URL.revokeObjectURL(url);
          objectUrlRef.current = null;
        };

        audio.onerror = () => {
          console.error(
            "[TTS] Audio playback error:",
            audio.error?.message,
            "code:",
            audio.error?.code,
          );
          setIsSpeaking(false);
          setWords([]);
          setCurrentWordIndex(-1);
          URL.revokeObjectURL(url);
          objectUrlRef.current = null;
        };

        audio.play().catch((err: unknown) => {
          console.error("[TTS] audio.play() rejected:", err);
          setIsSpeaking(false);
          setWords([]);
          setCurrentWordIndex(-1);
          URL.revokeObjectURL(url);
          objectUrlRef.current = null;
          audioRef.current = null;
        });
      })
      .catch((err: unknown) => {
        console.error("[TTS] Fetch or blob error:", err);
        setIsSpeaking(false);
        setWords([]);
        setCurrentWordIndex(-1);
      });
  }, []);

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    setIsSpeaking(false);
    setWords([]);
    setCurrentWordIndex(-1);
  }, []);

  return { speak, stop, isSpeaking, words, currentWordIndex };
}

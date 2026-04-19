"use client";

import { useState, useCallback, useRef, useEffect } from "react";

interface UseVoiceReturn {
  transcript: string;
  isListening: boolean;
  isTranscribing: boolean;
  voiceLevel: number;
  confidence: number;
  error: string | null;
  startListening: () => Promise<boolean>;
  stopListening: (options?: { discard?: boolean }) => void;
  resetTranscript: () => void;
  isSupported: boolean;
}

/**
 * Custom hook for voice input using Web Speech API with Whisper fallback.
 * Provides real-time speech-to-text transcription.
 */
export function useVoice(): UseVoiceReturn {
  const AUTO_STOP_SILENCE_MS = 3500;
  const VOICE_ACTIVITY_THRESHOLD = 0.05;
  const [transcript, setTranscript] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [voiceLevel, setVoiceLevel] = useState(0);
  const [confidence, setConfidence] = useState(0);
  const [error, setError] = useState<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const speechFallbackRecorderRef = useRef<MediaRecorder | null>(null);
  const speechFallbackChunksRef = useRef<Blob[]>([]);
  const speechHasResultRef = useRef(false);
  const speechStopRequestedRef = useRef(false);
  const speechShouldTranscribeRef = useRef(false);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const meterAnimationRef = useRef<number | null>(null);
  const silenceTimeoutRef = useRef<number | null>(null);
  const silenceAutoStopEnabledRef = useRef(false);
  const micPermissionGrantedRef = useRef(false);
  const discardCaptureOnStopRef = useRef(false);
  const isSupported =
    typeof window !== "undefined" &&
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Boolean((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);

  const mapVoiceError = useCallback((errorCode: string) => {
    if (errorCode === "not-allowed" || errorCode === "service-not-allowed") {
      return "Microphone access is blocked. Enable microphone permission in Telegram/browser settings.";
    }
    if (errorCode === "audio-capture") {
      return "No microphone was detected on this device.";
    }
    if (errorCode === "network") {
      return "Network error while starting voice recognition.";
    }
    if (errorCode === "transcription") {
      return "Could not transcribe voice audio right now.";
    }
    if (errorCode === "unsupported") {
      return "Voice recognition is not supported in this Telegram client.";
    }
    return `Speech recognition error: ${errorCode}`;
  }, []);

  const setMicTracksEnabled = useCallback((enabled: boolean) => {
    const stream = mediaStreamRef.current;
    if (!stream) {
      return;
    }

    stream.getAudioTracks().forEach((track) => {
      track.enabled = enabled;
    });
  }, []);

  const stopVoiceLevelMeter = useCallback(() => {
    if (meterAnimationRef.current !== null) {
      window.cancelAnimationFrame(meterAnimationRef.current);
      meterAnimationRef.current = null;
    }

    try {
      sourceNodeRef.current?.disconnect();
    } catch {
      // no-op
    }
    sourceNodeRef.current = null;

    try {
      analyserRef.current?.disconnect();
    } catch {
      // no-op
    }
    analyserRef.current = null;

    const activeContext = audioContextRef.current;
    audioContextRef.current = null;
    if (activeContext && activeContext.state !== "closed") {
      void activeContext.close().catch(() => undefined);
    }

    setVoiceLevel(0);
  }, []);

  const clearSilenceTimeout = useCallback(() => {
    if (silenceTimeoutRef.current !== null) {
      window.clearTimeout(silenceTimeoutRef.current);
      silenceTimeoutRef.current = null;
    }
  }, []);

  const startVoiceLevelMeter = useCallback(async (stream: MediaStream) => {
    stopVoiceLevelMeter();

    if (typeof window === "undefined") {
      return;
    }

    try {
      const AudioContextCtor = window.AudioContext
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        || (window as any).webkitAudioContext;
      if (!AudioContextCtor) {
        return;
      }

      const context = new AudioContextCtor();
      audioContextRef.current = context;
      if (context.state === "suspended") {
        await context.resume();
      }

      const analyser = context.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.8;
      analyserRef.current = analyser;

      const sourceNode = context.createMediaStreamSource(stream);
      sourceNodeRef.current = sourceNode;
      sourceNode.connect(analyser);

      const data = new Uint8Array(analyser.fftSize);
      let smoothedLevel = 0;

      const tick = () => {
        if (!analyserRef.current) {
          return;
        }
        analyserRef.current.getByteTimeDomainData(data);
        let sumSquares = 0;
        for (let i = 0; i < data.length; i += 1) {
          const normalized = (data[i] - 128) / 128;
          sumSquares += normalized * normalized;
        }
        const rms = Math.sqrt(sumSquares / data.length);
        const boosted = Math.min(1, rms * 5.5);
        smoothedLevel = (smoothedLevel * 0.72) + (boosted * 0.28);
        setVoiceLevel(smoothedLevel < 0.02 ? 0 : smoothedLevel);

        if (silenceAutoStopEnabledRef.current) {
          if (smoothedLevel >= VOICE_ACTIVITY_THRESHOLD) {
            clearSilenceTimeout();
          } else if (silenceTimeoutRef.current === null) {
            silenceTimeoutRef.current = window.setTimeout(() => {
              silenceTimeoutRef.current = null;
              if (mediaRecorderRef.current?.state === "recording") {
                mediaRecorderRef.current.stop();
              }
            }, AUTO_STOP_SILENCE_MS);
          }
        }

        meterAnimationRef.current = window.requestAnimationFrame(tick);
      };

      meterAnimationRef.current = window.requestAnimationFrame(tick);
    } catch (meterError) {
      console.warn("[useVoice] Failed to start voice level meter:", meterError);
      stopVoiceLevelMeter();
    }
  }, [AUTO_STOP_SILENCE_MS, VOICE_ACTIVITY_THRESHOLD, clearSilenceTimeout, stopVoiceLevelMeter]);

  const ensureMicrophonePermission = useCallback(async () => {
    if (micPermissionGrantedRef.current && mediaStreamRef.current?.active) {
      return true;
    }

    try {
      if (navigator.permissions?.query) {
        try {
          const permissionStatus = await navigator.permissions.query({
            name: "microphone" as PermissionName,
          });
          if (permissionStatus.state === "denied") {
            setError(mapVoiceError("not-allowed"));
            return false;
          }
        } catch (permissionsError) {
          console.warn("[useVoice] Permissions API check unavailable:", permissionsError);
        }
      }

      if (!navigator.mediaDevices?.getUserMedia) {
        setError("Microphone access is not supported in this browser.");
        return false;
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      micPermissionGrantedRef.current = true;
      setMicTracksEnabled(false);
      setError(null);
      return true;
    } catch (permissionError) {
      const domErrorName = permissionError instanceof DOMException ? permissionError.name : "";
      const message = domErrorName === "NotFoundError"
        ? mapVoiceError("audio-capture")
        : mapVoiceError("not-allowed");
      micPermissionGrantedRef.current = false;
      setError(message);
      console.warn("[useVoice]", message, permissionError);
      return false;
    }
  }, [mapVoiceError, setMicTracksEnabled]);

  const transcribeAudioBlob = useCallback(async (audioBlob: Blob) => {
    setIsTranscribing(true);
    setError(null);

    const extension = audioBlob.type.includes("ogg")
      ? "ogg"
      : audioBlob.type.includes("mp4")
        ? "mp4"
        : "webm";
    const audioFile = new File([audioBlob], `jarvis-voice.${extension}`, {
      type: audioBlob.type || "audio/webm",
    });
    const formData = new FormData();
    formData.append("audio", audioFile);

    try {
      const response = await fetch("/api/voice/transcribe", {
        method: "POST",
        body: formData,
      });
      const payload = (await response.json()) as unknown;
      if (!response.ok) {
        if (typeof payload === "object" && payload !== null && "error" in payload) {
          const message = (payload as { error?: unknown }).error;
          throw new Error(typeof message === "string" ? message : mapVoiceError("transcription"));
        }
        throw new Error(mapVoiceError("transcription"));
      }

      const text = (
        typeof payload === "object"
        && payload !== null
        && "text" in payload
        && typeof (payload as { text?: unknown }).text === "string"
      )
        ? (payload as { text: string }).text.trim()
        : "";
      const confidenceScore = (
        typeof payload === "object"
        && payload !== null
        && "confidence" in payload
        && typeof (payload as { confidence?: unknown }).confidence === "number"
      )
        ? (payload as { confidence: number }).confidence
        : 0;

      if (!text) {
        setError("I couldn't catch that. Please try again.");
        return;
      }

      setTranscript(text);
      setConfidence(confidenceScore);
    } catch (transcriptionError) {
      const message = transcriptionError instanceof Error
        ? transcriptionError.message
        : mapVoiceError("transcription");
      setError(message);
      console.error("[useVoice] Transcription failed:", transcriptionError);
    } finally {
      setIsTranscribing(false);
    }
  }, [mapVoiceError]);

  const finishSpeechFallbackCapture = useCallback((shouldTranscribe: boolean) => {
    speechShouldTranscribeRef.current = shouldTranscribe;
    const recorder = speechFallbackRecorderRef.current;
    if (!recorder) {
      return;
    }

    if (recorder.state !== "inactive") {
      recorder.stop();
      return;
    }

    const chunks = speechFallbackChunksRef.current;
    speechFallbackRecorderRef.current = null;
    speechFallbackChunksRef.current = [];
    speechShouldTranscribeRef.current = false;

    if (!shouldTranscribe || chunks.length === 0) {
      return;
    }

    const blobType = recorder.mimeType || "audio/webm";
    const audioBlob = new Blob(chunks, { type: blobType });
    void transcribeAudioBlob(audioBlob);
  }, [transcribeAudioBlob]);

  const startSpeechFallbackCapture = useCallback((stream: MediaStream) => {
    if (typeof window === "undefined" || typeof MediaRecorder === "undefined") {
      return;
    }

    const activeRecorder = speechFallbackRecorderRef.current;
    if (activeRecorder && activeRecorder.state === "recording") {
      return;
    }

    try {
      speechFallbackChunksRef.current = [];
      speechShouldTranscribeRef.current = false;

      const mimeTypeOptions = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/ogg;codecs=opus",
        "audio/mp4",
      ];
      const supportedMimeType = mimeTypeOptions.find((candidate) => MediaRecorder.isTypeSupported(candidate));
      const recorder = supportedMimeType
        ? new MediaRecorder(stream, { mimeType: supportedMimeType })
        : new MediaRecorder(stream);

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          speechFallbackChunksRef.current.push(event.data);
        }
      };

      recorder.onerror = () => {
        console.warn("[useVoice] Speech fallback recorder error.");
      };

      recorder.onstop = () => {
        const shouldTranscribe = speechShouldTranscribeRef.current;
        const chunks = speechFallbackChunksRef.current;
        speechFallbackRecorderRef.current = null;
        speechFallbackChunksRef.current = [];
        speechShouldTranscribeRef.current = false;

        if (!shouldTranscribe || chunks.length === 0) {
          return;
        }

        const blobType = recorder.mimeType || "audio/webm";
        const audioBlob = new Blob(chunks, { type: blobType });
        void transcribeAudioBlob(audioBlob);
      };

      speechFallbackRecorderRef.current = recorder;
      recorder.start();
    } catch (fallbackCaptureError) {
      console.warn("[useVoice] Could not start speech fallback capture:", fallbackCaptureError);
      speechFallbackRecorderRef.current = null;
      speechFallbackChunksRef.current = [];
      speechShouldTranscribeRef.current = false;
    }
  }, [transcribeAudioBlob]);

  const startMediaRecorderFallback = useCallback(async () => {
    if (typeof window === "undefined" || typeof MediaRecorder === "undefined") {
      setError(mapVoiceError("unsupported"));
      return false;
    }

    const stream = mediaStreamRef.current;
    if (!stream) {
      setError(mapVoiceError("audio-capture"));
      return false;
    }

    try {
      recordedChunksRef.current = [];
      setTranscript("");
      setError(null);
      setConfidence(0);

      const mimeTypeOptions = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/ogg;codecs=opus",
        "audio/mp4",
      ];
      const supportedMimeType = mimeTypeOptions.find((candidate) => MediaRecorder.isTypeSupported(candidate));
      const recorder = supportedMimeType
        ? new MediaRecorder(stream, { mimeType: supportedMimeType })
        : new MediaRecorder(stream);

      recorder.onstart = () => {
        setIsListening(true);
        setMicTracksEnabled(true);
        silenceAutoStopEnabledRef.current = true;
        clearSilenceTimeout();
        const streamForMeter = mediaStreamRef.current;
        if (streamForMeter) {
          void startVoiceLevelMeter(streamForMeter);
        }
        window.Telegram?.WebApp?.HapticFeedback?.impactOccurred("light");
      };

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
        }
      };

      recorder.onerror = () => {
        setMicTracksEnabled(false);
        silenceAutoStopEnabledRef.current = false;
        clearSilenceTimeout();
        stopVoiceLevelMeter();
        setIsListening(false);
        setError("Microphone recording failed. Please try again.");
      };

      recorder.onstop = () => {
        setMicTracksEnabled(false);
        silenceAutoStopEnabledRef.current = false;
        clearSilenceTimeout();
        stopVoiceLevelMeter();
        setIsListening(false);
        mediaRecorderRef.current = null;

        if (discardCaptureOnStopRef.current) {
          discardCaptureOnStopRef.current = false;
          recordedChunksRef.current = [];
          setTranscript("");
          setConfidence(0);
          return;
        }

        if (recordedChunksRef.current.length === 0) {
          setError("I couldn't catch that. Try speaking a bit longer.");
          return;
        }

        const blobType = recorder.mimeType || "audio/webm";
        const audioBlob = new Blob(recordedChunksRef.current, { type: blobType });
        recordedChunksRef.current = [];
        void transcribeAudioBlob(audioBlob);
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      return true;
    } catch (recordingError) {
      setMicTracksEnabled(false);
      setIsListening(false);
      setError("Microphone recording failed to start.");
      console.warn("[useVoice] MediaRecorder start failed:", recordingError);
      return false;
    }
  }, [
    clearSilenceTimeout,
    mapVoiceError,
    setMicTracksEnabled,
    startVoiceLevelMeter,
    stopVoiceLevelMeter,
    transcribeAudioBlob,
  ]);

  const startListening = useCallback(async () => {
    if (isTranscribing) {
      setError("Please wait while I finish processing your last voice command.");
      return false;
    }

    discardCaptureOnStopRef.current = false;

    const hasPermission = await ensureMicrophonePermission();
    if (!hasPermission) {
      return false;
    }

    const isTelegramClient = Boolean(window.Telegram?.WebApp);
    if (isTelegramClient) {
      return startMediaRecorderFallback();
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      return startMediaRecorderFallback();
    }

    // Stop any existing recognition
    if (recognitionRef.current) {
      recognitionRef.current.abort();
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      speechHasResultRef.current = false;
      speechStopRequestedRef.current = false;
      setIsListening(true);
      setError(null);
      setTranscript("");
      setMicTracksEnabled(true);
      const streamForMeter = mediaStreamRef.current;
      if (streamForMeter) {
        void startVoiceLevelMeter(streamForMeter);
        startSpeechFallbackCapture(streamForMeter);
      }
      // Haptic feedback when speech starts
      window.Telegram?.WebApp?.HapticFeedback?.impactOccurred("light");
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (event: any) => {
      let interimTranscript = "";
      let finalTranscript = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalTranscript += result[0].transcript;
          setConfidence(result[0].confidence);
        } else {
          interimTranscript += result[0].transcript;
        }
      }

      if (finalTranscript.trim().length > 0) {
        speechHasResultRef.current = true;
      }
      setTranscript(finalTranscript || interimTranscript);
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onerror = (event: any) => {
      if (event.error === "aborted" || event.error === "no-speech") {
        setMicTracksEnabled(false);
        stopVoiceLevelMeter();
        setIsListening(false);
        return;
      }

      const message = mapVoiceError(event.error);
      setError(message);
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        micPermissionGrantedRef.current = false;
        console.warn("[useVoice]", message);
      } else {
        console.error("[useVoice]", message);
      }
      setMicTracksEnabled(false);
      stopVoiceLevelMeter();
      setIsListening(false);
    };

    recognition.onend = () => {
      setMicTracksEnabled(false);
      stopVoiceLevelMeter();
      setIsListening(false);
      silenceAutoStopEnabledRef.current = false;
      clearSilenceTimeout();
      const shouldFallbackTranscribe = !speechHasResultRef.current;
      finishSpeechFallbackCapture(shouldFallbackTranscribe);
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
      return true;
    } catch (startError) {
      const domErrorName = startError instanceof DOMException ? startError.name : "";
      const mappedError = domErrorName === "NotFoundError"
        ? "audio-capture"
        : domErrorName === "NotAllowedError"
          ? "not-allowed"
          : "network";
      const message = mapVoiceError(mappedError);
      finishSpeechFallbackCapture(false);
      if (mappedError === "not-allowed") {
        setError(message);
        setIsListening(false);
        console.warn("[useVoice]", message, startError);
        return false;
      }
      const startedFallback = await startMediaRecorderFallback();
      if (!startedFallback) {
        setError(message);
      }
      setIsListening(false);
      console.warn("[useVoice]", message, startError);
      return startedFallback;
    }
  }, [
    clearSilenceTimeout,
    ensureMicrophonePermission,
    finishSpeechFallbackCapture,
    isTranscribing,
    mapVoiceError,
    setMicTracksEnabled,
    startMediaRecorderFallback,
    startSpeechFallbackCapture,
    startVoiceLevelMeter,
    stopVoiceLevelMeter,
  ]);

  const stopListening = useCallback((options?: { discard?: boolean }) => {
    const shouldDiscard = Boolean(options?.discard);
    discardCaptureOnStopRef.current = shouldDiscard;

    if (recognitionRef.current) {
      speechStopRequestedRef.current = true;
      if (shouldDiscard) {
        speechHasResultRef.current = true;
        setTranscript("");
        setConfidence(0);
        finishSpeechFallbackCapture(false);
      }
      recognitionRef.current.stop();
      recognitionRef.current = null;
    } else if (mediaRecorderRef.current) {
      if (mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
    } else {
      finishSpeechFallbackCapture(false);
    }
    silenceAutoStopEnabledRef.current = false;
    clearSilenceTimeout();
    stopVoiceLevelMeter();
    setIsListening(false);
    // Haptic feedback when speech stops
    window.Telegram?.WebApp?.HapticFeedback?.impactOccurred("medium");
  }, [clearSilenceTimeout, finishSpeechFallbackCapture, stopVoiceLevelMeter]);

  const resetTranscript = useCallback(() => {
    setTranscript("");
    setConfidence(0);
    setError(null);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }

      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }

      finishSpeechFallbackCapture(false);
      silenceAutoStopEnabledRef.current = false;
      clearSilenceTimeout();
      stopVoiceLevelMeter();

      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
      }
    };
  }, [clearSilenceTimeout, finishSpeechFallbackCapture, stopVoiceLevelMeter]);

  return {
    transcript,
    isListening,
    isTranscribing,
    voiceLevel,
    confidence,
    error,
    startListening,
    stopListening,
    resetTranscript,
    isSupported,
  };
}

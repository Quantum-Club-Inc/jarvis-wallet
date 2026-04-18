"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";

import { ChatThread } from "@/components/ChatThread";
import { JarvisWelcome } from "@/components/JarvisWelcome";
import { TelegramInit, useTelegram } from "@/components/TelegramInit";
import { VoiceOrb, type OrbState } from "@/components/VoiceOrb";
import { WalletBar } from "@/components/WalletBar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useTTS } from "@/hooks/useTTS";
import { useVoice } from "@/hooks/useVoice";
import {
  generateWallet,
  loadWalletFromSecureStorage,
  storeWalletInSecureStorage,
} from "@/lib/ton/wallet-client";

const QUICK_PROMPTS = [
  "Show my TON wallet balance",
  "Help me stake my TON safely",
  "Explain what I can do with Jarvis",
] as const;

const WELCOME_STORAGE_NAMESPACE = "jarvis:welcome:v1";

function getWelcomeStorageKey(userId?: number) {
  return `${WELCOME_STORAGE_NAMESPACE}:${userId ?? "guest"}`;
}

function readLocalWelcomeState(key: string) {
  try {
    return window.localStorage.getItem(key) === "seen";
  } catch {
    return false;
  }
}

function writeLocalWelcomeState(key: string) {
  try {
    window.localStorage.setItem(key, "seen");
  } catch {
    // Ignore local storage restrictions in privacy modes.
  }
}

function readCloudWelcomeState(tg: TelegramWebApp, key: string) {
  return new Promise<string | null>((resolve) => {
    try {
      tg.CloudStorage.getItem(key, (error, value) => {
        if (error) {
          console.error("[Welcome] Failed to read Telegram CloudStorage:", error);
          resolve(null);
          return;
        }

        resolve(value ?? null);
      });
    } catch (error) {
      console.error("[Welcome] Telegram CloudStorage read threw:", error);
      resolve(null);
    }
  });
}

function writeCloudWelcomeState(tg: TelegramWebApp, key: string) {
  return new Promise<void>((resolve) => {
    try {
      tg.CloudStorage.setItem(key, "seen", (error) => {
        if (error) {
          console.error("[Welcome] Failed to write Telegram CloudStorage:", error);
        }

        resolve();
      });
    } catch (error) {
      console.error("[Welcome] Telegram CloudStorage write threw:", error);
      resolve();
    }
  });
}

function JarvisApp() {
  const { isReady, isTelegram, user, authError, authState } = useTelegram();
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [walletBalance] = useState<string | null>(null);
  const [view, setView] = useState<"voice" | "chat">("voice");
  const [orbState, setOrbState] = useState<OrbState>("idle");
  const [textInput, setTextInput] = useState("");
  const [walletLoading, setWalletLoading] = useState(true);
  const [welcomeMode, setWelcomeMode] = useState<"first" | "returning">("first");
  const [welcomeReady, setWelcomeReady] = useState(false);

  const {
    transcript,
    isListening,
    resetTranscript,
    startListening,
    stopListening,
  } = useVoice();
  const { speak, stop: stopSpeaking, isSpeaking } = useTTS();

  useEffect(() => {
    if (!isReady) {
      return;
    }

    let active = true;

    async function syncWalletToFirestore(address: string) {
      try {
        await fetch("/api/wallet/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ walletAddress: address }),
        });
      } catch (err) {
        console.warn("[Wallet] Failed to sync address to Firestore:", err);
      }
    }

    async function initWallet() {
      try {
        const storedWallet = await loadWalletFromSecureStorage();
        if (!active) {
          return;
        }

        if (storedWallet) {
          setWalletAddress(storedWallet.address);
          void syncWalletToFirestore(storedWallet.address);
          return;
        }

        const wallet = await generateWallet();
        if (!active) {
          return;
        }

        const stored = await storeWalletInSecureStorage(
          wallet.mnemonic,
          wallet.address,
        );

        if (!active) {
          return;
        }

        if (!stored) {
          console.error("[Wallet] Failed to store wallet in Telegram SecureStorage");
        }

        setWalletAddress(wallet.address);
        void syncWalletToFirestore(wallet.address);
      } catch (error) {
        console.error("[Wallet] Init error:", error);
      } finally {
        if (active) {
          setWalletLoading(false);
        }
      }
    }

    void initWallet();

    return () => {
      active = false;
    };
  }, [isReady]);

  useEffect(() => {
    if (!isReady) {
      return;
    }

    let active = true;
    const key = getWelcomeStorageKey(user?.id);
    const tg = window.Telegram?.WebApp;

    async function resolveWelcomeState() {
      let seen = readLocalWelcomeState(key);

      if (!seen && tg && user?.id) {
        const cloudValue = await readCloudWelcomeState(tg, key);
        seen = cloudValue === "seen";
      }

      if (!active) {
        return;
      }

      setWelcomeMode(seen ? "returning" : "first");
      setWelcomeReady(true);

      if (!seen) {
        writeLocalWelcomeState(key);
        if (tg && user?.id) {
          void writeCloudWelcomeState(tg, key);
        }
      }
    }

    void resolveWelcomeState();

    return () => {
      active = false;
    };
  }, [isReady, user?.id]);

  const { messages, sendMessage, status, error } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/chat",
      body: { walletAddress },
    }),
    onFinish: ({ message }: { message: UIMessage }) => {
      if (message.role !== "assistant") {
        return;
      }

      const textPart = message.parts.find((part) => part.type === "text" && part.text);
      if (textPart?.type === "text" && textPart.text) {
        setView("chat");
        speak(textPart.text);
      }
    },
    onError: () => {
      setOrbState("error");
      setTimeout(() => setOrbState("idle"), 2000);
    },
  });

  const isLoading = status === "submitted" || status === "streaming";
  const firstName = user?.first_name?.trim() || "there";
  const inlineNotice = error?.message ?? authError;
  const displayOrbState: OrbState = isLoading
    ? "processing"
    : isSpeaking
      ? "speaking"
      : orbState === "processing" || orbState === "speaking"
        ? "idle"
        : orbState;

  useEffect(() => {
    if (!isListening && transcript && orbState === "listening") {
      sendMessage({ text: transcript });
      resetTranscript();
    }
  }, [isListening, orbState, resetTranscript, sendMessage, transcript]);

  const handleOrbPress = useCallback(() => {
    if (isSpeaking) {
      stopSpeaking();
      setOrbState("idle");
      return;
    }

    if (orbState === "listening") {
      stopListening();
      return;
    }

    if (isLoading) {
      return;
    }

    stopSpeaking();
    startListening();
    setOrbState("listening");
  }, [isLoading, isSpeaking, orbState, startListening, stopListening, stopSpeaking]);

  const handleQuickPrompt = useCallback(
    (prompt: string) => {
      if (isLoading) {
        return;
      }

      stopSpeaking();
      resetTranscript();
      setView("chat");
      sendMessage({ text: prompt });
    },
    [isLoading, resetTranscript, sendMessage, stopSpeaking],
  );

  const handleTextSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!textInput.trim() || isLoading) {
        return;
      }

      sendMessage({ text: textInput });
      setTextInput("");
    },
    [isLoading, sendMessage, textInput],
  );

  if (!isReady || walletLoading || !welcomeReady) {
    return (
      <div className="app-container app-loading-screen">
        <div className="app-loading-mark">
          <Badge variant="secondary" className="text-[11px] tracking-widest uppercase">
            {!isReady ? "Opening session" : walletLoading ? "Securing wallet" : "Preparing welcome"}
          </Badge>
          <h1 className="app-loading-title">Jarvis</h1>
          <p className="app-loading-body">
            {!isReady && "Connecting to Telegram and calibrating the viewport."}
            {isReady && walletLoading && "Checking Telegram secure storage and loading your wallet."}
            {isReady && !walletLoading && "Setting your personalized welcome state."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      <WalletBar
        address={walletAddress}
        balance={walletBalance}
        isConnected={Boolean(walletAddress)}
      />

      <div className="view-toggle">
        <Button
          variant={view === "voice" ? "secondary" : "ghost"}
          size="sm"
          className="text-xs tracking-wider uppercase rounded-full"
          onClick={() => setView("voice")}
        >
          Voice
        </Button>
        <Button
          variant={view === "chat" ? "secondary" : "ghost"}
          size="sm"
          className="text-xs tracking-wider uppercase rounded-full"
          onClick={() => setView("chat")}
        >
          Chat
        </Button>
      </div>

      {inlineNotice && (
        <div className="app-inline-notice">{inlineNotice}</div>
      )}

      {view === "voice" ? (
        <section className="voice-view">
          <JarvisWelcome
            firstName={firstName}
            isReturning={welcomeMode === "returning"}
            isTelegram={isTelegram}
            isWalletReady={Boolean(walletAddress)}
            authState={authState}
            authError={authError}
          />

          <div className="quick-prompt-row">
            {QUICK_PROMPTS.map((prompt) => (
              <Button
                key={prompt}
                variant="outline"
                size="sm"
                className="quick-prompt-pill rounded-full whitespace-nowrap"
                disabled={isLoading}
                onClick={() => handleQuickPrompt(prompt)}
              >
                {prompt}
              </Button>
            ))}
          </div>

          <VoiceOrb
            state={displayOrbState}
            onPress={handleOrbPress}
            transcript={transcript}
          />
        </section>
      ) : (
        <>
          <ChatThread messages={messages} isLoading={isLoading} />

          <div className="chat-fab-wrap">
            <Button
              size="icon-lg"
              className={`voice-orb chat-fab ${displayOrbState} rounded-full`}
              onClick={handleOrbPress}
              aria-label="Voice input"
            >
              <div className="orb-inner" style={{ transform: "scale(0.6)" }}>
                {displayOrbState === "listening" ? (
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
                ) : (
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
                )}
              </div>
            </Button>
          </div>

          <form className="text-input-bar" onSubmit={handleTextSubmit}>
            <input
              className="text-input"
              type="text"
              placeholder="Ask Jarvis anything about your wallet..."
              value={textInput}
              onChange={(event) => setTextInput(event.target.value)}
            />
            <Button
              size="icon"
              className="send-button rounded-full"
              type="submit"
              disabled={!textInput.trim() || isLoading}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
              </svg>
            </Button>
          </form>
        </>
      )}
    </div>
  );
}

export default function Home() {
  return (
    <TelegramInit>
      <JarvisApp />
    </TelegramInit>
  );
}

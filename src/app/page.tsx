"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { TelegramInit, useTelegram } from "@/components/TelegramInit";
import { VoiceOrb, type OrbState } from "@/components/VoiceOrb";
import { ChatThread } from "@/components/ChatThread";
import { WalletBar } from "@/components/WalletBar";
import { useVoice } from "@/hooks/useVoice";
import { useTTS } from "@/hooks/useTTS";
import {
  generateWallet,
  loadWalletFromSecureStorage,
  storeWalletInSecureStorage,
} from "@/lib/ton/wallet-client";

function JarvisApp() {
  const { isReady, isTelegram } = useTelegram();
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [walletBalance] = useState<string | null>(null);
  const [view, setView] = useState<"voice" | "chat">("voice");
  const [orbState, setOrbState] = useState<OrbState>("idle");
  const [textInput, setTextInput] = useState("");
  const [walletLoading, setWalletLoading] = useState(true);
  const prevMessagesLenRef = useRef(0);

  // Load or create wallet on mount
  useEffect(() => {
    if (!isReady) return;

    async function initWallet() {
      try {
        // Try to load existing wallet
        const stored = await loadWalletFromSecureStorage();
        if (stored) {
          setWalletAddress(stored.address);
          setWalletLoading(false);
          return;
        }

        // No wallet found — generate a new one
        const wallet = await generateWallet();
        const stored2 = await storeWalletInSecureStorage(
          wallet.mnemonic,
          wallet.address,
        );

        if (stored2) {
          setWalletAddress(wallet.address);
          console.log("[Wallet] Created and stored:", wallet.address);
        } else {
          console.error("[Wallet] Failed to store wallet");
          // Still use it for the session
          setWalletAddress(wallet.address);
        }
      } catch (err) {
        console.error("[Wallet] Init error:", err);
      } finally {
        setWalletLoading(false);
      }
    }

    initWallet();
  }, [isReady]);

  // AI Chat — v6 API using sendMessage + status
  const {
    messages,
    sendMessage,
    status,
    error,
  } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/chat",
      body: { walletAddress },
    }),
    onFinish: ({ message }: { message: UIMessage }) => {
      if (message.role === "assistant") {
        const textPart = message.parts.find(
          (p) => p.type === "text" && p.text,
        );
        if (textPart && textPart.type === "text" && textPart.text) {
          speak(textPart.text);
          setOrbState("speaking");
        }
      }
    },
    onError: () => {
      setOrbState("error");
      setTimeout(() => setOrbState("idle"), 2000);
    },
  });

  const isLoading = status === "submitted" || status === "streaming";

  // Voice
  const voice = useVoice();
  const { speak, stop: stopSpeaking, isSpeaking } = useTTS();

  // Update orb state based on speaking
  useEffect(() => {
    if (isSpeaking) {
      setOrbState("speaking");
    } else if (orbState === "speaking") {
      setOrbState("idle");
    }
  }, [isSpeaking, orbState]);

  // Update orb state when loading
  useEffect(() => {
    if (isLoading && orbState !== "processing") {
      setOrbState("processing");
    } else if (!isLoading && orbState === "processing") {
      setOrbState("idle");
    }
  }, [isLoading, orbState]);

  // When voice transcript finishes, send to agent
  useEffect(() => {
    if (
      !voice.isListening &&
      voice.transcript &&
      orbState === "listening"
    ) {
      setOrbState("processing");
      sendMessage({ text: voice.transcript });
      voice.resetTranscript();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voice.isListening]);

  // Auto-switch to chat view when messages arrive
  useEffect(() => {
    if (messages.length > prevMessagesLenRef.current && view === "voice") {
      const hasAssistant = messages.some((m) => m.role === "assistant");
      if (hasAssistant && messages.length > 2) {
        setView("chat");
      }
    }
    prevMessagesLenRef.current = messages.length;
  }, [messages, view]);

  const handleOrbPress = useCallback(() => {
    if (orbState === "speaking") {
      stopSpeaking();
      setOrbState("idle");
      return;
    }

    if (orbState === "listening") {
      voice.stopListening();
      return;
    }

    if (orbState === "processing") return;

    // Start listening
    stopSpeaking();
    voice.startListening();
    setOrbState("listening");
  }, [orbState, voice, stopSpeaking]);

  const handleTextSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!textInput.trim() || isLoading) return;
    sendMessage({ text: textInput });
    setTextInput("");
  };

  if (!isReady || walletLoading) {
    return (
      <div className="app-container">
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            flex: 1,
            gap: 12,
          }}
        >
          <div className="voice-orb idle" style={{ width: 60, height: 60 }}>
            <div className="orb-inner" style={{ transform: "scale(0.5)" }}>
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
            </div>
          </div>
          <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
            {walletLoading ? "Loading wallet..." : "Initializing..."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      {/* Wallet Status Bar */}
      <WalletBar
        address={walletAddress}
        balance={walletBalance}
        isConnected={!!walletAddress}
      />

      {/* View Toggle */}
      <div className="view-toggle">
        <button
          className={`toggle-btn ${view === "voice" ? "active" : ""}`}
          onClick={() => setView("voice")}
        >
          Voice
        </button>
        <button
          className={`toggle-btn ${view === "chat" ? "active" : ""}`}
          onClick={() => setView("chat")}
        >
          Chat
        </button>
      </div>

      {/* Voice View */}
      {view === "voice" && (
        <VoiceOrb
          state={orbState}
          onPress={handleOrbPress}
          transcript={voice.transcript}
        />
      )}

      {/* Chat View */}
      {view === "chat" && (
        <>
          <ChatThread messages={messages} isLoading={isLoading} />

          {/* Floating mic button in chat mode */}
          <div style={{ position: "absolute", bottom: 70, right: 16, zIndex: 20 }}>
            <button
              className={`voice-orb ${orbState}`}
              onClick={handleOrbPress}
              style={{ width: 48, height: 48 }}
              aria-label="Voice input"
            >
              <div className="orb-inner" style={{ transform: "scale(0.6)" }}>
                {orbState === "listening" ? (
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <line x1="4" y1="8" x2="4" y2="16" className="wave-bar wave-1" />
                    <line x1="8" y1="5" x2="8" y2="19" className="wave-bar wave-2" />
                    <line x1="12" y1="3" x2="12" y2="21" className="wave-bar wave-3" />
                    <line x1="16" y1="5" x2="16" y2="19" className="wave-bar wave-4" />
                    <line x1="20" y1="8" x2="20" y2="16" className="wave-bar wave-5" />
                  </svg>
                ) : (
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="9" y="2" width="6" height="11" rx="3" />
                    <path d="M5 10a7 7 0 0 0 14 0" />
                    <line x1="12" y1="19" x2="12" y2="22" />
                  </svg>
                )}
              </div>
            </button>
          </div>

          {/* Text input bar */}
          <form className="text-input-bar" onSubmit={handleTextSubmit}>
            <input
              className="text-input"
              type="text"
              placeholder="Type a message..."
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
            />
            <button
              className="send-button"
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
            </button>
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

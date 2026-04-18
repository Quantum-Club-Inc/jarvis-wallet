"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

interface TelegramContextValue {
  isReady: boolean;
  isTelegram: boolean;
  user: TelegramWebAppUser | null;
  colorScheme: "light" | "dark";
  themeParams: TelegramThemeParams | null;
  startParam: string | null;
}

const TelegramContext = createContext<TelegramContextValue>({
  isReady: false,
  isTelegram: false,
  user: null,
  colorScheme: "dark",
  themeParams: null,
  startParam: null,
});

export function useTelegram() {
  return useContext(TelegramContext);
}

export function TelegramInit({ children }: { children: ReactNode }) {
  const [ctx, setCtx] = useState<TelegramContextValue>({
    isReady: false,
    isTelegram: false,
    user: null,
    colorScheme: "dark",
    themeParams: null,
    startParam: null,
  });

  useEffect(() => {
    const tg = window.Telegram?.WebApp;

    if (!tg) {
      // Not running inside Telegram — dev mode
      console.log("[TelegramInit] Not inside Telegram, running in dev mode");
      setCtx({
        isReady: true,
        isTelegram: false,
        user: null,
        colorScheme: "dark",
        themeParams: null,
        startParam: null,
      });
      return;
    }

    // Signal that the Mini App is ready
    tg.ready();

    // Go full-screen
    try {
      tg.requestFullscreen();
    } catch {
      tg.expand();
    }

    // Disable vertical swipes (prevents accidental closure)
    try {
      tg.disableVerticalSwipes();
    } catch {
      // Not supported in older versions
    }

    // Set dark theme colors
    tg.setHeaderColor("#060B16");
    tg.setBackgroundColor("#060B16");
    try {
      tg.setBottomBarColor("#060B16");
    } catch {
      // Not supported in older versions
    }

    // Enable closing confirmation
    tg.enableClosingConfirmation();

    setCtx({
      isReady: true,
      isTelegram: true,
      user: tg.initDataUnsafe?.user ?? null,
      colorScheme: tg.colorScheme,
      themeParams: tg.themeParams,
      startParam: tg.initDataUnsafe?.start_param ?? null,
    });
  }, []);

  return (
    <TelegramContext.Provider value={ctx}>{children}</TelegramContext.Provider>
  );
}

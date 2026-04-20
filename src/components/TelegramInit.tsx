"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { useAuth } from "@/context/auth";

type TelegramAuthState =
  | "idle"
  | "authenticating"
  | "authenticated"
  | "error";

interface TelegramContextValue {
  isReady: boolean;
  isTelegram: boolean;
  user: TelegramWebAppUser | null;
  colorScheme: "light" | "dark";
  themeParams: TelegramThemeParams | null;
  startParam: string | null;
  initData: string | null;
  isFullscreen: boolean;
  viewportHeight: number;
  authState: TelegramAuthState;
  authError: string | null;
}

const TelegramContext = createContext<TelegramContextValue>({
  isReady: false,
  isTelegram: false,
  user: null,
  colorScheme: "dark",
  themeParams: null,
  startParam: null,
  initData: null,
  isFullscreen: false,
  viewportHeight: 0,
  authState: "idle",
  authError: null,
});

export function useTelegram() {
  return useContext(TelegramContext);
}

const FULLSCREEN_VERSION = "8.0";
const SWIPES_VERSION = "7.7";
const APP_CHROME_COLOR = "#000000";
const TELEGRAM_MOBILE_PLATFORMS = new Set(["android", "ios"]);
const DEFAULT_CONTEXT: TelegramContextValue = {
  isReady: false,
  isTelegram: false,
  user: null,
  colorScheme: "dark",
  themeParams: null,
  startParam: null,
  initData: null,
  isFullscreen: false,
  viewportHeight: 0,
  authState: "idle",
  authError: null,
};

function setCssVar(name: string, value: string) {
  document.documentElement.style.setProperty(name, value);
}

function applyInsetVars(prefix: string, inset: TelegramSafeAreaInset | undefined) {
  setCssVar(`${prefix}-top`, `${inset?.top ?? 0}px`);
  setCssVar(`${prefix}-bottom`, `${inset?.bottom ?? 0}px`);
  setCssVar(`${prefix}-left`, `${inset?.left ?? 0}px`);
  setCssVar(`${prefix}-right`, `${inset?.right ?? 0}px`);
}

function syncTelegramCssVars(tg: TelegramWebApp | null) {
  const fallbackHeight = window.innerHeight;

  if (!tg) {
    setCssVar("--tg-viewport-height", `${fallbackHeight}px`);
    applyInsetVars("--tg-safe-area-inset", undefined);
    applyInsetVars("--tg-content-safe-area-inset", undefined);
    return;
  }

  const nextHeight = tg.viewportStableHeight || tg.viewportHeight || fallbackHeight;
  setCssVar("--tg-viewport-height", `${nextHeight}px`);
  applyInsetVars("--tg-safe-area-inset", tg.safeAreaInset);
  applyInsetVars("--tg-content-safe-area-inset", tg.contentSafeAreaInset);
}

function readTelegramState(tg: TelegramWebApp): Omit<
  TelegramContextValue,
  "isReady" | "authState" | "authError"
> {
  return {
    isTelegram: true,
    user: tg.initDataUnsafe?.user ?? null,
    colorScheme: tg.colorScheme ?? "dark",
    themeParams: tg.themeParams ?? null,
    startParam: tg.initDataUnsafe?.start_param ?? null,
    initData: tg.initData || null,
    isFullscreen: Boolean(tg.isFullscreen),
    viewportHeight:
      tg.viewportStableHeight || tg.viewportHeight || window.innerHeight,
  };
}

function applyTelegramChrome(tg: TelegramWebApp) {
  tg.setHeaderColor(APP_CHROME_COLOR);
  tg.setBackgroundColor(APP_CHROME_COLOR);

  try {
    tg.setBottomBarColor(APP_CHROME_COLOR);
  } catch {
    // Older Telegram clients do not support bottom bar colors.
  }
}

function isMobileBrowserDevice(): boolean {
  const ua = navigator.userAgent.toLowerCase();
  const isMobileUa = /android|iphone|ipad|ipod|mobile/.test(ua);
  const isTouchDevice = navigator.maxTouchPoints > 1;
  return isMobileUa || isTouchDevice;
}

function shouldUseMobileFullscreen(tg: TelegramWebApp): boolean {
  const platform = (tg.platform ?? "").toLowerCase();

  if (TELEGRAM_MOBILE_PLATFORMS.has(platform)) {
    return true;
  }

  if (
    platform === "tdesktop" ||
    platform === "macos" ||
    platform === "web" ||
    platform === "weba" ||
    platform === "webk"
  ) {
    return false;
  }

  return isMobileBrowserDevice();
}

function getInitialTelegramContext(): TelegramContextValue {
  if (typeof window === "undefined") {
    return DEFAULT_CONTEXT;
  }

  const tg = window.Telegram?.WebApp;
  if (!tg) {
    return {
      ...DEFAULT_CONTEXT,
      isReady: true,
      viewportHeight: window.innerHeight,
    };
  }

  return {
    ...DEFAULT_CONTEXT,
    isTelegram: true,
    viewportHeight: window.innerHeight,
    isReady: false,
  };
}

export function TelegramInit({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const currentUser = auth?.currentUser;
  const loginWithTelegram = auth?.loginWithTelegram;
  const [ctx, setCtx] = useState<TelegramContextValue>(getInitialTelegramContext);
  const [authState, setAuthState] = useState<TelegramAuthState>("idle");
  const [authError, setAuthError] = useState<string | null>(null);
  const attemptedInitDataRef = useRef<string | null>(null);

  useEffect(() => {
    const tg = window.Telegram?.WebApp;

    if (!tg) {
      const syncBrowserViewport = () => syncTelegramCssVars(null);

      syncTelegramCssVars(null);
      window.addEventListener("resize", syncBrowserViewport);
      return () => {
        window.removeEventListener("resize", syncBrowserViewport);
      };
    }

    tg.ready();
    applyTelegramChrome(tg);

    const shouldUseFullscreen = shouldUseMobileFullscreen(tg);

    if (shouldUseFullscreen) {
      tg.expand();
    }
    try {
      tg.enableClosingConfirmation();
    } catch {
      // Ignore Telegram versions without closing confirmation support.
    }

    if (tg.isVersionAtLeast(SWIPES_VERSION)) {
      try {
        tg.disableVerticalSwipes();
      } catch {
        // Some clients report support but still throw.
      }
    }

    const syncState = () => {
      syncTelegramCssVars(tg);
      setCtx((current) => ({
        ...current,
        ...readTelegramState(tg),
        isReady: true,
      }));
    };

    const handleThemeChanged = () => {
      applyTelegramChrome(tg);
      syncState();
    };

    const handleFullscreenFailed = () => {
      if (shouldUseFullscreen) {
        tg.expand();
      }
      syncState();
    };

    requestAnimationFrame(syncState);

    if (tg.isVersionAtLeast(FULLSCREEN_VERSION)) {
      if (shouldUseFullscreen && !tg.isFullscreen) {
        try {
          tg.requestFullscreen();
        } catch {
          tg.expand();
        }
      } else if (!shouldUseFullscreen && tg.isFullscreen) {
        try {
          tg.exitFullscreen();
        } catch {
          // Ignore Telegram clients that do not allow exiting fullscreen here.
        }
      }
    }

    tg.onEvent("themeChanged", handleThemeChanged);
    tg.onEvent("viewportChanged", syncState);
    tg.onEvent("safeAreaChanged", syncState);
    tg.onEvent("contentSafeAreaChanged", syncState);
    tg.onEvent("fullscreenChanged", syncState);
    tg.onEvent("fullscreenFailed", handleFullscreenFailed);
    window.addEventListener("resize", syncState);

    return () => {
      tg.offEvent("themeChanged", handleThemeChanged);
      tg.offEvent("viewportChanged", syncState);
      tg.offEvent("safeAreaChanged", syncState);
      tg.offEvent("contentSafeAreaChanged", syncState);
      tg.offEvent("fullscreenChanged", syncState);
      tg.offEvent("fullscreenFailed", handleFullscreenFailed);
      window.removeEventListener("resize", syncState);
    };
  }, []);

  useEffect(() => {
    if (currentUser) {
      return;
    }

    const initData = ctx.initData;

    if (!ctx.isReady || !ctx.isTelegram || !initData || !loginWithTelegram) {
      return;
    }

    if (attemptedInitDataRef.current === initData) {
      return;
    }

    attemptedInitDataRef.current = initData;
    let active = true;

    void (async () => {
      setAuthState("authenticating");
      setAuthError(null);

      const result = await loginWithTelegram({ initData });
      if (!active) {
        return;
      }

      setAuthState(
        result.success ? "authenticated" : result.error ? "error" : "idle",
      );
      setAuthError(result.error);
    })();

    return () => {
      active = false;
    };
  }, [
    currentUser,
    ctx.initData,
    ctx.isReady,
    ctx.isTelegram,
    loginWithTelegram,
  ]);

  const value: TelegramContextValue = {
    ...ctx,
    authState: currentUser ? "authenticated" : authState,
    authError: currentUser ? null : authError,
  };

  return (
    <TelegramContext.Provider value={value}>{children}</TelegramContext.Provider>
  );
}

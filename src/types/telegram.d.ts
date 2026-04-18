/**
 * Type declarations for the Telegram Mini App WebApp API.
 * Loaded via <script src="https://telegram.org/js/telegram-web-app.js">
 *
 * All types are in the global scope so they can be used anywhere
 * without explicit imports.
 */

/* eslint-disable no-var */

declare global {
  interface TelegramWebAppUser {
    id: number;
    is_bot?: boolean;
    first_name: string;
    last_name?: string;
    username?: string;
    language_code?: string;
    is_premium?: boolean;
    photo_url?: string;
  }

  interface TelegramWebAppChat {
    id: number;
    type: string;
    title?: string;
    username?: string;
    photo_url?: string;
  }

  interface TelegramWebAppInitData {
    query_id?: string;
    user?: TelegramWebAppUser;
    receiver?: TelegramWebAppUser;
    chat?: TelegramWebAppChat;
    chat_type?: string;
    chat_instance?: string;
    start_param?: string;
    can_send_after?: number;
    auth_date: number;
    hash: string;
  }

  interface TelegramThemeParams {
    bg_color?: string;
    text_color?: string;
    hint_color?: string;
    link_color?: string;
    button_color?: string;
    button_text_color?: string;
    secondary_bg_color?: string;
    header_bg_color?: string;
    bottom_bar_bg_color?: string;
    accent_text_color?: string;
    section_bg_color?: string;
    section_header_text_color?: string;
    section_separator_color?: string;
    subtitle_text_color?: string;
    destructive_text_color?: string;
  }

  interface TelegramSafeAreaInset {
    top: number;
    bottom: number;
    left: number;
    right: number;
  }

  interface TelegramHapticFeedback {
    impactOccurred(
      style: "light" | "medium" | "heavy" | "rigid" | "soft",
    ): TelegramHapticFeedback;
    notificationOccurred(
      type: "error" | "success" | "warning",
    ): TelegramHapticFeedback;
    selectionChanged(): TelegramHapticFeedback;
  }

  interface TelegramSecureStorage {
    setItem(
      key: string,
      value: string,
      callback?: (error: string | null, success: boolean) => void,
    ): TelegramSecureStorage;
    getItem(
      key: string,
      callback: (error: string | null, value: string | null) => void,
    ): TelegramSecureStorage;
    removeItem(
      key: string,
      callback?: (error: string | null, success: boolean) => void,
    ): TelegramSecureStorage;
  }

  interface TelegramBottomButton {
    text: string;
    color: string;
    textColor: string;
    isVisible: boolean;
    isActive: boolean;
    isProgressVisible: boolean;
    setText(text: string): TelegramBottomButton;
    onClick(callback: () => void): TelegramBottomButton;
    offClick(callback: () => void): TelegramBottomButton;
    show(): TelegramBottomButton;
    hide(): TelegramBottomButton;
    enable(): TelegramBottomButton;
    disable(): TelegramBottomButton;
    showProgress(leaveActive?: boolean): TelegramBottomButton;
    hideProgress(): TelegramBottomButton;
    setParams(params: Record<string, unknown>): TelegramBottomButton;
  }

  interface TelegramBackButton {
    isVisible: boolean;
    onClick(callback: () => void): TelegramBackButton;
    offClick(callback: () => void): TelegramBackButton;
    show(): TelegramBackButton;
    hide(): TelegramBackButton;
  }

  interface TelegramCloudStorage {
    setItem(
      key: string,
      value: string,
      callback?: (error: string | null, success: boolean) => void,
    ): TelegramCloudStorage;
    getItem(
      key: string,
      callback: (error: string | null, value: string) => void,
    ): TelegramCloudStorage;
    getItems(
      keys: string[],
      callback: (
        error: string | null,
        values: Record<string, string>,
      ) => void,
    ): TelegramCloudStorage;
    removeItem(
      key: string,
      callback?: (error: string | null, success: boolean) => void,
    ): TelegramCloudStorage;
    removeItems(
      keys: string[],
      callback?: (error: string | null, success: boolean) => void,
    ): TelegramCloudStorage;
    getKeys(
      callback: (error: string | null, keys: string[]) => void,
    ): TelegramCloudStorage;
  }

  interface TelegramWebApp {
    initData: string;
    initDataUnsafe: TelegramWebAppInitData;
    version: string;
    platform: string;
    colorScheme: "light" | "dark";
    themeParams: TelegramThemeParams;
    isExpanded: boolean;
    viewportHeight: number;
    viewportStableHeight: number;
    headerColor: string;
    backgroundColor: string;
    bottomBarColor: string;
    isClosingConfirmationEnabled: boolean;
    isVerticalSwipesEnabled: boolean;
    isFullscreen: boolean;
    isActive: boolean;
    safeAreaInset: TelegramSafeAreaInset;
    contentSafeAreaInset: TelegramSafeAreaInset;
    BackButton: TelegramBackButton;
    MainButton: TelegramBottomButton;
    SecondaryButton: TelegramBottomButton;
    HapticFeedback: TelegramHapticFeedback;
    CloudStorage: TelegramCloudStorage;
    SecureStorage: TelegramSecureStorage;

    ready(): void;
    expand(): void;
    close(): void;
    requestFullscreen(): void;
    exitFullscreen(): void;
    enableClosingConfirmation(): void;
    disableClosingConfirmation(): void;
    enableVerticalSwipes(): void;
    disableVerticalSwipes(): void;
    setHeaderColor(color: string): void;
    setBackgroundColor(color: string): void;
    setBottomBarColor(color: string): void;

    sendData(data: string): void;
    openLink(url: string, options?: { try_instant_view?: boolean }): void;
    openTelegramLink(url: string): void;
    showPopup(
      params: {
        title?: string;
        message: string;
        buttons?: Array<{
          id?: string;
          type?: "default" | "ok" | "close" | "cancel" | "destructive";
          text?: string;
        }>;
      },
      callback?: (buttonId: string) => void,
    ): void;
    showAlert(message: string, callback?: () => void): void;
    showConfirm(
      message: string,
      callback?: (confirmed: boolean) => void,
    ): void;

    onEvent(
      eventType: string,
      eventHandler: (...args: unknown[]) => void,
    ): void;
    offEvent(
      eventType: string,
      eventHandler: (...args: unknown[]) => void,
    ): void;

    isVersionAtLeast(version: string): boolean;
  }

  interface TelegramNamespace {
    WebApp: TelegramWebApp;
  }

  interface Window {
    Telegram?: TelegramNamespace;
  }
}

export {};
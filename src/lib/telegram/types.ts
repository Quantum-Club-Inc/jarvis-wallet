export type TelegramUser = {
  id: number;
  is_bot: boolean;
  first_name: string;
  username?: string;
  language_code?: string;
};

export type TelegramChat = {
  id: number;
  type: string;
  username?: string;
  first_name?: string;
  last_name?: string;
};

export type TelegramManagedBotCreated = {
  bot: TelegramUser;
};

export type TelegramMessage = {
  message_id: number;
  date: number;
  chat: TelegramChat;
  from?: TelegramUser;
  text?: string;
  managed_bot_created?: TelegramManagedBotCreated;
};

export type TelegramManagedBotUpdated = {
  user: TelegramUser;
  bot: TelegramUser;
};

export type TelegramUpdate = {
  update_id: number;
  message?: TelegramMessage;
  managed_bot?: TelegramManagedBotUpdated;
};

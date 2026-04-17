import "server-only";

type TelegramSuccessResponse<T> = {
  ok: true;
  result: T;
};

type TelegramErrorResponse = {
  ok: false;
  error_code?: number;
  description?: string;
};

type TelegramApiResponse<T> = TelegramSuccessResponse<T> | TelegramErrorResponse;

export async function callTelegramApi<T>(
  botToken: string,
  method: string,
  params: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(params),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Telegram API ${method} failed with HTTP ${response.status}`);
  }

  const payload = (await response.json()) as TelegramApiResponse<T>;

  if (!payload.ok) {
    throw new Error(
      `Telegram API ${method} failed (${payload.error_code ?? "unknown"}): ${
        payload.description ?? "No description"
      }`,
    );
  }

  return payload.result;
}

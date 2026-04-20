import "server-only";

import { Omniston } from "@ston-fi/omniston-sdk";

const DEFAULT_OMNISTON_API_URL = "wss://omni-ws.ston.fi";

interface CachedClient {
  apiUrl: string;
  client: Omniston;
}

let cachedClient: CachedClient | null = null;

export function getOmnistonClient(): Omniston {
  const apiUrl = process.env.OMNISTON_API_URL?.trim() || DEFAULT_OMNISTON_API_URL;

  if (cachedClient && cachedClient.apiUrl === apiUrl) {
    return cachedClient.client;
  }

  cachedClient?.client.close();
  const client = new Omniston({ apiUrl });
  cachedClient = { apiUrl, client };
  return client;
}

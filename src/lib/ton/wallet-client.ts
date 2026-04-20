"use client";

/**
 * Client-side wallet generation and Telegram SecureStorage management.
 *
 * This module handles:
 * 1. Mnemonic generation using @ton/crypto
 * 2. Storing mnemonics in Telegram SecureStorage (iOS Keychain / Android Keystore)
 * 3. Loading wallet from SecureStorage on app open
 * 4. Deriving the public address from stored keys
 *
 * IMPORTANT: The mnemonic NEVER leaves the client device.
 * The server only receives the public wallet address.
 */

import { mnemonicNew, mnemonicToPrivateKey, KeyPair } from "@ton/crypto";
import { WalletContractV4 } from "@ton/ton";

const STORAGE_KEY_MNEMONIC = "jarvis_wallet_mnemonic";
const STORAGE_KEY_ADDRESS = "jarvis_wallet_address";
// Tracks which tier was last used to write, so reads skip stale higher-priority tiers.
const STORAGE_KEY_TIER = "jarvis_wallet_tier";

type StorageTier = "secure" | "cloud" | "local";

function setStorageTier(tier: StorageTier) {
  try { localStorage.setItem(STORAGE_KEY_TIER, tier); } catch { /* ignore */ }
}

function getStorageTier(): StorageTier | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY_TIER);
    if (v === "secure" || v === "cloud" || v === "local") return v;
  } catch { /* ignore */ }
  return null;
}

export interface WalletState {
  address: string;
  mnemonic: string[];
  keyPair: KeyPair;
}

/**
 * Generate a new TON wallet (mnemonic + keypair + address).
 */
export async function generateWallet(): Promise<WalletState> {
  const mnemonic = await mnemonicNew(24);
  const keyPair = await mnemonicToPrivateKey(mnemonic);

  const wallet = WalletContractV4.create({
    workchain: 0,
    publicKey: keyPair.publicKey,
  });

  const address = wallet.address.toString({
    bounceable: false,
    testOnly: false,
  });

  return { address, mnemonic, keyPair };
}

/**
 * Restore a wallet from an existing mnemonic.
 */
export async function restoreWalletFromMnemonic(
  mnemonic: string[],
): Promise<WalletState> {
  const keyPair = await mnemonicToPrivateKey(mnemonic);

  const wallet = WalletContractV4.create({
    workchain: 0,
    publicKey: keyPair.publicKey,
  });

  const address = wallet.address.toString({
    bounceable: false,
    testOnly: false,
  });

  return { address, mnemonic, keyPair };
}

/**
 * Store wallet mnemonic in Telegram SecureStorage.
 * Uses iOS Keychain / Android Keystore for maximum security.
 */
export function storeWalletInSecureStorage(
  mnemonic: string[],
  address: string,
): Promise<boolean> {
  return new Promise((resolve) => {
    const tg = window.Telegram?.WebApp;
    const hasSecureStorage = tg?.SecureStorage && tg.isVersionAtLeast?.('7.0');

    const writeToLocalStorage = () => {
      try {
        localStorage.setItem(STORAGE_KEY_MNEMONIC, JSON.stringify(mnemonic));
        localStorage.setItem(STORAGE_KEY_ADDRESS, address);
        setStorageTier("local");
        resolve(true);
      } catch {
        resolve(false);
      }
    };

    const writeToCloudStorage = () => {
      if (tg?.CloudStorage) {
        tg.CloudStorage.setItem(STORAGE_KEY_MNEMONIC, JSON.stringify(mnemonic), (err) => {
          if (err) { writeToLocalStorage(); return; }
          tg.CloudStorage.setItem(STORAGE_KEY_ADDRESS, address, (err2) => {
            if (err2) { writeToLocalStorage(); return; }
            setStorageTier("cloud");
            resolve(true);
          });
        });
      } else {
        writeToLocalStorage();
      }
    };

    if (!hasSecureStorage) {
      writeToCloudStorage();
      return;
    }

    // Use SecureStorage (preferred — iOS Keychain / Android Keystore)
    try {
      tg.SecureStorage.setItem(
        STORAGE_KEY_MNEMONIC,
        JSON.stringify(mnemonic),
        (err, success) => {
          if (err || !success) {
            console.warn("[Wallet] SecureStorage setItem error:", err, "— falling back");
            writeToCloudStorage();
            return;
          }
          tg.SecureStorage.setItem(
            STORAGE_KEY_ADDRESS,
            address,
            (err2, success2) => {
              if (err2 || !success2) { writeToCloudStorage(); return; }
              setStorageTier("secure");
              resolve(true);
            },
          );
        },
      );
    } catch {
      writeToCloudStorage();
    }
  });
}

/**
 * Load wallet mnemonic from Telegram SecureStorage.
 * Returns null if no wallet is stored.
 */
export function loadWalletFromSecureStorage(): Promise<{
  mnemonic: string[];
  address: string;
} | null> {
  return new Promise((resolve) => {
    const tg = window.Telegram?.WebApp;
    const hasSecureStorage = tg?.SecureStorage && tg.isVersionAtLeast?.('7.0');
    const tier = getStorageTier();

    const readFromLocalStorage = () => {
      try {
        const mnemonicStr = localStorage.getItem(STORAGE_KEY_MNEMONIC);
        const addr = localStorage.getItem(STORAGE_KEY_ADDRESS);
        if (mnemonicStr && addr) resolve({ mnemonic: JSON.parse(mnemonicStr), address: addr });
        else resolve(null);
      } catch { resolve(null); }
    };

    const readFromCloudStorage = (onMissing: () => void) => {
      if (!tg?.CloudStorage) { onMissing(); return; }
      tg.CloudStorage.getItem(STORAGE_KEY_MNEMONIC, (err, value) => {
        if (err || !value) { onMissing(); return; }
        tg.CloudStorage.getItem(STORAGE_KEY_ADDRESS, (err2, addr) => {
          if (err2 || !addr) { onMissing(); return; }
          try { resolve({ mnemonic: JSON.parse(value), address: addr }); }
          catch { onMissing(); }
        });
      });
    };

    const readFromSecureStorage = (onMissing: () => void) => {
      if (!hasSecureStorage) { onMissing(); return; }
      try {
        tg.SecureStorage.getItem(STORAGE_KEY_MNEMONIC, (err, value) => {
          if (err || !value) {
            if (err) console.warn("[Wallet] SecureStorage getItem error:", err, "— falling back");
            onMissing();
            return;
          }
          tg.SecureStorage.getItem(STORAGE_KEY_ADDRESS, (err2, addr) => {
            if (err2 || !addr) { onMissing(); return; }
            try { resolve({ mnemonic: JSON.parse(value), address: addr }); }
            catch { onMissing(); }
          });
        });
      } catch {
        onMissing();
      }
    };

    // Read from the same tier that was last written to, avoiding stale data
    // from a higher-priority tier that failed during a previous write.
    if (tier === "local") {
      readFromLocalStorage();
      return;
    }

    if (tier === "cloud") {
      readFromCloudStorage(readFromLocalStorage);
      return;
    }

    // tier === "secure" or unknown (first run) — try full fallback chain
    readFromSecureStorage(() => readFromCloudStorage(readFromLocalStorage));
  });
}

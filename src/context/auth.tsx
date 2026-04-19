"use client";

import { auth, firebaseClientConfigError } from "@/lib/firebase/client";
import {
  ParsedToken,
  signInWithCustomToken,
  User,
} from "firebase/auth";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { removeToken, setToken } from "./actions";

type AuthContextType = {
  currentUser: User | null;
  loginWithTelegram: (payload: {
    initData: string;
  }) => Promise<{ success: boolean; error: string | null }>;
  logout: () => Promise<void>;
  customClaims: ParsedToken | null;
};

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [customClaims, setCustomClaims] = useState<ParsedToken | null>(null);

  useEffect(() => {
    if (!auth) {
      if (firebaseClientConfigError) {
        console.error(firebaseClientConfigError);
      }
      return;
    }

    const unsubscribe = auth.onAuthStateChanged(async (user: User | null) => {
      setCurrentUser(user ?? null);
      if (user) {
        const tokenResult = await user.getIdTokenResult();
        const token = tokenResult.token;
        const refreshToken = user.refreshToken;
        const claims = tokenResult.claims;
        setCustomClaims(claims ?? null);
        if (token && refreshToken) {
          await setToken({
            token,
            refreshToken,
          });
        }
      } else {
        await removeToken();
      }
    });

    return () => unsubscribe();
  }, []);

  const logout = useCallback(async () => {
    if (!auth) {
      return;
    }
    await auth.signOut();
  }, []);

  const loginWithTelegram = useCallback(
    async ({ initData }: { initData: string }) => {
      if (!auth) {
        return {
          success: false,
          error:
            firebaseClientConfigError ??
            "Firebase client configuration is missing. Check NEXT_PUBLIC_FIREBASE_* vars.",
        };
      }

      try {
        const response = await fetch("/api/auth/telegram", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ initData }),
        });
        const data = (await response.json()) as {
          customToken?: string;
          error?: string;
        };

        if (data.customToken) {
          await signInWithCustomToken(auth, data.customToken);
          return { success: true, error: null };
        }

        console.error("Server can't provide custom token:", data.error);
        return {
          success: false,
          error: data.error || "An unknown error occurred during Telegram sign-in.",
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : "";
        if (
          message.includes("auth/api-key-not-valid") ||
          message.includes("auth/invalid-api-key")
        ) {
          return {
            success: false,
            error:
              "Firebase Web API key is invalid. Use your Firebase project's Web API key in NEXT_PUBLIC_FIREBASE_API_KEY.",
          };
        }

        console.error("Error during Telegram login:", error);
        return {
          success: false,
          error: "A Telegram sign-in error occurred.",
        };
      }
    },
    [],
  );

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        logout,
        customClaims,
        loginWithTelegram,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);

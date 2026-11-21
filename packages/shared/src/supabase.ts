import { createClient, SupabaseClient } from "@supabase/supabase-js";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

export interface SupabaseClientConfig {
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  storageKeyPrefix?: string;
  persistSession?: boolean;
}

/**
 * Hardware-backed secure storage adapter for Supabase sessions.
 * Enforces Keychain accessibility (WHEN_UNLOCKED_THIS_DEVICE_ONLY) on iOS,
 * EncryptedSharedPreferences on Android, and sessionStorage on Web.
 */
export function createSecureStorage(prefix: string = "shopnojatra") {
  return {
    getItem: async (key: string): Promise<string | null> => {
      try {
        const fullKey = `${prefix}_${key}`;
        if (Platform.OS === "web") {
          return typeof window !== "undefined" && window.sessionStorage
            ? window.sessionStorage.getItem(fullKey)
            : null;
        }
        return await SecureStore.getItemAsync(fullKey, {
          keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
        });
      } catch {
        return null;
      }
    },
    setItem: async (key: string, value: string): Promise<void> => {
      try {
        const fullKey = `${prefix}_${key}`;
        if (Platform.OS === "web") {
          if (typeof window !== "undefined" && window.sessionStorage) {
            window.sessionStorage.setItem(fullKey, value);
          }
          return;
        }
        await SecureStore.setItemAsync(fullKey, value, {
          keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
        });
      } catch {
        // Suppress storage errors to avoid unhandled rejections
      }
    },
    removeItem: async (key: string): Promise<void> => {
      try {
        const fullKey = `${prefix}_${key}`;
        if (Platform.OS === "web") {
          if (typeof window !== "undefined" && window.sessionStorage) {
            window.sessionStorage.removeItem(fullKey);
          }
          return;
        }
        await SecureStore.deleteItemAsync(fullKey);
      } catch {
        // Suppress error
      }
    },
  };
}

/**
 * Factory for creating a hardened, consistent Supabase client across all apps.
 */
export function createAppSupabaseClient(config: SupabaseClientConfig): SupabaseClient {
  const url =
    config.supabaseUrl ||
    process.env.EXPO_PUBLIC_SUPABASE_URL ||
    process.env.REACT_APP_SUPABASE_URL ||
    "https://placeholder.supabase.co";

  const key =
    config.supabaseAnonKey ||
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.EXPO_PUBLIC_SUPABASE_KEY ||
    process.env.REACT_APP_SUPABASE_ANON_KEY ||
    "placeholder-key";

  const storage = createSecureStorage(config.storageKeyPrefix ?? "shopnojatra");

  return createClient(url, key, {
    auth: {
      storage,
      autoRefreshToken: true,
      persistSession: config.persistSession ?? true,
      detectSessionInUrl: false,
    },
    global: {
      headers: {
        "x-application-name": config.storageKeyPrefix || "shopnojatra",
      },
    },
  });
}

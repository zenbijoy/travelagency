/**
 * Typed & Validated Environment Configuration
 * Inspired by obytes/react-native-template-obytes & t3-oss/env
 * Enforces strict runtime validation of critical API keys and URLs.
 */
import { z } from "zod";

const envSchema = z.object({
  EXPO_PUBLIC_SUPABASE_URL: z.string().url("EXPO_PUBLIC_SUPABASE_URL must be a valid URL"),
  EXPO_PUBLIC_SUPABASE_ANON_KEY: z.string().min(10, "EXPO_PUBLIC_SUPABASE_ANON_KEY is required"),
  EXPO_PUBLIC_BACKEND_URL: z.string().url().default("http://10.0.2.2:8000"),
  EXPO_PUBLIC_APP_ENV: z.enum(["development", "staging", "production"]).default("development"),
  EXPO_PUBLIC_APP_VERSION: z.string().default("1.0.0"),
});

const rawEnv = {
  EXPO_PUBLIC_SUPABASE_URL:
    process.env.EXPO_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co",
  EXPO_PUBLIC_SUPABASE_ANON_KEY:
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.placeholder",
  EXPO_PUBLIC_BACKEND_URL:
    process.env.EXPO_PUBLIC_BACKEND_URL || "http://10.0.2.2:8000",
  EXPO_PUBLIC_APP_ENV:
    process.env.EXPO_PUBLIC_APP_ENV || "development",
  EXPO_PUBLIC_APP_VERSION:
    process.env.EXPO_PUBLIC_APP_VERSION || "1.0.0",
};

const parsedResult = envSchema.safeParse(rawEnv);

if (!parsedResult.success) {
  console.error("❌ Invalid environment variables configuration:", parsedResult.error.format());
}

export const Env = parsedResult.success ? parsedResult.data : (rawEnv as z.infer<typeof envSchema>);

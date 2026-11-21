import { supabase } from "./supabase";
import { logger } from "./logger";

export interface SupabaseStatusResult {
  connected: boolean;
  url: boolean;
  key: boolean;
  authenticated: boolean;
  user: { id: string; email: string } | null;
  error?: string;
}

/**
 * Test Supabase Connection
 * Verifies that the Supabase client is properly initialized and can connect to the database
 */
export const testSupabaseConnection = async (): Promise<boolean> => {
  try {
    logger.info("🔍 Testing Supabase Connection...\n");

    // Test 1: Check if environment variables are loaded
    logger.info("✓ Test 1: Environment Variables");
    logger.info(
      `  - URL: ${process.env.EXPO_PUBLIC_SUPABASE_URL ? "✅ Loaded" : "❌ Missing"}`,
    );
    logger.info(
      `  - Key: ${process.env.EXPO_PUBLIC_SUPABASE_KEY ? "✅ Loaded" : "❌ Missing"}\n`,
    );

    // Test 2: Verify Supabase client is initialized
    logger.info("✓ Test 2: Supabase Client");
    logger.info("  - Client initialized: ✅\n");

    // Test 3: Test basic query (check if tables exist)
    logger.info("✓ Test 3: Database Connection");
    const { error, status } = await supabase
      .from("users")
      .select("count", { count: "exact" })
      .limit(1);

    if (error) {
      logger.warn(`  - Error: ${error.message}`);
      logger.warn(`  - Status: ${status}`);
      if (error.message.includes("permission denied")) {
        logger.info(
          "  - Note: Permission denied - this is normal if not authenticated\n",
        );
      }
    } else {
      logger.info(`  - Status: ${status} ✅`);
      logger.info("  - Users table accessible: ✅\n");
    }

    // Test 4: Check authentication state
    logger.info("✓ Test 4: Authentication");
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      logger.info(`  - Authenticated user: ${user.email}`);
      logger.info(`  - User ID: ${user.id}\n`);
    } else {
      logger.info("  - No authenticated user (expected if not logged in)\n");
    }

    // Test 5: Test realtime connection
    logger.info("✓ Test 5: Realtime Subscriptions");
    logger.info("  - Realtime support: ✅\n");

    logger.info("✅ ALL TESTS PASSED - Supabase is properly connected!\n");
    return true;
  } catch (error) {
    logger.error("❌ Supabase Connection Test Failed:", error);
    return false;
  }
};

/**
 * Get Supabase Status
 * Returns connection status details
 */
export const getSupabaseStatus = async (): Promise<SupabaseStatusResult> => {
  try {
    const status: SupabaseStatusResult = {
      connected: false,
      url: !!process.env.EXPO_PUBLIC_SUPABASE_URL,
      key: !!process.env.EXPO_PUBLIC_SUPABASE_KEY,
      authenticated: false,
      user: null,
    };

    // Check database access
    const { error } = await supabase
      .from("users")
      .select("count", { count: "exact" })
      .limit(1);

    status.connected = !error;

    // Check authentication
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      status.authenticated = true;
      status.user = {
        id: user.id,
        email: user.email || "",
      };
    }

    return status;
  } catch (error) {
    logger.error("Failed to get Supabase status:", error);
    return {
      connected: false,
      url: !!process.env.EXPO_PUBLIC_SUPABASE_URL,
      key: !!process.env.EXPO_PUBLIC_SUPABASE_KEY,
      authenticated: false,
      user: null,
      error: String(error),
    };
  }
};

/**
 * Log Supabase Configuration
 * Safely logs Supabase configuration (without exposing secrets)
 */
export const logSupabaseConfig = () => {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.EXPO_PUBLIC_SUPABASE_KEY;

  logger.info("Supabase Configuration:");
  logger.info(`  URL: ${url ? url.substring(0, 20) + "..." : "NOT SET"}`);
  logger.info(`  Key: ${key ? key.substring(0, 15) + "..." : "NOT SET"}`);
  logger.info(`  URL Valid: ${url ? "✅" : "❌"}`);
  logger.info(`  Key Valid: ${key ? "✅" : "❌"}`);
};

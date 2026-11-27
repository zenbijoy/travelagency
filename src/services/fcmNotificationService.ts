import { Platform } from "react-native";
import { router } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { supabase } from "../utils/supabase";
import { logger } from "../utils/logger";
import { useSettingsStore, isQuietHourActive } from "../store/settingsStore";
import { personalizationService } from "./personalizationService";
import { resolveNotificationTapRoute } from "./navigation/notificationDeepLinkRegistry";

const PUSH_DEVICE_ID_STORAGE_KEY = "@shopnojatra_push_device_id";

// Configure default notification presentation behavior
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const data = notification.request.content.data || {};
    const notifType = data.type || "system";
    const settings = useSettingsStore.getState().notifications;

    // Check Quiet Hours (non-critical notifications like promo or community activity get silenced)
    if (isQuietHourActive(settings.quietHoursStart, settings.quietHoursEnd) && notifType !== "booking" && notifType !== "flight_alert") {
      return {
        shouldShowAlert: false, shouldPlaySound: false, shouldSetBadge: false, shouldShowBanner: false, shouldShowList: false,
        priority: Notifications.AndroidNotificationPriority.MIN,
      };
    }

    // Check user preferences
    if (notifType === "promo" && !settings.promoOffers) {
      return { shouldShowAlert: false, shouldPlaySound: false, shouldSetBadge: false, shouldShowBanner: false, shouldShowList: false };
    }
    if (notifType === "community" && !settings.communityActivity) {
      return { shouldShowAlert: false, shouldPlaySound: false, shouldSetBadge: false, shouldShowBanner: false, shouldShowList: false };
    }
    if ((notifType === "booking" || notifType === "flight_alert") && !settings.bookingUpdates) {
      return { shouldShowAlert: false, shouldPlaySound: false, shouldSetBadge: false, shouldShowBanner: false, shouldShowList: false };
    }

    return {
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    };
  },
});

export const fcmNotificationService = {
  /**
   * Check existing permission status without prompting the user.
   */
  async checkPermissionStatus(): Promise<Notifications.PermissionStatus> {
    try {
      const { status } = await Notifications.getPermissionsAsync();
      return status;
    } catch {
      return Notifications.PermissionStatus.UNDETERMINED;
    }
  },

  /**
   * Set up Android notification channels for category segregation
   */
  async setupAndroidChannels() {
    if (Platform.OS !== "android") return;

    try {
      await Notifications.setNotificationChannelAsync("booking_updates", {
        name: "Flight & Booking Updates (জরুরি আপডেট)",
        description: "Gate changes, flight delays, boarding countdowns, and booking confirmations",
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: "#0055F2",
        enableLights: true,
        enableVibrate: true,
      });

      await Notifications.setNotificationChannelAsync("promos_offers", {
        name: "Discounts & Special Offers (অফার ও ছাড়)",
        description: "Seasonal airline discounts, hotel coupons, and reward bonuses",
        importance: Notifications.AndroidImportance.DEFAULT,
        vibrationPattern: [0, 150],
        lightColor: "#10B981",
      });

      await Notifications.setNotificationChannelAsync("community_alerts", {
        name: "Travel Buddy & Community (কমিউনিটি)",
        description: "Traveler meetups, trip stories, and buddy requests",
        importance: Notifications.AndroidImportance.LOW,
      });
    } catch (e) {
      logger.warn("[FCM] Failed to set up notification channels:", e);
    }
  },

  /**
   * Request user permission contextually and retrieve native device token.
   * @param userId Current user UUID
   * @param forcePrompt If false, only checks if already granted (won't pop OS dialog unprompted)
   */
  async registerForPushNotifications(
    userId?: string,
    forcePrompt: boolean = false
  ): Promise<string | null> {
    try {
      if (Platform.OS === "web") {
        return null;
      }

      // Resolve authenticated user if userId not explicitly provided
      let effectiveUserId = userId;
      if (!effectiveUserId) {
        const { data } = await supabase.auth.getUser();
        effectiveUserId = data?.user?.id;
      }

      // Configure channels on Android
      await this.setupAndroidChannels();

      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      // Only show the system permission prompt if explicitly requested (e.g. after booking or in settings)
      if (existingStatus !== "granted") {
        if (!forcePrompt) {
          // Do not disturb the user on app startup!
          return null;
        }
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== "granted") {
        return null;
      }

      // Fetch Expo / FCM push token safely
      const projectId =
        Constants?.expoConfig?.extra?.eas?.projectId ??
        Constants?.easConfig?.projectId;

      const tokenData = await Notifications.getExpoPushTokenAsync({
        projectId: projectId || undefined,
      }).catch(() => null);

      const token = tokenData?.data || null;

      if (token && effectiveUserId) {
        await this.saveTokenToDatabase(effectiveUserId, token);
      }

      return token;
    } catch (err) {
      logger.warn("[FCM] Push registration error:", err);
      return null;
    }
  },

  /**
   * Stable per-install device ID used for idempotent FastAPI /notifications/devices registration.
   */
  async getOrCreateDeviceId(): Promise<string> {
    try {
      const existing = await AsyncStorage.getItem(PUSH_DEVICE_ID_STORAGE_KEY);
      if (existing) return existing;
      const generated = `dev_${Platform.OS}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      await AsyncStorage.setItem(PUSH_DEVICE_ID_STORAGE_KEY, generated);
      return generated;
    } catch {
      return `dev_${Platform.OS}_${Device.modelId || "mobile"}`;
    }
  },

  /**
   * Explicit user-triggered permission request + token sync to both FastAPI and Supabase.
   */
  async requestPushPermissionsAndSync(userId?: string): Promise<{
    status: Notifications.PermissionStatus;
    token: string | null;
    syncedBackend: boolean;
    deviceId: string;
  }> {
    const deviceId = await this.getOrCreateDeviceId();
    if (Platform.OS === "web") {
      return {
        status: Notifications.PermissionStatus.UNDETERMINED,
        token: null,
        syncedBackend: false,
        deviceId,
      };
    }

    await this.setupAndroidChannels();
    let finalStatus = await this.checkPermissionStatus();
    if (finalStatus !== "granted") {
      try {
        const res = await Notifications.requestPermissionsAsync();
        finalStatus = res.status;
      } catch {
        finalStatus = Notifications.PermissionStatus.DENIED;
      }
    }

    if (finalStatus !== "granted") {
      return { status: finalStatus, token: null, syncedBackend: false, deviceId };
    }

    const token = await this.registerForPushNotifications(userId, false);
    const syncedBackend = token ? await this.registerTokenWithBackend(token, deviceId) : false;
    return { status: finalStatus, token, syncedBackend, deviceId };
  },

  /**
   * Sync Expo push token to FastAPI POST /api/v1/notifications/devices
   */
  async registerTokenWithBackend(token: string, deviceId?: string): Promise<boolean> {
    try {
      const resolvedDeviceId = deviceId || (await this.getOrCreateDeviceId());
      const platform =
        Platform.OS === "ios"
          ? "ios"
          : Platform.OS === "android"
          ? "android"
          : "web";
      await personalizationService.registerDevice({
        device_id: resolvedDeviceId,
        push_token: token,
        token_type: "expo",
        platform,
        device_name: Device.deviceName || Device.modelName || undefined,
        os_version: Device.osVersion || undefined,
      });
      return true;
    } catch (e) {
      logger.warn("[FCM] FastAPI /notifications/devices sync notice:", e);
      return false;
    }
  },

  /**
   * Save or update token in both FastAPI backend & Supabase fallback table
   */
  async saveTokenToDatabase(userId: string, token: string) {
    await this.registerTokenWithBackend(token);
    try {
      await supabase.from("user_device_tokens").upsert(
        {
          user_id: userId,
          fcm_token: token,
          platform: Platform.OS,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,fcm_token" }
      );
    } catch (e) {
      logger.warn("[FCM] Save token to database error:", e);
    }
  },

  /**
   * Attach listener for when user taps on a notification, routing safely through typed registry.
   */
  setupNotificationResponseListener() {
    try {
      const subscription = Notifications.addNotificationResponseReceivedListener(
        (response) => {
          const data = response.notification.request.content.data as Record<string, any> | undefined;
          if (!data) return;

          const safeTarget = resolveNotificationTapRoute(data);
          router.push(safeTarget as any);
        }
      );

      return subscription;
    } catch (err) {
      logger.warn("[FCM] Notification listener setup error:", err);
      return { remove: () => {} };
    }
  },

  /**
   * Send local contextual notification (e.g. booking confirmation or flight delay)
   */
  async sendLocalNotification(
    title: string,
    body: string,
    data: {
      type?: "booking" | "flight_alert" | "promo" | "community" | "chat" | "system";
      route?: string;
      channelId?: string;
      [key: string]: any;
    } = {}
  ) {
    try {
      const settings = useSettingsStore.getState().notifications;
      const type = data.type || "system";

      // Check quiet hours
      if (isQuietHourActive(settings.quietHoursStart, settings.quietHoursEnd) && type !== "booking" && type !== "flight_alert") {
        logger.debug(`[Notification Muted during Quiet Hours] ${title} - ${body}`);
        return;
      }

      let channelId = "booking_updates";
      if (type === "promo") channelId = "promos_offers";
      if (type === "community") channelId = "community_alerts";

      await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body,
          data,
          sound: true,
          priority: Notifications.AndroidNotificationPriority.HIGH,
        },
        trigger: null, // Instant
      });
    } catch (err) {
      logger.info(`[Local Notification] ${title} - ${body}`, data);
    }
  },

  /**
   * Delete token on logout
   */
  async clearUserTokens(userId: string) {
    try {
      await supabase.from("user_device_tokens").delete().eq("user_id", userId);
    } catch (e) {
      logger.warn("[FCM] Clear tokens error:", e);
    }
  },
};

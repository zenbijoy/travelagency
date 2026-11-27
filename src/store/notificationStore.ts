/**
 * Notification Store (Zustand)
 * In-app and push notification state with offline caching, badge counter,
 * personalized metadata, category filters, engagement tracking, and
 * "Why am I seeing this?" explainability backed by /api/v1/notifications/*.
 */

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
  personalizationService,
  type InteractionType,
  type NotificationWhyResponse,
  type PersonalizationTier as ServicePersonalizationTier,
} from "../services/personalizationService";
import { supabase } from "../utils/supabase";
import { cachedStateStorage } from "./storage";

export type NotificationCategory =
  | "booking"
  | "promo"
  | "flight_alert"
  | "system"
  | "chat"
  | "price_alert"
  | "travel_discovery"
  | "security"
  | "community";

export type NotificationCategoryFilter = "all" | NotificationCategory;

export type PersonalizationTier = ServicePersonalizationTier;

export type NotificationInteractionType = InteractionType;

export type NotificationWhyDetails = NotificationWhyResponse;

export interface AppNotification {
  id: string;
  title: string;
  body: string;
  type: "booking" | "promo" | "flight_alert" | "system" | "chat" | string;
  category?: NotificationCategory | string;
  priority?: "low" | "normal" | "medium" | "high" | "critical" | string;
  channels?: string[];
  cta_label?: string | null;
  deep_link?: string | null;
  personalization_tier?: PersonalizationTier | null;
  relevance_score?: number | null;
  confidence_score?: number | null;
  has_explanation?: boolean;
  feedback?: "helpful" | "not_relevant" | null;
  data?: Record<string, any>;
  is_read: boolean;
  read_at?: string | null;
  expires_at?: string | null;
  created_at: string;
}

export interface NotificationFetchOptions {
  page?: number;
  pageSize?: number;
  unreadOnly?: boolean;
  category?: string;
}

export interface NotificationState {
  notifications: AppNotification[];
  unreadCount: number;
  isLoading: boolean;
  error: string | null;

  // Personalization & Inbox UI State
  selectedCategory: NotificationCategoryFilter;
  unreadOnlyFilter: boolean;
  whyCache: Record<string, NotificationWhyDetails>;
  whyLoadingId: string | null;

  // Existing Preserved Actions
  addNotification: (
    notification: Omit<AppNotification, "id" | "created_at" | "is_read">
  ) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  removeNotification: (id: string) => void;
  clearAll: () => void;
  fetchNotifications: (
    userId: string,
    options?: NotificationFetchOptions
  ) => Promise<void>;

  // Personalization & Explainability Actions
  setSelectedCategory: (category: NotificationCategoryFilter) => void;
  setUnreadOnlyFilter: (unreadOnly: boolean) => void;
  fetchWhySeeingThis: (
    notificationId: string
  ) => Promise<NotificationWhyDetails | null>;
  recordInteraction: (
    notificationId: string,
    interactionType: NotificationInteractionType,
    options?: {
      channel?: "push" | "in_app" | "email" | "sms";
      feedback?: "helpful" | "not_relevant";
      metadata?: Record<string, any>;
    }
  ) => Promise<boolean>;
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(id?: string | null): boolean {
  return Boolean(id && UUID_REGEX.test(id));
}

function normalizeCategory(raw: any): string {
  const val = String(raw || "system").toLowerCase();
  if (val === "marketing" || val === "offer" || val === "discount") return "promo";
  return val;
}

function mapBackendInboxItem(d: any): AppNotification {
  const rawCategory = d.category || d.type || "system";
  return {
    id: String(d.id),
    title: d.title || "Notification",
    body: d.message ?? d.body ?? "",
    type: normalizeCategory(rawCategory),
    category: rawCategory,
    priority: d.priority || "normal",
    channels: Array.isArray(d.channels) ? d.channels : ["in_app"],
    cta_label: d.cta_label ?? d.data?.cta_label ?? null,
    deep_link: d.deep_link ?? d.data?.deep_link ?? d.data?.route ?? null,
    personalization_tier:
      d.personalization_tier ?? d.data?.personalization_tier ?? null,
    relevance_score:
      typeof d.relevance_score === "number"
        ? d.relevance_score
        : typeof d.data?.relevance_score === "number"
        ? d.data.relevance_score
        : null,
    confidence_score:
      typeof d.confidence_score === "number"
        ? d.confidence_score
        : typeof d.data?.confidence_score === "number"
        ? d.data.confidence_score
        : null,
    has_explanation: Boolean(
      d.has_explanation ||
        d.personalization_tier ||
        d.data?.explanation_factors?.length
    ),
    data: d.data || {},
    is_read: Boolean(d.is_read),
    read_at: d.read_at ?? null,
    expires_at: d.expires_at ?? null,
    created_at: d.created_at || new Date().toISOString(),
  };
}

function buildLocalFallbackWhy(notif: AppNotification): NotificationWhyDetails {
  const category = String(notif.category || notif.type || "system");
  const factorsFromData = Array.isArray(notif.data?.explanation_factors)
    ? notif.data.explanation_factors.map(String)
    : [];
  const matchedPrefs = Array.isArray(notif.data?.matched_preferences)
    ? notif.data.matched_preferences.map(String)
    : [];

  const factors =
    factorsFromData.length > 0
      ? factorsFromData
      : category === "booking" || category === "flight_alert" || category === "security"
      ? [
          "Essential account, booking, or trip status update.",
          "Sent regardless of promotional filters to keep your trip safe and accurate.",
        ]
      : [
          "Delivered based on your active notification category and channel preferences.",
          "You can adjust destinations, travel styles, or frequency caps anytime.",
        ];

  return {
    notification_id: notif.id,
    category,
    personalization_tier: notif.personalization_tier || "generic",
    relevance_score: notif.relevance_score ?? null,
    confidence_score: notif.confidence_score ?? null,
    summary:
      notif.data?.why_summary ||
      (category === "booking" || category === "flight_alert" || category === "security"
        ? "Critical transactional or trip alert linked to your account activity."
        : "Personalized travel update matched to your active ShopnoJatra preferences."),
    explanation_factors: factors,
    matched_preferences: matchedPrefs,
    can_adjust_preferences: true,
    can_opt_out_category: category !== "booking" && category !== "security",
    preferences_route: "/screens/travel-preferences",
  };
}

export const useNotificationStore = create<NotificationState>()(
  persist(
    (set, get) => ({
      notifications: [
        {
          id: "notif-welcome",
          title: "Welcome to Shopno Jatra!",
          body: "Plan your next dream journey with instant confirmations and best fare guarantee.",
          type: "system",
          category: "system",
          is_read: true,
          created_at: new Date().toISOString(),
        },
      ],
      unreadCount: 1,
      isLoading: false,
      error: null,
      selectedCategory: "all",
      unreadOnlyFilter: false,
      whyCache: {},
      whyLoadingId: null,

      addNotification: (item) => {
        const newNotif: AppNotification = {
          ...item,
          category: item.category || item.type || "system",
          id: `notif-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
          is_read: false,
          created_at: new Date().toISOString(),
        };

        set((state) => {
          const list = [newNotif, ...state.notifications];
          return {
            notifications: list,
            unreadCount: list.filter((n) => !n.is_read).length,
          };
        });
      },

      markAsRead: (id) => {
        const readAt = new Date().toISOString();
        set((state) => {
          const list = state.notifications.map((n) =>
            n.id === id ? { ...n, is_read: true, read_at: n.read_at || readAt } : n
          );
          return {
            notifications: list,
            unreadCount: list.filter((n) => !n.is_read).length,
          };
        });

        if (isUuid(id)) {
          personalizationService.markNotificationRead(id).catch(() => {
            // Local read state remains intact even when offline
          });
        }
      },

      markAllAsRead: () => {
        const readAt = new Date().toISOString();
        const hasRemoteUnread = get().notifications.some(
          (n) => !n.is_read && isUuid(n.id)
        );
        set((state) => ({
          notifications: state.notifications.map((n) => ({
            ...n,
            is_read: true,
            read_at: n.read_at || readAt,
          })),
          unreadCount: 0,
        }));

        if (hasRemoteUnread) {
          personalizationService.markAllNotificationsRead().catch(() => {
            // Local read state remains intact even when offline
          });
        }
      },

      removeNotification: (id) => {
        set((state) => {
          const list = state.notifications.filter((n) => n.id !== id);
          return {
            notifications: list,
            unreadCount: list.filter((n) => !n.is_read).length,
          };
        });
      },

      clearAll: () => set({ notifications: [], unreadCount: 0 }),

      setSelectedCategory: (selectedCategory) => set({ selectedCategory }),
      setUnreadOnlyFilter: (unreadOnlyFilter) => set({ unreadOnlyFilter }),

      fetchNotifications: async (
        userId: string,
        options?: NotificationFetchOptions
      ) => {
        set({ isLoading: true, error: null });
        try {
          // 1. Try personalized FastAPI notifications inbox first
          try {
            const backendRes = await personalizationService.getInbox({
              page: options?.page ?? 1,
              page_size: options?.pageSize ?? 50,
              unread_only: options?.unreadOnly,
              category:
                options?.category && options.category !== "all"
                  ? options.category
                  : undefined,
            });
            if (backendRes && Array.isArray(backendRes.items)) {
              const mapped = backendRes.items.map(mapBackendInboxItem);
              const unread =
                typeof backendRes.unread_count === "number"
                  ? backendRes.unread_count
                  : mapped.filter((n: AppNotification) => !n.is_read).length;
              set({
                notifications: mapped,
                unreadCount: unread,
                isLoading: false,
              });
              return;
            }
          } catch {
            // Fall through to Supabase table query when backend API is unavailable
          }

          // 2. Fallback to Supabase direct query
          const { data, error } = await supabase
            .from("notifications")
            .select("*")
            .eq("user_id", userId)
            .order("created_at", { ascending: false })
            .limit(options?.pageSize ?? 50);

          if (!error && data) {
            const mapped: AppNotification[] = data.map(mapBackendInboxItem);
            set({
              notifications: mapped,
              unreadCount: mapped.filter((n) => !n.is_read).length,
              isLoading: false,
            });
          } else {
            set({ isLoading: false });
          }
        } catch (err: any) {
          set({
            isLoading: false,
            error: err?.message || "Failed to load notifications",
          });
        }
      },

      fetchWhySeeingThis: async (notificationId: string) => {
        const cached = get().whyCache[notificationId];
        if (cached) return cached;

        const targetNotif = get().notifications.find(
          (n) => n.id === notificationId
        );

        if (!isUuid(notificationId)) {
          if (!targetNotif) return null;
          const localDetails = buildLocalFallbackWhy(targetNotif);
          set((state) => ({
            whyCache: { ...state.whyCache, [notificationId]: localDetails },
          }));
          return localDetails;
        }

        set({ whyLoadingId: notificationId });
        try {
          const res = await personalizationService.getNotificationWhy(
            notificationId
          );
          set((state) => ({
            whyLoadingId: null,
            whyCache: { ...state.whyCache, [notificationId]: res },
          }));
          return res;
        } catch {
          set({ whyLoadingId: null });
          if (targetNotif) {
            return buildLocalFallbackWhy(targetNotif);
          }
          return null;
        }
      },

      recordInteraction: async (notificationId, interactionType, options) => {
        const readAt = new Date().toISOString();
        const shouldMarkRead =
          interactionType === "opened" ||
          interactionType === "clicked" ||
          interactionType === "cta_completed" ||
          interactionType === "converted";

        set((state) => {
          const list = state.notifications.map((n) => {
            if (n.id !== notificationId) return n;
            return {
              ...n,
              is_read: shouldMarkRead ? true : n.is_read,
              read_at: shouldMarkRead ? n.read_at || readAt : n.read_at,
              feedback:
                options?.feedback !== undefined
                  ? options.feedback
                  : interactionType === "dismissed"
                  ? "not_relevant"
                  : n.feedback,
            };
          });
          return {
            notifications: list,
            unreadCount: list.filter((n) => !n.is_read).length,
          };
        });

        if (!isUuid(notificationId)) {
          return true;
        }

        try {
          await personalizationService.recordNotificationInteraction(
            notificationId,
            {
              interaction_type: interactionType,
              channel: options?.channel ?? "in_app",
              metadata: {
                ...(options?.metadata || {}),
                ...(options?.feedback ? { user_feedback: options.feedback } : {}),
              },
            }
          );
          return true;
        } catch {
          return false;
        }
      },
    }),
    {
      name: "notifications_store",
      storage: createJSONStorage(() => cachedStateStorage),
      partialize: (state) => ({
        notifications: state.notifications,
        unreadCount: state.unreadCount,
      }),
    }
  )
);

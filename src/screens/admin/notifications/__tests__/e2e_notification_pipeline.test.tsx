/**
 * Frontend End-to-End Notification Pipeline & Admin Command Center Test Suite.
 *
 * Validates:
 * 1. Notification Inbox rendering, unread counter tracking, and mark-as-read state (useNotificationStore).
 * 2. User preference management (useSettingsStore), quiet hours calculation, and category toggles.
 * 3. Admin Command Center mock broadcast dispatch flow and schedule management (notificationAdminService & NotificationCenterScreen).
 * 4. End-to-End pipeline simulation (Admin dispatch -> Client inbox reception -> Mark as read).
 */

import React from "react";
import renderer, { act } from "react-test-renderer";

// Mock AsyncStorage
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

// Mock expo-haptics
jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn().mockResolvedValue(undefined),
  notificationAsync: jest.fn().mockResolvedValue(undefined),
  ImpactFeedbackStyle: { Light: "Light", Medium: "Medium", Heavy: "Heavy" },
  NotificationFeedbackType: { Success: "Success", Warning: "Warning", Error: "Error" },
}));

// Mock expo-font
jest.mock("expo-font", () => ({
  isLoaded: () => true,
  loadAsync: () => Promise.resolve(),
}));

// Mock vector icons
jest.mock("@expo/vector-icons", () => ({
  Ionicons: "Ionicons",
  MaterialCommunityIcons: "MaterialCommunityIcons",
  Feather: "Feather",
}));

jest.mock("../../../../components/ui/Skeleton", () => {
  const ReactLocal = require("react");
  const { View } = require("react-native");
  const MockSkeleton: any = ({ style, children, testID }: any) =>
    ReactLocal.createElement(View, { style, testID }, children);
  MockSkeleton.Circle = MockSkeleton;
  MockSkeleton.Text = MockSkeleton;
  MockSkeleton.Card = MockSkeleton;
  return {
    Skeleton: MockSkeleton,
    SkeletonCircle: MockSkeleton,
    SkeletonText: MockSkeleton,
    SkeletonCard: MockSkeleton,
  };
});

jest.mock("../../../../context/ThemeContext", () => ({
  useTheme: () => ({
    isDark: false,
    colors: {
      background: "#F8FAFC",
      surface: "#FFFFFF",
      surfaceSubtle: "#F1F5F9",
      card: "#FFFFFF",
      border: "#E2E8F0",
      borderSubtle: "#F1F5F9",
      text: "#0F172A",
      textSecondary: "#475569",
      textMuted: "#94A3B8",
      subtext: "#64748B",
      primary: "#0284C7",
      primaryLight: "#E0F2FE",
      success: "#10B981",
      successLight: "#DCFCE7",
      warning: "#F59E0B",
      warningLight: "#FEF3C7",
      danger: "#EF4444",
      dangerLight: "#FEE2E2",
      info: "#0EA5E9",
      infoLight: "#E0F2FE",
      inputBg: "#F8FAFC",
      inputBorder: "#CBD5E1",
    },
  }),
}));

jest.mock("../../../../screens/admin/rbac", () => ({
  useRBAC: () => ({
    admin: {
      id: "admin-uuid-1",
      name: "Super Administrator",
      email: "admin@shopnojatra.com",
      role: "super_admin",
    },
    hasPermission: () => true,
  }),
}));

jest.mock("../../../../services/personalizationService", () => {
  const actual = jest.requireActual("../../../../services/personalizationService");
  return {
    ...actual,
    personalizationService: {
      ...actual.personalizationService,
      listSegments: jest.fn().mockResolvedValue([]),
      getAdminOverview: jest.fn().mockResolvedValue({
        total_profiles: 0,
        profiles_sufficient_data: 0,
        profiles_incomplete_data: 0,
        personalization_enabled_count: 0,
        total_decisions_24h: 0,
        ai_assisted_count_24h: 0,
        avg_relevance_score: 0,
        avg_confidence_score: 0,
        suppression_rate_pct: 0,
        fatigue_distribution: {},
        attributed_revenue_paisa_30d: 0,
        conversion_count_30d: 0,
        active_rule_version: 1,
      }),
      getOutbox: jest.fn().mockResolvedValue({ items: [], total_count: 0, status_counts: {} }),
      getDlq: jest.fn().mockResolvedValue({ items: [], total_count: 0 }),
    },
  };
});

jest.mock("../../../../services/notificationCommandService", () => {
  const actual = jest.requireActual("../../../../services/notificationCommandService");
  return {
    ...actual,
    notificationCommandService: {
      ...actual.notificationCommandService,
      listCampaigns: jest.fn().mockResolvedValue([]),
      previewBroadcastAudience: jest.fn().mockResolvedValue({
        estimated_count: 150,
        sample_recipients_masked: ["usr_12...abcd"],
        source: "backend",
        note: "Live estimate",
      }),
    },
  };
});

// Mock Supabase client
const mockBroadcastHistory = [
  {
    id: "sched-101",
    title: "Eid Holiday Flash Sale",
    message: "Enjoy up to 30% discount on Cox's Bazar resorts.",
    channel: "push",
    target_audience: "travelers",
    deep_link: "/(tabs)",
    scheduled_time: "2026-06-21T10:00:00.000Z",
    status: "sent",
    sent_at: "2026-06-21T10:00:05.000Z",
    sent_count: 1240,
    created_at: "2026-06-20T08:00:00.000Z",
  },
];

const mockScheduledList = [
  {
    id: "sched-102",
    title: "Monsoon Special Announcement",
    message: "Rainy season flight schedules updated.",
    channel: "email",
    target_audience: "all",
    deep_link: "/(tabs)/trips",
    scheduled_time: "2026-07-01T09:00:00.000Z",
    status: "scheduled",
    sent_at: null,
    sent_count: 0,
    created_at: "2026-06-21T11:00:00.000Z",
  },
];

jest.mock("../../../../services/adminService", () => {
  let history = [...mockBroadcastHistory];
  let scheduled = [...mockScheduledList];

  return {
    notificationAdminService: {
      sendBroadcast: jest.fn().mockImplementation(async (payload) => {
        const record = {
          id: `broadcast-${Date.now()}`,
          title: payload.title,
          message: payload.message,
          channel: payload.channel,
          target_audience: payload.target_audience,
          deep_link: payload.deep_link || "/(tabs)",
          scheduled_time: new Date().toISOString(),
          status: "sent",
          sent_at: new Date().toISOString(),
          sent_count: payload.target_audience === "all" ? 1240 : 185,
        };
        history.unshift(record);
        return true;
      }),
      scheduleNotification: jest.fn().mockImplementation(async (payload) => {
        const record = {
          id: `scheduled-${Date.now()}`,
          ...payload,
          status: "scheduled",
          sent_count: 0,
          created_at: new Date().toISOString(),
        };
        scheduled.unshift(record);
        return record;
      }),
      getBroadcastHistory: jest.fn().mockImplementation(async () => history),
      getScheduledNotifications: jest.fn().mockImplementation(async () => scheduled),
      sendScheduledNow: jest.fn().mockImplementation(async (id) => {
        scheduled = scheduled.filter((s) => s && s.id !== id);
        return true;
      }),
      triggerScheduledNow: jest.fn().mockImplementation(async (id) => {
        scheduled = scheduled.filter((s) => s && s.id !== id);
        return true;
      }),
      cancelScheduledNotification: jest.fn().mockImplementation(async (id) => {
        scheduled = scheduled.filter((s) => s && s.id !== id);
        return true;
      }),
    },
    adminService: {
      getCurrentAdmin: jest.fn().mockResolvedValue({
        id: "admin-uuid-1",
        name: "Super Administrator",
        email: "admin@shopnojatra.com",
        role: "super_admin",
      }),
    },
  };
});

// Import stores and components after mocks
import { useNotificationStore } from "../../../../store/notificationStore";
import { useSettingsStore, isQuietHourActive } from "../../../../store/settingsStore";
import { notificationAdminService } from "../../../../services/adminService";
import { NotificationCenterScreen } from "../../NotificationCenterScreen";

describe("Event-Driven Notification Pipeline E2E Test Suite", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useNotificationStore.setState({
      notifications: [
        {
          id: "notif-welcome",
          title: "Welcome to ShopnoJatra!",
          body: "Plan your next holiday with instant confirmations.",
          type: "system",
          is_read: false,
          created_at: new Date().toISOString(),
        },
      ],
      unreadCount: 1,
      isLoading: false,
      error: null,
    });
  });

  // ==========================================================================
  // 1. INBOX RENDERING, UNREAD COUNTING & READ STATE TESTS
  // ==========================================================================
  describe("Client Notification Inbox & Unread State Engine", () => {
    it("should initialize with default welcome notification and unreadCount=1", () => {
      const state = useNotificationStore.getState();
      expect(state.notifications.length).toBe(1);
      expect(state.unreadCount).toBe(1);
      expect(state.notifications[0].is_read).toBe(false);
    });

    it("should dynamically add notifications and increment unreadCount", () => {
      act(() => {
        useNotificationStore.getState().addNotification({
          title: "Booking Confirmed #BK-789",
          body: "Your Sylhet tea resort tour is booked.",
          type: "booking",
          data: { bookingId: "BK-789" },
        });
      });

      const state = useNotificationStore.getState();
      expect(state.notifications.length).toBe(2);
      expect(state.unreadCount).toBe(2);
      expect(state.notifications[0].title).toBe("Booking Confirmed #BK-789");
      expect(state.notifications[0].is_read).toBe(false);
    });

    it("should mark a single notification as read and decrement unreadCount", () => {
      const initialId = useNotificationStore.getState().notifications[0].id;

      act(() => {
        useNotificationStore.getState().markAsRead(initialId);
      });

      const state = useNotificationStore.getState();
      expect(state.notifications[0].is_read).toBe(true);
      expect(state.unreadCount).toBe(0);
    });

    it("should mark all notifications as read and reset unreadCount to 0", () => {
      act(() => {
        useNotificationStore.getState().addNotification({
          title: "Flight Delay Notice",
          body: "Flight SJ-101 delayed by 30 mins.",
          type: "flight_alert",
        });
        useNotificationStore.getState().addNotification({
          title: "Payment Receipt",
          body: "bKash payment received.",
          type: "booking",
        });
      });

      expect(useNotificationStore.getState().unreadCount).toBe(3);

      act(() => {
        useNotificationStore.getState().markAllAsRead();
      });

      const state = useNotificationStore.getState();
      expect(state.unreadCount).toBe(0);
      expect(state.notifications.every((n) => n.is_read)).toBe(true);
    });

    it("should remove individual notifications and clear all cleanly", () => {
      act(() => {
        useNotificationStore.getState().addNotification({
          title: "Promo Flash",
          body: "20% off flights.",
          type: "promo",
        });
      });

      const notifId = useNotificationStore.getState().notifications[0].id;
      act(() => {
        useNotificationStore.getState().removeNotification(notifId);
      });

      expect(useNotificationStore.getState().notifications.find((n) => n.id === notifId)).toBeUndefined();

      act(() => {
        useNotificationStore.getState().clearAll();
      });

      expect(useNotificationStore.getState().notifications.length).toBe(0);
      expect(useNotificationStore.getState().unreadCount).toBe(0);
    });
  });

  // ==========================================================================
  // 2. USER PREFERENCES & QUIET HOURS CALCULATIONS
  // ==========================================================================
  describe("User Notification Preferences & Quiet Hours Evaluation", () => {
    it("should update channel preferences and category toggles", () => {
      act(() => {
        useSettingsStore.getState().updateNotificationPreference("pushEnabled", false);
        useSettingsStore.getState().updateNotificationPreference("promoOffers", false);
        useSettingsStore.getState().updateNotificationPreference("quietHoursEnabled", true);
      });

      const prefs = useSettingsStore.getState().notifications;
      expect(prefs.pushEnabled).toBe(false);
      expect(prefs.promoOffers).toBe(false);
      expect(prefs.quietHoursEnabled).toBe(true);
    });

    it("should evaluate isQuietHourActive across midnight span (22:00 -> 07:00)", () => {
      jest.useFakeTimers();
      try {
        // Mock system time to 23:30 (during quiet hours)
        jest.setSystemTime(new Date(2026, 5, 21, 23, 30, 0));
        expect(isQuietHourActive("22:00", "07:00")).toBe(true);

        // Mock system time to 04:15 (during quiet hours)
        jest.setSystemTime(new Date(2026, 5, 22, 4, 15, 0));
        expect(isQuietHourActive("22:00", "07:00")).toBe(true);

        // Mock system time to 15:00 (outside quiet hours)
        jest.setSystemTime(new Date(2026, 5, 22, 15, 0, 0));
        expect(isQuietHourActive("22:00", "07:00")).toBe(false);
      } finally {
        jest.useRealTimers();
      }
    });
  });

  // ==========================================================================
  // 3. ADMIN COMMAND CENTER DISPATCH & HISTORY TESTS
  // ==========================================================================
  describe("Admin Command Center Mock Dispatch Service Flow", () => {
    it("should send multi-channel broadcast and record delivery history", async () => {
      const payload = {
        title: "Platform Maintenance Alert",
        message: "Scheduled maintenance tonight at 02:00 AM UTC.",
        channel: "push" as const,
        target_audience: "all" as const,
        deep_link: "/(tabs)",
      };

      const result = await notificationAdminService.sendBroadcast(payload);
      expect(result).toBe(true);
      expect(notificationAdminService.sendBroadcast).toHaveBeenCalledWith(payload);

      const history = await notificationAdminService.getBroadcastHistory();
      expect(history.length).toBeGreaterThan(0);
      expect(history[0].title).toBe("Platform Maintenance Alert");
      expect(history[0].status).toBe("sent");
    });

    it("should schedule a notification and retrieve scheduled queue", async () => {
      const schedulePayload = {
        title: "Early Morning Departure Reminder",
        message: "Your flight departs in 3 hours.",
        channel: "sms" as const,
        target_audience: "travelers" as const,
        scheduled_time: "2026-08-15T04:00:00.000Z",
      };

      const scheduledItem = await notificationAdminService.scheduleNotification(schedulePayload);
      expect(scheduledItem).toBeDefined();
      expect(scheduledItem.title).toBe("Early Morning Departure Reminder");

      const queue = await notificationAdminService.getScheduledNotifications();
      expect(queue.some((s) => s.title === "Early Morning Departure Reminder")).toBe(true);
    });

    it("should trigger immediate send on a scheduled notification", async () => {
      const success = await notificationAdminService.sendScheduledNow("sched-102");
      expect(success).toBe(true);
    });

    it("should cancel a scheduled notification", async () => {
      const success = await notificationAdminService.cancelScheduledNotification("sched-102");
      expect(success).toBe(true);
    });
  });

  // ==========================================================================
  // 4. ADMIN SCREEN COMPONENT RENDERING
  // ==========================================================================
  describe("NotificationCenterScreen Component Lifecycle", () => {
    it("should render admin notification center screen without errors", async () => {
      let component: any;
      try {
        await act(async () => {
          component = renderer.create(<NotificationCenterScreen />);
          await new Promise((resolve) => setTimeout(resolve, 0));
        });

        expect(component).toBeDefined();
        const tree = component.toJSON();
        expect(tree).not.toBeNull();
      } finally {
        if (component) {
          await act(async () => {
            component.unmount();
          });
        }
      }
    }, 20000);
  });

  // ==========================================================================
  // 5. CROSS-COMPONENT END-TO-END PIPELINE SIMULATION
  // ==========================================================================
  describe("End-to-End Broadcast to Client Inbox Reception Journey", () => {
    it("simulates admin dispatch arriving in traveler inbox and user marking as read", async () => {
      // 1. Admin dispatches emergency broadcast
      const broadcastPayload = {
        title: "Heavy Rainfall Warning: Sylhet Trek Postponed",
        message: "Due to flash floods, trekking routes in Sylhet are suspended.",
        channel: "in_app" as const,
        target_audience: "travelers" as const,
      };

      const dispatchResult = await notificationAdminService.sendBroadcast(broadcastPayload);
      expect(dispatchResult).toBe(true);

      // 2. Realtime bridge pushes notification to traveler inbox
      act(() => {
        useNotificationStore.getState().addNotification({
          title: broadcastPayload.title,
          body: broadcastPayload.message,
          type: "system",
          data: { priority: "high", emergency: true },
        });
      });

      // 3. Verify traveler inbox reflects new unread item
      const travelerState = useNotificationStore.getState();
      expect(travelerState.unreadCount).toBe(2);
      expect(travelerState.notifications[0].title).toBe("Heavy Rainfall Warning: Sylhet Trek Postponed");
      expect(travelerState.notifications[0].is_read).toBe(false);

      // 4. Traveler clicks notification to read
      const emergencyNotifId = travelerState.notifications[0].id;
      act(() => {
        useNotificationStore.getState().markAsRead(emergencyNotifId);
      });

      // 5. Verify unread count decrements to 1 (only welcome notification remains unread)
      expect(useNotificationStore.getState().unreadCount).toBe(1);
      expect(useNotificationStore.getState().notifications[0].is_read).toBe(true);
    });
  });
});

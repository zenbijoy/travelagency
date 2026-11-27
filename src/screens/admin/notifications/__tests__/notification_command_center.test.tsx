/**
 * Admin Notification Command Center (All 13 Modules), Bilingual Template Validation,
 * PII Masking, Consumer Push Sync & Portal Scoped Alert Test Suite.
 */

import React from "react";
import renderer, { act } from "react-test-renderer";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

jest.mock("@expo/vector-icons", () => ({
  Ionicons: "Ionicons",
  MaterialCommunityIcons: "MaterialCommunityIcons",
  Feather: "Feather",
}));

jest.mock("expo-font", () => ({
  isLoaded: () => true,
  loadAsync: () => Promise.resolve(),
}));

jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn().mockResolvedValue(undefined),
  notificationAsync: jest.fn().mockResolvedValue(undefined),
  ImpactFeedbackStyle: { Light: "Light", Medium: "Medium", Heavy: "Heavy" },
  NotificationFeedbackType: { Success: "Success", Warning: "Warning", Error: "Error" },
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

const mockHasPermission = jest.fn(() => true);
jest.mock("../../../../screens/admin/rbac", () => ({
  useRBAC: () => ({
    admin: {
      id: "admin-1",
      name: "Notification Operator",
      email: "ops@shopnojatra.com",
      role: "super_admin",
    },
    hasPermission: mockHasPermission,
  }),
}));

jest.mock("../../../../services/adminService", () => ({
  notificationAdminService: {
    getBroadcastHistory: jest.fn().mockResolvedValue([]),
    getScheduledNotifications: jest.fn().mockResolvedValue([]),
    sendBroadcast: jest.fn().mockResolvedValue(true),
    scheduleNotification: jest.fn().mockResolvedValue({ id: "sched-1" }),
    triggerScheduledNow: jest.fn().mockResolvedValue(true),
    cancelScheduledNotification: jest.fn().mockResolvedValue(true),
  },
}));

jest.mock("../../../../services/personalizationService", () => {
  const actual = jest.requireActual("../../../../services/personalizationService");
  return {
    ...actual,
    personalizationService: {
      ...actual.personalizationService,
      listSegments: jest.fn().mockResolvedValue([]),
      getAdminOverview: jest.fn().mockResolvedValue({
        total_profiles: 50,
        profiles_sufficient_data: 40,
        profiles_incomplete_data: 10,
        personalization_enabled_count: 45,
        total_decisions_24h: 120,
        ai_assisted_count_24h: 80,
        avg_relevance_score: 76.4,
        avg_confidence_score: 81.2,
        suppression_rate_pct: 9.5,
        fatigue_distribution: { low: 40, medium: 8, high: 2 },
        attributed_revenue_paisa_30d: 4500000,
        conversion_count_30d: 14,
        active_rule_version: 2,
      }),
      getOutbox: jest.fn().mockResolvedValue({
        items: [],
        total_count: 0,
        status_counts: { pending: 2, delivered: 18 },
      }),
      getDlq: jest.fn().mockResolvedValue({ items: [], total_count: 0 }),
    },
  };
});

import {
  CANONICAL_EVENT_CATALOG,
  maskEmail,
  maskPhone,
  maskUserId,
  validateTemplateVariables,
  interpolateTemplateText,
} from "../../../../services/notificationCommandService";
import { PortalAlertsModal } from "../../../../components/notifications/PortalAlertsModal";
import { NotificationCenterScreen } from "../../NotificationCenterScreen";

function collectText(node: renderer.ReactTestInstance): string {
  const pieces: string[] = [];
  const walk = (n: renderer.ReactTestInstance | string) => {
    if (typeof n === "string") {
      pieces.push(n);
      return;
    }
    if (Array.isArray(n.children)) {
      for (const ch of n.children) walk(ch as any);
    }
  };
  walk(node);
  return pieces.join(" ");
}

const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("Notification Command Center & Portals Suite", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockHasPermission.mockReturnValue(true);
  });

  it("masks PII recipients (email, phone, user IDs) consistently", () => {
    expect(maskEmail("tanvir.ahmed@gmail.com")).toBe("ta***@g***.com");
    expect(maskPhone("+8801712345689")).toBe("+880****89");
    expect(maskUserId("11111111-2222-3333-4444-555555555555")).toBe("111111...5555");
  });

  it("validates bilingual EN/BN template {{variables}} and detects mismatches", () => {
    const valid = validateTemplateVariables({
      enTitle: "Flight {{flight_no}} Updated",
      enBody: "Departs at {{new_time}}",
      bnTitle: "ফ্লাইট {{flight_no}} আপডেট",
      bnBody: "নতুন সময় {{new_time}}",
      sampleValues: { flight_no: "BS-141", new_time: "14:20" },
    });
    expect(valid.valid).toBe(true);
    expect(valid.missingVariables).toEqual([]);
    expect(valid.enBnParityMismatch).toEqual([]);

    const mismatch = validateTemplateVariables({
      enTitle: "Trip to {{destination}}",
      enBody: "Price ৳{{price_bdt}}",
      bnTitle: "ভ্রমণ {{destination}}",
      bnBody: "বিশেষ অফার",
      sampleValues: { destination: "Sylhet" },
    });
    expect(mismatch.missingVariables).toContain("price_bdt");
    expect(mismatch.enBnParityMismatch).toContain("price_bdt");

    expect(interpolateTemplateText("Hello {{destination}}", { destination: "Sylhet" })).toBe(
      "Hello Sylhet"
    );
  });

  it("contains all 34 canonical domain events across 8 categories", () => {
    expect(CANONICAL_EVENT_CATALOG.length).toBe(34);
    const domains = new Set(CANONICAL_EVENT_CATALOG.map((e) => e.domain));
    expect(domains.size).toBe(8);
  });

  it("renders all 13 Admin Notification Command Center modules and RBAC safeguards", async () => {
    mockHasPermission.mockReturnValue(false);
    let tree: renderer.ReactTestRenderer | null = null;
    try {
      await act(async () => {
        tree = renderer.create(<NotificationCenterScreen />);
        await flushPromises();
      });

      const txt = collectText(tree!.root);
      expect(txt).toContain("Dispatch Campaign");
      expect(txt).toContain("AI Overview");
      expect(txt).toContain("Live Ops");
      expect(txt).toContain("Event Catalog");
      expect(txt).toContain("Templates (EN/BN)");
      expect(txt).toContain("Rules & Weights");
      expect(txt).toContain("AI Preview Lab");
      expect(txt).toContain("Segments");
      expect(txt).toContain("Scheduled Queue");
      expect(txt).toContain("Delivery Logs");
      expect(txt).toContain("Outbox & DLQ");
      expect(txt).toContain("Analytics & A/B");
      expect(txt).toContain("Provider Health");
      expect(txt).toContain("RBAC Safeguard");
    } finally {
      if (tree) {
        await act(async () => {
          tree!.unmount();
        });
      }
    }
  }, 20000);

  it("enforces strict tenant isolation inside PortalAlertsModal", async () => {
    let tree: renderer.ReactTestRenderer | null = null;
    try {
      await act(async () => {
        tree = renderer.create(
          <PortalAlertsModal
            visible={true}
            portalType="agency"
            tenantId="AG-ALPHA"
            alerts={[
              {
                id: "a1",
                portal_type: "agency",
                tenant_id: "AG-ALPHA",
                title: "Alpha Payout Verified",
                body: "৳50,000 settled",
                category: "agency",
                priority: "normal",
                deep_link: "/agency",
                is_read: false,
                created_at: new Date().toISOString(),
                source: "backend",
              },
              {
                id: "a2",
                portal_type: "agency",
                tenant_id: "AG-OTHER-TENANT",
                title: "Secret Beta Alert",
                body: "Must never appear",
                category: "agency",
                priority: "high",
                deep_link: "/agency",
                is_read: false,
                created_at: new Date().toISOString(),
                source: "backend",
              },
            ]}
            onClose={jest.fn()}
            onMarkRead={jest.fn()}
            onMarkAllRead={jest.fn()}
          />
        );
        await flushPromises();
      });

      const txt = collectText(tree!.root);
      expect(txt).toContain("Alpha Payout Verified");
      expect(txt).not.toContain("Secret Beta Alert");
    } finally {
      if (tree) {
        await act(async () => {
          tree!.unmount();
        });
      }
    }
  });
});

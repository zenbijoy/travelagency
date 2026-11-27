/**
 * Notification Center Screen - Admin Panel
 * Multi-Channel Broadcast Center, Audience & Dynamic Segment Targeting,
 * and Hyper-Personalized Notification Intelligence Command Center (7 Tabs + Outbox/DLQ Ops)
 */

import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Switch,
} from "react-native";
import { MaterialCommunityIcons, Ionicons, Feather } from "@expo/vector-icons";
import { notificationAdminService } from "@/services/adminService";
import {
  personalizationService,
  formatPersonalizationError,
  BUILTIN_SEGMENTS_META,
  SegmentResponse,
  PersonalizedBroadcastResponse,
  BudgetTier,
} from "../../services/personalizationService";
import { useRBAC } from "./rbac";
import { EmptyState } from "../../components/ui/EmptyState";
import { ErrorStateCard } from "../../components/common/ErrorStateCard";
import { PersonalizationOverviewTab } from "./notifications/PersonalizationOverviewTab";
import { ProfileExplorerTab } from "./notifications/ProfileExplorerTab";
import { PersonalizationRulesTab } from "./notifications/PersonalizationRulesTab";
import { AiPersonalizationLabTab } from "./notifications/AiPersonalizationLabTab";
import { SegmentBuilderTab } from "./notifications/SegmentBuilderTab";
import { FatigueMonitoringTab } from "./notifications/FatigueMonitoringTab";
import { PerformanceAnalyticsTab } from "./notifications/PerformanceAnalyticsTab";
import { DlqAndOpsTab } from "./notifications/DlqAndOpsTab";
import { LiveOpsTab } from "./notifications/LiveOpsTab";
import { EventCatalogTab } from "./notifications/EventCatalogTab";
import { TemplateManagerTab } from "./notifications/TemplateManagerTab";
import { DeliveryLogsTab } from "./notifications/DeliveryLogsTab";
import { ProviderHealthTab } from "./notifications/ProviderHealthTab";
import {
  notificationCommandService,
  AudiencePreviewResult,
  ScheduledCampaignRecord,
  NotificationTemplateRecord,
} from "../../services/notificationCommandService";
import { validateNotificationDeepLink } from "../../services/navigation/notificationDeepLinkRegistry";

const SCHEDULER_TIMEZONES = [
  "Asia/Dhaka",
  "UTC",
  "Asia/Dubai",
  "Asia/Singapore",
  "Europe/London",
] as const;

export type NotificationCenterTab =
  | "compose"
  | "history"
  | "scheduled"
  | "overview"
  | "profiles"
  | "rules"
  | "lab"
  | "segments"
  | "fatigue"
  | "analytics"
  | "dlq"
  | "events"
  | "providers"
  | "live_ops"
  | "templates"
  | "delivery_logs";

type MaterialIconName = React.ComponentProps<typeof MaterialCommunityIcons>["name"];

export const NotificationCenterScreen: React.FC = () => {
  const { admin, hasPermission } = useRBAC();
  const canSendNotifications =
    typeof hasPermission === "function" ? hasPermission("notifications.send") : true;
  const [activeTab, setActiveTab] = useState<NotificationCenterTab>("compose");

  // Form State (Preserved Compose + Enhanced Personalized Segment Targeting)
  const [broadcastTitle, setBroadcastTitle] = useState("");
  const [broadcastMessage, setBroadcastMessage] = useState("");
  const [deepLink, setDeepLink] = useState("/(tabs)");
  const [channel, setChannel] = useState<"push" | "in_app" | "email" | "sms">("push");
  const [targetingMode, setTargetingMode] = useState<"audience" | "segment">("audience");
  const [targetAudience, setTargetAudience] = useState<
    "all" | "travelers" | "agencies" | "inactive" | "vip"
  >("travelers");
  const [selectedSegmentKey, setSelectedSegmentKey] = useState<string>("family_travelers");
  const [campaignCategory, setCampaignCategory] = useState<string>("marketing");
  const [campaignDestination, setCampaignDestination] = useState<string>("");
  const [campaignBudgetTier, setCampaignBudgetTier] = useState<BudgetTier>("flexible");
  const [allowAiEnrichment, setAllowAiEnrichment] = useState<boolean>(true);
  const [availableSegments, setAvailableSegments] = useState<SegmentResponse[]>([]);
  const [segmentsLoaded, setSegmentsLoaded] = useState(false);
  const [segmentsError, setSegmentsError] = useState<string | null>(null);
  const [personalizedResult, setPersonalizedResult] =
    useState<PersonalizedBroadcastResponse | null>(null);

  const [isScheduled, setIsScheduled] = useState(false);
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledTimezone, setScheduledTimezone] = useState<string>("Asia/Dhaka");
  const [audiencePreview, setAudiencePreview] = useState<AudiencePreviewResult | null>(null);
  const [previewingAudience, setPreviewingAudience] = useState(false);
  const [campaignsList, setCampaignsList] = useState<ScheduledCampaignRecord[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // History & Queue State
  const [broadcastHistory, setBroadcastHistory] = useState<any[]>([]);
  const [scheduledList, setScheduledList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [history, scheduled, campaigns] = await Promise.all([
        notificationAdminService.getBroadcastHistory(50),
        notificationAdminService.getScheduledNotifications(),
        notificationCommandService.listCampaigns().catch(() => []),
      ]);
      setBroadcastHistory(history || []);
      setScheduledList(scheduled || []);
      setCampaignsList(campaigns || []);
    } catch (err: any) {
      console.error("Error loading notification data:", err);
      setError(err?.message || "Failed to load notification history.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const loadSegmentsForCompose = useCallback(async () => {
    try {
      setSegmentsError(null);
      const list = await personalizationService.listSegments();
      setAvailableSegments(list);
      setSegmentsLoaded(true);
    } catch (err) {
      setSegmentsError(formatPersonalizationError(err).message);
      setSegmentsLoaded(false);
    }
  }, []);

  const handleSelectTargetingMode = (mode: "audience" | "segment") => {
    setTargetingMode(mode);
    setPersonalizedResult(null);
    if (mode === "segment" && !segmentsLoaded) {
      loadSegmentsForCompose();
    }
  };

  const handleTargetSegmentFromBuilder = (segmentKey: string) => {
    setSelectedSegmentKey(segmentKey);
    setTargetingMode("segment");
    setActiveTab("compose");
    if (!segmentsLoaded) {
      loadSegmentsForCompose();
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
  };

  const deepLinkValidation = validateNotificationDeepLink(deepLink);

  const handlePreviewAudience = async () => {
    try {
      setPreviewingAudience(true);
      const res = await notificationCommandService.previewBroadcastAudience({
        targetingMode,
        targetAudience,
        segmentKey: selectedSegmentKey,
      });
      setAudiencePreview(res);
    } finally {
      setPreviewingAudience(false);
    }
  };

  const handleApplyTemplateFromManager = (
    tpl: NotificationTemplateRecord,
    lang: "en" | "bn"
  ) => {
    setBroadcastTitle(lang === "bn" ? tpl.bn_title : tpl.en_title);
    setBroadcastMessage(lang === "bn" ? tpl.bn_body : tpl.en_body);
    setDeepLink(tpl.default_deep_link || "/(tabs)");
    setCampaignCategory(tpl.category || "marketing");
    setActiveTab("compose");
  };

  const handleCampaignPauseResume = async (
    id: string,
    action: "pause" | "resume" | "cancel"
  ) => {
    try {
      await notificationCommandService.controlCampaign(id, action);
      Alert.alert("Updated", `Campaign status changed (${action}).`);
      loadData();
    } catch (err: any) {
      Alert.alert("Action Failed", err?.message || "Could not update scheduled campaign.");
    }
  };

  // Immediate Broadcast Handler with Safety Safeguards
  const handleBroadcast = () => {
    if (!canSendNotifications) {
      Alert.alert("RBAC Restricted", "Your admin role does not hold notifications.send permission.");
      return;
    }
    if (!broadcastTitle.trim() || !broadcastMessage.trim()) {
      Alert.alert("Validation Error", "Notification title and message content are required.");
      return;
    }
    if (!deepLinkValidation.valid) {
      Alert.alert("Invalid Deep Link", deepLinkValidation.reason || "Blocked unsafe deep link.");
      return;
    }

    if (targetingMode === "segment") {
      Alert.alert(
        "Confirm Personalized Segment Dispatch",
        `Evaluate segment "${selectedSegmentKey}" per recipient through the 24-Step Personalization Decision Pipeline?\n\nTitle: ${broadcastTitle}`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Evaluate & Dispatch",
            style: "destructive",
            onPress: async () => {
              try {
                setIsSubmitting(true);
                setPersonalizedResult(null);
                const res = await personalizationService.sendPersonalizedBroadcast({
                  title: broadcastTitle.trim(),
                  message: broadcastMessage.trim(),
                  category: campaignCategory.trim() || "marketing",
                  channel,
                  segment_key: selectedSegmentKey,
                  destination: campaignDestination.trim() || null,
                  budget_tier: campaignBudgetTier,
                  deep_link: deepLink.trim() || "/(tabs)",
                  allow_ai_enrichment: allowAiEnrichment,
                });
                setPersonalizedResult(res);
                Alert.alert(
                  "Personalized Campaign Dispatched",
                  `Evaluated ${res.total_candidates} candidates: ${res.dispatched_count} dispatched, ${res.rescheduled_count} rescheduled, ${res.suppressed_count} suppressed.`
                );
                loadData();
              } catch (err) {
                Alert.alert("Dispatch Error", formatPersonalizationError(err).message);
              } finally {
                setIsSubmitting(false);
              }
            },
          },
        ]
      );
      return;
    }

    Alert.alert(
      "Confirm Multi-Channel Broadcast",
      `Are you sure you want to dispatch this ${channel.toUpperCase()} message to target audience "${targetAudience.toUpperCase()}"?\n\nTitle: ${broadcastTitle}`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Yes, Dispatch Now",
          style: "destructive",
          onPress: async () => {
            try {
              setIsSubmitting(true);
              const success = await notificationAdminService.sendBroadcast({
                title: broadcastTitle,
                message: broadcastMessage,
                channel,
                target_audience: targetAudience,
                deep_link: deepLink,
              });

              if (success) {
                Alert.alert(
                  "Broadcast Successful",
                  `Dispatched ${channel.toUpperCase()} notification to ${targetAudience}.`
                );
                setBroadcastTitle("");
                setBroadcastMessage("");
                loadData();
              } else {
                Alert.alert("Error", "Failed to dispatch broadcast.");
              }
            } catch (err: any) {
              Alert.alert("Dispatch Error", err?.message || "Failed to broadcast notification.");
            } finally {
              setIsSubmitting(false);
            }
          },
        },
      ]
    );
  };

  // Safe Test Send (Sends strictly to Admin device without mass broadcast)
  const handleSendTest = async () => {
    if (!canSendNotifications) {
      Alert.alert("RBAC Restricted", "Your admin role does not hold notifications.send permission.");
      return;
    }
    if (!broadcastTitle.trim() || !broadcastMessage.trim()) {
      Alert.alert("Validation Error", "Notification title and message content are required.");
      return;
    }
    if (!deepLinkValidation.valid) {
      Alert.alert("Invalid Deep Link", deepLinkValidation.reason || "Blocked unsafe deep link.");
      return;
    }

    try {
      setIsSubmitting(true);
      await notificationAdminService.sendBroadcast({
        title: `[TEST] ${broadcastTitle}`,
        message: broadcastMessage,
        channel: "in_app",
        target_audience: "vip",
        deep_link: deepLink,
      });
      Alert.alert(
        "Test Notification Dispatched",
        "Test message successfully delivered to your admin session."
      );
      loadData();
    } catch (err: any) {
      Alert.alert("Test Failed", err?.message || "Could not send test notification.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Schedule Notification
  const handleSchedule = async () => {
    if (!canSendNotifications) {
      Alert.alert("RBAC Restricted", "Your admin role does not hold notifications.send permission.");
      return;
    }
    if (!broadcastTitle.trim() || !broadcastMessage.trim()) {
      Alert.alert("Validation Error", "Notification title and message content are required.");
      return;
    }
    if (!deepLinkValidation.valid) {
      Alert.alert("Invalid Deep Link", deepLinkValidation.reason || "Blocked unsafe deep link.");
      return;
    }
    const targetTime = scheduledDate || new Date(Date.now() + 3600000).toISOString();

    try {
      setIsSubmitting(true);
      if (targetingMode === "segment") {
        const res = await personalizationService.sendPersonalizedBroadcast({
          title: broadcastTitle.trim(),
          message: broadcastMessage.trim(),
          category: campaignCategory.trim() || "marketing",
          channel,
          segment_key: selectedSegmentKey,
          destination: campaignDestination.trim() || null,
          budget_tier: campaignBudgetTier,
          deep_link: deepLink.trim() || "/(tabs)",
          allow_ai_enrichment: allowAiEnrichment,
          scheduled_for: targetTime,
        });
        setPersonalizedResult(res);
        Alert.alert(
          "Personalized Campaign Scheduled",
          `Queued for ${new Date(targetTime).toLocaleString()} (${res.approved_count} approved, ${res.suppressed_count} suppressed).`
        );
      } else {
        await notificationAdminService.scheduleNotification({
          title: broadcastTitle,
          message: broadcastMessage,
          channel,
          target_audience: targetAudience,
          deep_link: deepLink,
          scheduled_time: targetTime,
        });
        Alert.alert(
          "Scheduled",
          `Notification queued for delivery at ${new Date(targetTime).toLocaleString()}.`
        );
        setActiveTab("scheduled");
      }
      setBroadcastTitle("");
      setBroadcastMessage("");
      loadData();
    } catch (err: any) {
      Alert.alert("Error", err?.message || "Failed to schedule notification.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Trigger Scheduled Notification Immediately
  const handleTriggerNow = async (id: string) => {
    Alert.alert("Trigger Immediately", "Dispatch this queued scheduled notification now?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Send Now",
        onPress: async () => {
          await notificationAdminService.triggerScheduledNow(id);
          Alert.alert("Success", "Notification triggered for immediate dispatch.");
          loadData();
        },
      },
    ]);
  };

  // Cancel Scheduled Notification
  const handleCancelScheduled = async (id: string) => {
    await notificationAdminService.cancelScheduledNotification(id);
    Alert.alert("Cancelled", "Scheduled notification cancelled.");
    loadData();
  };

  const tabItems: ReadonlyArray<{
    id: NotificationCenterTab;
    label: string;
    icon: MaterialIconName;
  }> = [
    { id: "compose", label: "Dispatch Campaign", icon: "send-outline" },
    { id: "overview", label: "AI Overview", icon: "brain" },
    { id: "live_ops", label: "Live Ops", icon: "pulse" },
    { id: "events", label: "Event Catalog", icon: "lightning-bolt-outline" },
    { id: "templates", label: "Templates (EN/BN)", icon: "translate" },
    { id: "rules", label: "Rules & Weights", icon: "tune-vertical" },
    { id: "lab", label: "AI Preview Lab", icon: "flask-outline" },
    { id: "segments", label: "Segments", icon: "account-group-outline" },
    { id: "scheduled", label: `Scheduled Queue (${campaignsList.length || scheduledList.length})`, icon: "clock-outline" },
    { id: "delivery_logs", label: "Delivery Logs", icon: "format-list-bulleted" },
    { id: "dlq", label: "Outbox & DLQ", icon: "tray-alert" },
    { id: "analytics", label: "Analytics & A/B", icon: "chart-line" },
    { id: "providers", label: "Provider Health", icon: "server-network" },
    { id: "history", label: `Broadcast History (${broadcastHistory.length})`, icon: "history" },
    { id: "profiles", label: "20D Profiles", icon: "account-details-outline" },
    { id: "fatigue", label: "Fatigue & Caps", icon: "speedometer" },
  ];

  const segmentChoices =
    availableSegments.length > 0
      ? availableSegments.map((s) => ({
          key: s.key,
          label: `${s.name} (${s.cached_member_count})`,
        }))
      : BUILTIN_SEGMENTS_META.map((s) => ({
          key: s.key,
          label: s.name,
        }));

  return (
    <ScrollView
      style={styles.container}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {/* Overview Stat Cards */}
      <View style={styles.metricsRow}>
        <View style={[styles.metricCard, { borderLeftColor: "#0284c7" }]}>
          <Text style={styles.metricLabel}>Total Dispatched</Text>
          <Text style={styles.metricValue}>{broadcastHistory.length}</Text>
          <Text style={styles.metricSubtext}>Recorded Broadcasts</Text>
        </View>

        <View style={[styles.metricCard, { borderLeftColor: "#f59e0b" }]}>
          <Text style={styles.metricLabel}>Queued Scheduled</Text>
          <Text style={styles.metricValue}>{scheduledList.length}</Text>
          <Text style={styles.metricSubtext}>Upcoming Deliveries</Text>
        </View>

        <TouchableOpacity
          style={[styles.metricCard, { borderLeftColor: "#6366f1" }]}
          onPress={() => setActiveTab("overview")}
          activeOpacity={0.85}
        >
          <Text style={styles.metricLabel}>Personalization Hub</Text>
          <Text style={styles.metricValue}>20D • 24-Step</Text>
          <Text style={styles.metricSubtext}>
            {admin?.role ? `Role: ${admin.role}` : "Open AI Overview for live KPIs"}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Scrollable Unified Tabs Bar */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabsScrollContent}
        style={styles.tabsScrollWrapper}
      >
        {tabItems.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <TouchableOpacity
              key={tab.id}
              style={[styles.tabBtn, isActive && styles.tabBtnActive]}
              onPress={() => setActiveTab(tab.id)}
            >
              <MaterialCommunityIcons
                name={tab.icon}
                size={17}
                color={isActive ? "#fff" : "#64748b"}
              />
              <Text style={[styles.tabText, isActive && styles.tabTextActive]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {error && (activeTab === "compose" || activeTab === "history" || activeTab === "scheduled") && (
        <ErrorStateCard message={error} onRetry={loadData} />
      )}

      {/* TAB 1: COMPOSE & DISPATCH */}
      {activeTab === "compose" && (
        <View style={styles.composeContainer}>
          {/* Dispatch Channel Picker */}
          <Text style={styles.inputLabel}>SELECT DISPATCH CHANNEL</Text>
          <View style={styles.channelRow}>
            {(
              [
                { id: "push", label: "Push Notification", icon: "cellphone-message" },
                { id: "in_app", label: "In-App Banner", icon: "bell-badge-outline" },
                { id: "email", label: "Email Campaign", icon: "email-outline" },
                { id: "sms", label: "SMS Blast", icon: "message-processing-outline" },
              ] as const
            ).map((c) => (
              <TouchableOpacity
                key={c.id}
                style={[styles.channelCard, channel === c.id && styles.channelCardActive]}
                onPress={() => setChannel(c.id)}
              >
                <MaterialCommunityIcons
                  name={c.icon}
                  size={20}
                  color={channel === c.id ? "#0284c7" : "#64748b"}
                />
                <Text
                  style={[styles.channelCardText, channel === c.id && styles.channelCardTextActive]}
                >
                  {c.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Targeting Mode: Standard Audience vs Personalized Segment */}
          <Text style={styles.inputLabel}>TARGETING ENGINE MODE</Text>
          <View style={styles.modeToggleRow}>
            <TouchableOpacity
              style={[
                styles.modeToggleBtn,
                targetingMode === "audience" && styles.modeToggleBtnActive,
              ]}
              onPress={() => handleSelectTargetingMode("audience")}
            >
              <Text
                style={[
                  styles.modeToggleText,
                  targetingMode === "audience" && styles.modeToggleTextActive,
                ]}
              >
                Standard Audience
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.modeToggleBtn,
                targetingMode === "segment" && styles.modeToggleBtnActive,
              ]}
              onPress={() => handleSelectTargetingMode("segment")}
            >
              <Text
                style={[
                  styles.modeToggleText,
                  targetingMode === "segment" && styles.modeToggleTextActive,
                ]}
              >
                Personalized Segment (24-Step Pipeline)
              </Text>
            </TouchableOpacity>
          </View>

          {targetingMode === "audience" ? (
            <>
              <Text style={styles.inputLabel}>TARGET RECIPIENT AUDIENCE</Text>
              <View style={styles.audienceRow}>
                {(
                  [
                    { id: "travelers", label: "All Active Travelers" },
                    { id: "agencies", label: "B2B Agencies" },
                    { id: "vip", label: "VIP / Elite Loyalty" },
                    { id: "inactive", label: "Inactive (>30 Days)" },
                    { id: "all", label: "System-Wide (Everyone)" },
                  ] as const
                ).map((a) => (
                  <TouchableOpacity
                    key={a.id}
                    style={[
                      styles.audiencePill,
                      targetAudience === a.id && styles.audiencePillActive,
                    ]}
                    onPress={() => setTargetAudience(a.id)}
                  >
                    <Text
                      style={[
                        styles.audiencePillText,
                        targetAudience === a.id && styles.audiencePillTextActive,
                      ]}
                    >
                      {a.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          ) : (
            <View style={styles.segmentTargetBox}>
              <View style={styles.segmentHeaderRow}>
                <Text style={styles.inputLabel}>SELECT DYNAMIC SEGMENT</Text>
                <TouchableOpacity onPress={() => setActiveTab("segments")}>
                  <Text style={styles.manageSegLink}>Open Segment Builder →</Text>
                </TouchableOpacity>
              </View>
              {segmentsError && (
                <Text style={styles.segmentWarnText}>
                  Live segment counts unavailable ({segmentsError}). Showing canonical segment keys.
                </Text>
              )}
              <View style={styles.audienceRow}>
                {segmentChoices.map((seg) => (
                  <TouchableOpacity
                    key={seg.key}
                    style={[
                      styles.audiencePill,
                      selectedSegmentKey === seg.key && styles.audiencePillActive,
                    ]}
                    onPress={() => setSelectedSegmentKey(seg.key)}
                  >
                    <Text
                      style={[
                        styles.audiencePillText,
                        selectedSegmentKey === seg.key && styles.audiencePillTextActive,
                      ]}
                    >
                      {seg.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.segmentMetaRow}>
                <View style={styles.segmentMetaCol}>
                  <Text style={styles.inputLabel}>CAMPAIGN CATEGORY</Text>
                  <TextInput
                    style={styles.textInput}
                    value={campaignCategory}
                    onChangeText={setCampaignCategory}
                    placeholder="marketing"
                    placeholderTextColor="#94a3b8"
                  />
                </View>
                <View style={styles.segmentMetaCol}>
                  <Text style={styles.inputLabel}>DESTINATION CONTEXT</Text>
                  <TextInput
                    style={styles.textInput}
                    value={campaignDestination}
                    onChangeText={setCampaignDestination}
                    placeholder="e.g. Sylhet (optional)"
                    placeholderTextColor="#94a3b8"
                  />
                </View>
                <View style={styles.segmentMetaCol}>
                  <Text style={styles.inputLabel}>OFFER BUDGET TIER</Text>
                  <TextInput
                    style={styles.textInput}
                    value={campaignBudgetTier}
                    onChangeText={(txt) => setCampaignBudgetTier((txt || "flexible") as BudgetTier)}
                    placeholder="flexible"
                    placeholderTextColor="#94a3b8"
                  />
                </View>
              </View>

              <View style={styles.switchRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.switchTitle}>Allow Non-Gating AI Copy Personalization</Text>
                  <Text style={styles.switchSubtitle}>
                    Enriches EN/BN message per user confidence tier with factual validation
                  </Text>
                </View>
                <Switch
                  value={allowAiEnrichment}
                  onValueChange={setAllowAiEnrichment}
                  trackColor={{ false: "#cbd5e1", true: "#0284c7" }}
                />
              </View>
            </View>
          )}

          {/* Subject / Title */}
          <Text style={styles.inputLabel}>MESSAGE TITLE / SUBJECT</Text>
          <TextInput
            style={styles.textInput}
            placeholder="e.g. ⚡ Flash Weekend Getaway: 25% Off Cox's Bazar Flights!"
            value={broadcastTitle}
            onChangeText={setBroadcastTitle}
            placeholderTextColor="#94a3b8"
          />

          {/* Body Content */}
          <Text style={styles.inputLabel}>NOTIFICATION CONTENT / PAYLOAD</Text>
          <TextInput
            style={[styles.textInput, styles.textArea]}
            multiline
            numberOfLines={4}
            placeholder="Enter the full message payload to be displayed on user lockscreens or notification centers..."
            value={broadcastMessage}
            onChangeText={setBroadcastMessage}
            placeholderTextColor="#94a3b8"
          />

          {/* Deep Link URL */}
          <Text style={styles.inputLabel}>DEEP LINK DESTINATION ROUTE</Text>
          <TextInput
            style={styles.textInput}
            placeholder="e.g. /screens/flights or /screens/hotels-homes"
            value={deepLink}
            onChangeText={setDeepLink}
            placeholderTextColor="#94a3b8"
          />
          <Text
            style={{
              fontSize: 11,
              fontWeight: "600",
              color: deepLinkValidation.valid ? "#059669" : "#dc2626",
              marginBottom: 8,
            }}
          >
            {deepLinkValidation.valid
              ? `✓ Valid internal destination: ${deepLinkValidation.normalizedRoute}`
              : `✕ ${deepLinkValidation.reason}`}
          </Text>

          {/* Audience Estimation Safeguard */}
          <View style={styles.switchRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.switchTitle}>Audience Estimate Before Dispatch</Text>
              <Text style={styles.switchSubtitle}>
                {audiencePreview
                  ? `Estimated: ${audiencePreview.estimated_count} recipients (${audiencePreview.source})`
                  : "Preview estimated audience size safely before broadcasting"}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.testBtn}
              onPress={handlePreviewAudience}
              disabled={previewingAudience}
            >
              {previewingAudience ? (
                <ActivityIndicator size="small" color="#0284c7" />
              ) : (
                <Text style={styles.testBtnText}>Preview Count</Text>
              )}
            </TouchableOpacity>
          </View>

          {!canSendNotifications && (
            <View style={styles.rbacBanner}>
              <Text style={styles.rbacBannerText}>
                RBAC Safeguard: Role "{admin?.role || "viewer"}" lacks notifications.send permission. Live dispatch actions are locked.
              </Text>
            </View>
          )}

          {/* Schedule Switch */}
          <View style={styles.switchRow}>
            <View>
              <Text style={styles.switchTitle}>Schedule For Future Delivery</Text>
              <Text style={styles.switchSubtitle}>
                Queue broadcast to fire at a specified ISO time
              </Text>
            </View>
            <Switch
              value={isScheduled}
              onValueChange={setIsScheduled}
              trackColor={{ false: "#cbd5e1", true: "#0284c7" }}
            />
          </View>

          {isScheduled && (
            <View style={{ marginBottom: 16 }}>
              <Text style={styles.inputLabel}>SCHEDULED TIME (ISO FORMAT)</Text>
              <TextInput
                style={styles.textInput}
                placeholder="e.g. 2026-12-01T10:00:00Z"
                value={scheduledDate}
                onChangeText={setScheduledDate}
                placeholderTextColor="#94a3b8"
              />
              <Text style={styles.inputLabel}>DELIVERY TIMEZONE</Text>
              <View style={styles.audienceRow}>
                {SCHEDULER_TIMEZONES.map((tz) => (
                  <TouchableOpacity
                    key={tz}
                    style={[
                      styles.audiencePill,
                      scheduledTimezone === tz && styles.audiencePillActive,
                    ]}
                    onPress={() => setScheduledTimezone(tz)}
                  >
                    <Text
                      style={[
                        styles.audiencePillText,
                        scheduledTimezone === tz && styles.audiencePillTextActive,
                      ]}
                    >
                      {tz}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {/* Live Phone Mockup Preview */}
          <Text style={styles.inputLabel}>LIVE MOBILE LOCKSCREEN PREVIEW</Text>
          <View style={styles.previewBox}>
            <View style={styles.previewHeader}>
              <View style={styles.previewAppBadge}>
                <MaterialCommunityIcons name="airplane-takeoff" size={14} color="#fff" />
              </View>
              <Text style={styles.previewAppName}>ShopnoJatra • Now</Text>
              <View style={styles.previewChannelBadge}>
                <Text style={styles.previewChannelText}>{channel.toUpperCase()}</Text>
              </View>
            </View>
            <Text style={styles.previewTitle}>
              {broadcastTitle.trim() || "Notification Subject Heading"}
            </Text>
            <Text style={styles.previewBody}>
              {broadcastMessage.trim() ||
                "Notification body content will appear here on the traveler's device."}
            </Text>
            {deepLink && <Text style={styles.previewDeepLink}>Destination: {deepLink}</Text>}
          </View>

          {personalizedResult && (
            <View style={styles.personalizedSummaryBox}>
              <Text style={styles.personalizedSummaryTitle}>
                24-Step Pipeline Dispatch Summary ({selectedSegmentKey})
              </Text>
              <Text style={styles.personalizedSummaryMeta}>
                Candidates: {personalizedResult.total_candidates} • Approved:{" "}
                {personalizedResult.approved_count} • Dispatched:{" "}
                {personalizedResult.dispatched_count} • Rescheduled:{" "}
                {personalizedResult.rescheduled_count} • Suppressed:{" "}
                {personalizedResult.suppressed_count}
              </Text>
            </View>
          )}

          {/* Actions */}
          <View style={styles.actionButtonsRow}>
            <TouchableOpacity
              style={styles.testBtn}
              onPress={handleSendTest}
              disabled={isSubmitting}
            >
              <Feather name="shield" size={16} color="#0284c7" />
              <Text style={styles.testBtnText}>Send Test to Admin</Text>
            </TouchableOpacity>

            {!isScheduled ? (
              <TouchableOpacity
                style={styles.dispatchBtn}
                onPress={handleBroadcast}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons name="send" size={16} color="#fff" />
                    <Text style={styles.dispatchBtnText}>
                      {targetingMode === "segment"
                        ? "Dispatch to Segment"
                        : "Broadcast Now"}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={styles.scheduleBtn}
                onPress={handleSchedule}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons name="time-outline" size={18} color="#fff" />
                    <Text style={styles.scheduleBtnText}>Schedule Dispatch</Text>
                  </>
                )}
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      {/* TAB 2: BROADCAST HISTORY */}
      {activeTab === "history" && (
        <View style={styles.tabContent}>
          {broadcastHistory.length === 0 ? (
            <EmptyState
              title="No Broadcast History"
              description="No broadcast campaigns have been recorded yet."
              type="generic"
            />
          ) : (
            broadcastHistory.map((item) => (
              <View key={item.id} style={styles.historyCard}>
                <View style={styles.historyCardHeader}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <MaterialCommunityIcons
                      name={item.channel === "push" ? "cellphone-message" : "email-outline"}
                      size={18}
                      color="#0284c7"
                    />
                    <Text style={styles.historyTitle}>{item.title}</Text>
                  </View>
                  <View style={styles.historyStatusBadge}>
                    <Text style={styles.historyStatusText}>
                      {(item.status || "SENT").toUpperCase()}
                    </Text>
                  </View>
                </View>

                <Text style={styles.historyBody}>{item.message}</Text>

                <View style={styles.historyFooter}>
                  <Text style={styles.historyMeta}>
                    Target: {item.target_audience || "all"} • Sent:{" "}
                    {new Date(item.created_at || item.sent_at).toLocaleString()}
                  </Text>
                  {item.sent_count ? (
                    <Text style={styles.historyCount}>{item.sent_count} Recipients</Text>
                  ) : null}
                </View>
              </View>
            ))
          )}
        </View>
      )}

      {/* TAB 3: SCHEDULED QUEUE (Timezone-aware + Pause/Resume/Cancel) */}
      {activeTab === "scheduled" && (
        <View style={styles.tabContent}>
          {(campaignsList.length > 0 ? campaignsList : scheduledList).length === 0 ? (
            <EmptyState
              title="No Scheduled Broadcasts"
              description="There are no broadcasts queued for future execution."
              type="generic"
            />
          ) : (
            (campaignsList.length > 0 ? campaignsList : scheduledList).map((item: any) => {
              const statusStr = String(item.status || "scheduled").toLowerCase();
              const isPaused = statusStr === "paused";
              return (
                <View key={item.id} style={styles.scheduledCard}>
                  <View style={styles.scheduledCardHeader}>
                    <Text style={styles.scheduledTitle}>{item.title}</Text>
                    <View style={styles.scheduledPill}>
                      <Text style={styles.scheduledPillText}>{statusStr.toUpperCase()}</Text>
                    </View>
                  </View>
                  <Text style={styles.scheduledBody}>{item.message}</Text>
                  <Text style={styles.scheduledTimeText}>
                    Scheduled for: {new Date(item.scheduled_time).toLocaleString()} • TZ:{" "}
                    {item.timezone || "Asia/Dhaka"}
                  </Text>

                  <View style={[styles.scheduledActionsRow, { flexWrap: "wrap" }]}>
                    <TouchableOpacity
                      style={styles.triggerNowBtn}
                      onPress={() => handleTriggerNow(item.id)}
                    >
                      <Ionicons name="play" size={14} color="#059669" />
                      <Text style={styles.triggerNowText}>Dispatch Immediately</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.pauseResumeBtn}
                      onPress={() =>
                        handleCampaignPauseResume(item.id, isPaused ? "resume" : "pause")
                      }
                    >
                      <Ionicons
                        name={isPaused ? "play-circle-outline" : "pause-circle-outline"}
                        size={14}
                        color="#0284c7"
                      />
                      <Text style={styles.pauseResumeText}>
                        {isPaused ? "Resume" : "Pause"}
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.cancelScheduledBtn}
                      onPress={() => handleCancelScheduled(item.id)}
                    >
                      <Ionicons name="trash-outline" size={14} color="#ef4444" />
                      <Text style={styles.cancelScheduledText}>Cancel</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })
          )}
        </View>
      )}

      {/* COMMAND CENTER MODULES & PERSONALIZATION TABS */}
      {activeTab === "overview" && (
        <PersonalizationOverviewTab onNavigateTab={(tab) => setActiveTab(tab)} />
      )}
      {activeTab === "live_ops" && <LiveOpsTab />}
      {activeTab === "events" && <EventCatalogTab />}
      {activeTab === "templates" && (
        <TemplateManagerTab onApplyTemplateToCompose={handleApplyTemplateFromManager} />
      )}
      {activeTab === "profiles" && <ProfileExplorerTab />}
      {activeTab === "rules" && <PersonalizationRulesTab />}
      {activeTab === "lab" && <AiPersonalizationLabTab />}
      {activeTab === "segments" && (
        <SegmentBuilderTab onTargetSegmentInCompose={handleTargetSegmentFromBuilder} />
      )}
      {activeTab === "fatigue" && <FatigueMonitoringTab />}
      {activeTab === "delivery_logs" && <DeliveryLogsTab />}
      {activeTab === "analytics" && <PerformanceAnalyticsTab />}
      {activeTab === "dlq" && <DlqAndOpsTab />}
      {activeTab === "providers" && <ProviderHealthTab />}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8fafc",
    padding: 16,
  },
  metricsRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 16,
    flexWrap: "wrap",
  },
  metricCard: {
    flex: 1,
    minWidth: 160,
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 16,
    borderLeftWidth: 4,
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 2,
  },
  metricLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#64748b",
    textTransform: "uppercase",
    marginBottom: 4,
  },
  metricValue: {
    fontSize: 20,
    fontWeight: "700",
    color: "#0f172a",
  },
  metricSubtext: {
    fontSize: 11,
    color: "#94a3b8",
    marginTop: 4,
  },
  tabsScrollWrapper: {
    marginBottom: 18,
  },
  tabsScrollContent: {
    flexDirection: "row",
    backgroundColor: "#e2e8f0",
    borderRadius: 10,
    padding: 4,
    gap: 6,
  },
  tabBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 8,
    gap: 6,
  },
  tabBtnActive: {
    backgroundColor: "#0284c7",
    shadowColor: "#0284c7",
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 2,
  },
  tabText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#475569",
  },
  tabTextActive: {
    color: "#ffffff",
  },
  tabContent: {
    marginBottom: 40,
  },
  composeContainer: {
    backgroundColor: "#ffffff",
    borderRadius: 14,
    padding: 18,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    marginBottom: 40,
    shadowColor: "#000",
    shadowOpacity: 0.03,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 1,
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#475569",
    letterSpacing: 0.5,
    marginBottom: 8,
    marginTop: 12,
  },
  channelRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 6,
  },
  channelCard: {
    flex: 1,
    minWidth: 140,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 8,
  },
  channelCardActive: {
    backgroundColor: "#f0f9ff",
    borderColor: "#0284c7",
  },
  channelCardText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#475569",
  },
  channelCardTextActive: {
    color: "#0284c7",
  },
  modeToggleRow: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
    marginBottom: 4,
  },
  modeToggleBtn: {
    flex: 1,
    minWidth: 170,
    backgroundColor: "#f1f5f9",
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  modeToggleBtnActive: {
    backgroundColor: "#0f172a",
    borderColor: "#0f172a",
  },
  modeToggleText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#475569",
  },
  modeToggleTextActive: {
    color: "#ffffff",
  },
  segmentTargetBox: {
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 10,
    padding: 12,
    marginTop: 6,
  },
  segmentHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  manageSegLink: {
    fontSize: 12,
    fontWeight: "700",
    color: "#0284c7",
  },
  segmentWarnText: {
    fontSize: 11,
    color: "#b45309",
    marginBottom: 8,
  },
  segmentMetaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  segmentMetaCol: {
    flex: 1,
    minWidth: 140,
  },
  audienceRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 6,
  },
  audiencePill: {
    backgroundColor: "#f1f5f9",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  audiencePillActive: {
    backgroundColor: "#0284c7",
    borderColor: "#0284c7",
  },
  audiencePillText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#475569",
  },
  audiencePillTextActive: {
    color: "#ffffff",
  },
  textInput: {
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: "#0f172a",
    marginBottom: 6,
  },
  textArea: {
    minHeight: 90,
    textAlignVertical: "top",
  },
  switchRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#f8fafc",
    padding: 12,
    borderRadius: 8,
    marginVertical: 10,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  switchTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: "#1e293b",
  },
  switchSubtitle: {
    fontSize: 11,
    color: "#64748b",
    marginTop: 2,
  },
  previewBox: {
    backgroundColor: "#0f172a",
    borderRadius: 14,
    padding: 16,
    marginVertical: 12,
  },
  previewHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
    gap: 8,
  },
  previewAppBadge: {
    width: 22,
    height: 22,
    borderRadius: 6,
    backgroundColor: "#0284c7",
    alignItems: "center",
    justifyContent: "center",
  },
  previewAppName: {
    fontSize: 11,
    fontWeight: "600",
    color: "#94a3b8",
    flex: 1,
  },
  previewChannelBadge: {
    backgroundColor: "#1e293b",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  previewChannelText: {
    fontSize: 9,
    fontWeight: "700",
    color: "#38bdf8",
  },
  previewTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#ffffff",
    marginBottom: 4,
  },
  previewBody: {
    fontSize: 13,
    color: "#cbd5e1",
    lineHeight: 18,
  },
  previewDeepLink: {
    fontSize: 10,
    color: "#38bdf8",
    marginTop: 8,
    fontFamily: "monospace",
  },
  personalizedSummaryBox: {
    backgroundColor: "#f0fdf4",
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: "#bbf7d0",
    marginTop: 6,
  },
  personalizedSummaryTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: "#166534",
  },
  personalizedSummaryMeta: {
    fontSize: 11,
    color: "#15803d",
    marginTop: 3,
  },
  actionButtonsRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 14,
    flexWrap: "wrap",
  },
  testBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f0f9ff",
    borderWidth: 1,
    borderColor: "#bae6fd",
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 8,
    gap: 6,
  },
  testBtnText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#0284c7",
  },
  dispatchBtn: {
    flex: 1,
    minWidth: 160,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0284c7",
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 8,
    gap: 6,
  },
  dispatchBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#ffffff",
  },
  scheduleBtn: {
    flex: 1,
    minWidth: 160,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f59e0b",
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 8,
    gap: 6,
  },
  scheduleBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#ffffff",
  },
  historyCard: {
    backgroundColor: "#ffffff",
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  historyCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  historyTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0f172a",
  },
  historyStatusBadge: {
    backgroundColor: "#dcfce7",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  historyStatusText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#166534",
  },
  historyBody: {
    fontSize: 12,
    color: "#475569",
    marginBottom: 8,
    lineHeight: 16,
  },
  historyFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: 1,
    borderColor: "#f1f5f9",
    paddingTop: 8,
  },
  historyMeta: {
    fontSize: 11,
    color: "#94a3b8",
  },
  historyCount: {
    fontSize: 11,
    fontWeight: "600",
    color: "#0284c7",
  },
  scheduledCard: {
    backgroundColor: "#ffffff",
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  scheduledCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  scheduledTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0f172a",
  },
  scheduledPill: {
    backgroundColor: "#fef3c7",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  scheduledPillText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#b45309",
  },
  scheduledBody: {
    fontSize: 12,
    color: "#475569",
    marginBottom: 6,
  },
  scheduledTimeText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#0284c7",
    marginBottom: 10,
  },
  scheduledActionsRow: {
    flexDirection: "row",
    gap: 8,
    borderTopWidth: 1,
    borderColor: "#f1f5f9",
    paddingTop: 8,
  },
  triggerNowBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f0fdf4",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    gap: 4,
  },
  triggerNowText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#059669",
  },
  cancelScheduledBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fef2f2",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    gap: 4,
  },
  cancelScheduledText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#ef4444",
  },
  pauseResumeBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f0f9ff",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    gap: 4,
  },
  pauseResumeText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#0284c7",
  },
  rbacBanner: {
    backgroundColor: "#fef2f2",
    borderWidth: 1,
    borderColor: "#fecaca",
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
  },
  rbacBannerText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#991b1b",
  },
});

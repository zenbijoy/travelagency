/**
 * Personalization Rules & Weights Tab — Admin Personalization Command Center (Tab 3)
 * Interactive controls for:
 * - Enabling/disabling each of the 20 dimensions & configuring expiration days
 * - Editing the 10 relevance feature weights with live sum = 1.00 validation
 * - Confidence & relevance thresholds, time-decay lambda
 * - Allowed categories & channels, AI eligibility, and Adaptive Timing config
 * - Rule Version History & 1-click Rollback
 */

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Switch,
  Alert,
  ActivityIndicator,
} from "react-native";
import { MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import {
  personalizationService,
  formatPersonalizationError,
  CANONICAL_DIMENSION_KEYS,
  DEFAULT_RELEVANCE_WEIGHTS,
  RulesListResponse,
  RuleConfigSchema,
} from "../../../services/personalizationService";
import {
  notificationCommandService,
  DeterministicAutomationRule,
  RuleDryRunResponse,
  RuleConditionOperator,
} from "../../../services/notificationCommandService";
import { LoadingState } from "../../../components/ui/LoadingState";
import { ErrorStateCard } from "../../../components/common/ErrorStateCard";

const ALL_CATEGORIES = [
  "booking",
  "security",
  "flight_alerts",
  "price_alerts",
  "discovery",
  "digest",
  "reactivation",
  "marketing",
  "community",
] as const;

const ALL_CHANNELS = ["push", "in_app", "email", "sms"] as const;
const ALL_WINDOWS = ["morning", "afternoon", "evening", "late_evening"] as const;

const WINDOW_HOUR_MAP: Record<string, { start_hour: number; end_hour: number }> = {
  morning: { start_hour: 8, end_hour: 11 },
  afternoon: { start_hour: 12, end_hour: 16 },
  evening: { start_hour: 17, end_hour: 20 },
  late_evening: { start_hour: 20, end_hour: 21 },
};

function hydrateWindowLabels(rawWindows: unknown): string[] {
  if (!Array.isArray(rawWindows) || rawWindows.length === 0) {
    return [...ALL_WINDOWS];
  }
  const labels = new Set<string>();
  for (const item of rawWindows) {
    if (typeof item === "string" && item in WINDOW_HOUR_MAP) {
      labels.add(item);
    } else if (item && typeof item === "object") {
      const s = Number((item as { start_hour?: number }).start_hour ?? 8);
      const e = Number((item as { end_hour?: number }).end_hour ?? 21);
      for (const [winName, range] of Object.entries(WINDOW_HOUR_MAP)) {
        if (s <= range.end_hour && e >= range.start_hour) {
          labels.add(winName);
        }
      }
    }
  }
  return labels.size > 0 ? Array.from(labels) : [...ALL_WINDOWS];
}

export const PersonalizationRulesTab: React.FC = () => {
  const [rulesData, setRulesData] = useState<RulesListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [rollingBackVersion, setRollingBackVersion] = useState<number | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Editable Draft State
  const [weightsText, setWeightsText] = useState<Record<string, string>>({});
  const [decayLambda, setDecayLambda] = useState("0.08");
  const [minRelevance, setMinRelevance] = useState("45");
  const [minConfidence, setMinConfidence] = useState("30");
  const [dimensionConfigs, setDimensionConfigs] = useState<
    Record<string, { enabled: boolean; expiration_days: number }>
  >({});
  const [allowedCategories, setAllowedCategories] = useState<string[]>([...ALL_CATEGORIES]);
  const [allowedChannels, setAllowedChannels] = useState<string[]>([...ALL_CHANNELS]);

  // AI Eligibility Config
  const [aiEnabled, setAiEnabled] = useState(true);
  const [aiTimeoutMs, setAiTimeoutMs] = useState("1500");
  const [aiMaxTokens, setAiMaxTokens] = useState("400");
  const [aiEligibleCategories, setAiEligibleCategories] = useState<string[]>([
    "marketing",
    "discovery",
    "price_alerts",
    "digest",
  ]);

  // Adaptive Timing Config
  const [timingEnabled, setTimingEnabled] = useState(true);
  const [timingMinConf, setTimingMinConf] = useState("40");
  const [timingMaxDelayHrs, setTimingMaxDelayHrs] = useState("12");
  const [timingFallbackHour, setTimingFallbackHour] = useState("10");
  const [timingAllowedWindows, setTimingAllowedWindows] = useState<string[]>([...ALL_WINDOWS]);
  const [emergencyOverride, setEmergencyOverride] = useState("always_bypass");

  const [changeNotes, setChangeNotes] = useState("");
  const [rawActiveRule, setRawActiveRule] = useState<RuleConfigSchema | null>(null);

  // Deterministic Event Automation Rules & Dry-Run State
  const [automationRules, setAutomationRules] = useState<DeterministicAutomationRule[]>([]);
  const [ruleEventType, setRuleEventType] = useState("flight.price_alert.triggered");
  const [ruleTemplateKey, setRuleTemplateKey] = useState("flight_price_drop_v1");
  const [ruleName, setRuleName] = useState("Smart Price Drop Alert Rule");
  const [condField, setCondField] = useState("drop_pct");
  const [condOp, setCondOp] = useState<RuleConditionOperator>("gte");
  const [condVal, setCondVal] = useState("10");
  const [samplePayloadStr, setSamplePayloadStr] = useState(
    JSON.stringify({ origin: "DAC", destination: "CXB", drop_pct: 15, current_bdt: 4299 })
  );
  const [dryRunOutput, setDryRunOutput] = useState<RuleDryRunResponse | null>(null);
  const [ruleStatusMsg, setRuleStatusMsg] = useState<string | null>(null);

  const hydrateDraftFromRule = useCallback((rule: RuleConfigSchema) => {
    setRawActiveRule(rule);

    const wSource =
      rule.weights && Object.keys(rule.weights).length > 0
        ? rule.weights
        : DEFAULT_RELEVANCE_WEIGHTS;
    const wDraft: Record<string, string> = {};
    for (const [k, v] of Object.entries(wSource)) {
      wDraft[k] = Number(v).toFixed(2);
    }
    setWeightsText(wDraft);

    setDecayLambda(String(rule.decay_lambda ?? 0.08));
    setMinRelevance(String(rule.min_relevance_threshold ?? 45));
    setMinConfidence(String(rule.min_confidence_threshold ?? 30));

    const dimCfgDraft: Record<string, { enabled: boolean; expiration_days: number }> = {};
    const rawDimMap = (rule.dimension_configs || {}) as Record<string, any>;
    for (const key of CANONICAL_DIMENSION_KEYS) {
      const existing = rawDimMap[key];
      dimCfgDraft[key] = {
        enabled: existing?.enabled !== undefined ? Boolean(existing.enabled) : true,
        expiration_days:
          typeof existing?.expiration_days === "number" ? existing.expiration_days : 90,
      };
    }
    setDimensionConfigs(dimCfgDraft);

    if (Array.isArray(rawDimMap._allowed_categories)) {
      setAllowedCategories(rawDimMap._allowed_categories);
    } else if (Array.isArray(rule.ai_config?.allowed_categories)) {
      setAllowedCategories(rule.ai_config.allowed_categories);
    }
    if (Array.isArray(rawDimMap._allowed_channels)) {
      setAllowedChannels(rawDimMap._allowed_channels);
    } else if (Array.isArray(rule.timing_config?.allowed_channels)) {
      setAllowedChannels(rule.timing_config.allowed_channels);
    }

    const aiCfg = rule.ai_config || {};
    const resolvedAiEnabled =
      aiCfg.ai_enabled !== undefined
        ? Boolean(aiCfg.ai_enabled)
        : aiCfg.enabled !== undefined
        ? Boolean(aiCfg.enabled)
        : true;
    setAiEnabled(resolvedAiEnabled);
    const resolvedTimeoutMs =
      aiCfg.timeout_ms !== undefined
        ? Number(aiCfg.timeout_ms)
        : aiCfg.timeout_seconds !== undefined
        ? Math.round(Number(aiCfg.timeout_seconds) * 1000)
        : 1500;
    setAiTimeoutMs(String(resolvedTimeoutMs));
    setAiMaxTokens(String(aiCfg.max_tokens ?? 400));
    if (Array.isArray(aiCfg.eligible_categories)) {
      setAiEligibleCategories(aiCfg.eligible_categories);
    }

    const tCfg = rule.timing_config || {};
    setTimingEnabled(
      tCfg.adaptive_timing_enabled !== undefined ? Boolean(tCfg.adaptive_timing_enabled) : true
    );
    setTimingMinConf(String(tCfg.min_confidence ?? 40));
    setTimingMaxDelayHrs(String(tCfg.max_delay_hours ?? 12));
    setTimingFallbackHour(String(tCfg.fallback_hour ?? 10));
    if (Array.isArray(tCfg.allowed_window_names) && tCfg.allowed_window_names.length > 0) {
      setTimingAllowedWindows(tCfg.allowed_window_names);
    } else if (Array.isArray(tCfg.allowed_windows)) {
      setTimingAllowedWindows(hydrateWindowLabels(tCfg.allowed_windows));
    }
    if (typeof tCfg.emergency_override_policy === "string") {
      setEmergencyOverride(tCfg.emergency_override_policy);
    }
  }, []);

  const loadRules = useCallback(async () => {
    try {
      setLoading(true);
      setErrorMsg(null);
      const res = await personalizationService.getAdminRules();
      setRulesData(res);
      if (res.active_rule) {
        hydrateDraftFromRule(res.active_rule);
      }
    } catch (err) {
      setErrorMsg(formatPersonalizationError(err).message);
      setRulesData(null);
    } finally {
      setLoading(false);
    }
  }, [hydrateDraftFromRule]);

  useEffect(() => {
    loadRules();
    notificationCommandService.getAutomationRules().then((r) => setAutomationRules(r.rules));
  }, [loadRules]);

  const handleDryRunConditionRule = async () => {
    let parsedPayload: Record<string, unknown> = {};
    try {
      parsedPayload = JSON.parse(samplePayloadStr || "{}");
    } catch {
      setRuleStatusMsg("Invalid sample JSON payload for dry-run.");
      return;
    }
    const candidateRule: DeterministicAutomationRule = {
      id: `local-${Date.now()}`,
      name: ruleName.trim() || "Draft Rule",
      event_type: ruleEventType.trim(),
      template_key: ruleTemplateKey.trim(),
      channels: ["push", "in_app"],
      priority: "normal",
      respect_quiet_hours: true,
      conditions: condField.trim()
        ? [{ field: condField.trim(), operator: condOp, value: condVal.trim() }]
        : [],
      is_active: true,
    };
    const res = await notificationCommandService.dryRunAutomationRule(candidateRule, parsedPayload);
    setDryRunOutput(res);
  };

  const handleSaveConditionRule = async () => {
    const newRule: Omit<DeterministicAutomationRule, "source"> = {
      id: `local-${Date.now()}`,
      name: ruleName.trim() || "Custom Rule",
      event_type: ruleEventType.trim(),
      template_key: ruleTemplateKey.trim(),
      channels: ["push", "in_app"],
      priority: "normal",
      respect_quiet_hours: true,
      conditions: condField.trim()
        ? [{ field: condField.trim(), operator: condOp, value: condVal.trim() }]
        : [],
      is_active: true,
    };
    const res = await notificationCommandService.saveAutomationRule(newRule);
    setAutomationRules((prev) => [res.saved, ...prev]);
    setRuleStatusMsg(res.warning || `Saved automation rule "${res.saved.name}".`);
  };

  const parsedWeights = useMemo(() => {
    const out: Record<string, number> = {};
    for (const [k, strVal] of Object.entries(weightsText)) {
      const n = parseFloat(strVal);
      out[k] = Number.isFinite(n) ? n : 0;
    }
    return out;
  }, [weightsText]);

  const weightSum = useMemo(() => {
    return Object.values(parsedWeights).reduce((acc, v) => acc + v, 0);
  }, [parsedWeights]);

  const hasNegativeOrInvalidWeight = useMemo(() => {
    return Object.values(parsedWeights).some((v) => v < 0 || v > 1);
  }, [parsedWeights]);

  const isWeightSumValid = Math.abs(weightSum - 1.0) <= 0.001 && !hasNegativeOrInvalidWeight;

  const handleNormalizeWeights = () => {
    if (weightSum <= 0) return;
    const entries = Object.entries(parsedWeights);
    let running = 0;
    const normalized: Record<string, string> = {};
    entries.forEach(([k, val], idx) => {
      if (idx === entries.length - 1) {
        normalized[k] = Math.max(0, 1 - running).toFixed(2);
      } else {
        const rounded = Math.round((val / weightSum) * 100) / 100;
        running += rounded;
        normalized[k] = rounded.toFixed(2);
      }
    });
    setWeightsText(normalized);
  };

  const handleResetDefaultWeights = () => {
    const wDraft: Record<string, string> = {};
    for (const [k, v] of Object.entries(DEFAULT_RELEVANCE_WEIGHTS)) {
      wDraft[k] = v.toFixed(2);
    }
    setWeightsText(wDraft);
  };

  const toggleInList = (
    list: string[],
    item: string,
    setter: React.Dispatch<React.SetStateAction<string[]>>
  ) => {
    setter(list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);
  };

  const handlePublishRules = async () => {
    setSaveError(null);
    setActionMsg(null);
    if (!isWeightSumValid) {
      setSaveError(
        `Relevance weights must sum to 1.00 (currently ${weightSum.toFixed(3)}) with each weight in [0, 1].`
      );
      return;
    }

    const parsedLambda = parseFloat(decayLambda);
    const parsedRel = parseFloat(minRelevance);
    const parsedConf = parseFloat(minConfidence);
    if (!Number.isFinite(parsedLambda) || parsedLambda <= 0 || parsedLambda > 2) {
      setSaveError("Time-decay lambda must be between 0.001 and 2.0.");
      return;
    }

    try {
      setSaving(true);
      const mergedDimConfigs: Record<string, any> = {
        ...(rawActiveRule?.dimension_configs || {}),
        ...dimensionConfigs,
        _allowed_categories: allowedCategories,
        _allowed_channels: allowedChannels,
      };
      const timeoutMsNum = Number(aiTimeoutMs) || 1500;
      const windowHourRanges = timingAllowedWindows
        .map((w) => WINDOW_HOUR_MAP[w])
        .filter((r): r is { start_hour: number; end_hour: number } => Boolean(r));
      const updated = await personalizationService.updateAdminRules({
        weights: parsedWeights,
        dimension_configs: mergedDimConfigs,
        timing_config: {
          ...(rawActiveRule?.timing_config || {}),
          adaptive_timing_enabled: timingEnabled,
          min_confidence: Number(timingMinConf) || 40,
          max_delay_hours: Number(timingMaxDelayHrs) || 12,
          fallback_hour: Number(timingFallbackHour) || 10,
          eligible_categories: aiEligibleCategories,
          allowed_windows:
            windowHourRanges.length > 0
              ? windowHourRanges
              : [{ start_hour: 8, end_hour: 21 }],
          allowed_window_names: timingAllowedWindows,
          allowed_channels: allowedChannels,
          emergency_override_policy: emergencyOverride,
        },
        fatigue_config: rawActiveRule?.fatigue_config || {},
        ai_config: {
          ...(rawActiveRule?.ai_config || {}),
          ai_enabled: aiEnabled,
          timeout_ms: timeoutMsNum,
          timeout_seconds: Number((timeoutMsNum / 1000).toFixed(2)),
          max_tokens: Number(aiMaxTokens) || 400,
          eligible_categories: aiEligibleCategories,
          excluded_categories: ["security", "booking", "payment", "sos", "disruption"],
          allowed_categories: allowedCategories,
        },
        decay_lambda: parsedLambda,
        min_relevance_threshold: Number.isFinite(parsedRel) ? parsedRel : 45,
        min_confidence_threshold: Number.isFinite(parsedConf) ? parsedConf : 30,
        change_notes: changeNotes.trim() || "Admin rules update",
      });
      setActionMsg(`Published rule configuration v${updated.version}.`);
      setChangeNotes("");
      await loadRules();
    } catch (err) {
      setSaveError(formatPersonalizationError(err).message);
    } finally {
      setSaving(false);
    }
  };

  const confirmRollback = (version: number) => {
    Alert.alert(
      "Rollback Rule Version",
      `Activate rule configuration v${version}? This immediately restores its weights, thresholds, timing, and AI eligibility settings.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: `Rollback to v${version}`,
          style: "destructive",
          onPress: async () => {
            try {
              setRollingBackVersion(version);
              setSaveError(null);
              setActionMsg(null);
              const res = await personalizationService.rollbackAdminRules(version);
              setActionMsg(res.message || `Rolled back to rule version v${res.active_version}.`);
              await loadRules();
            } catch (err) {
              setSaveError(formatPersonalizationError(err).message);
            } finally {
              setRollingBackVersion(null);
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return <LoadingState variant="skeleton" skeletonType="card" count={3} />;
  }

  if (errorMsg || !rulesData) {
    return (
      <ErrorStateCard
        title="Rules & Weights Unavailable"
        message={errorMsg || "Unable to fetch personalization rule versions."}
        onRetry={loadRules}
      />
    );
  }

  return (
    <View style={styles.container}>
      {/* Active Version Banner */}
      <View style={styles.headerCard}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>
            Active Rule Configuration: v{rulesData.active_rule.version}
          </Text>
          <Text style={styles.headerSubtitle}>
            {rulesData.active_rule.change_notes || "Production scoring weights & pipeline guardrails"}
          </Text>
        </View>
        <TouchableOpacity style={styles.refreshBtn} onPress={loadRules}>
          <Ionicons name="refresh" size={16} color="#0284c7" />
          <Text style={styles.refreshBtnText}>Reload</Text>
        </TouchableOpacity>
      </View>

      {actionMsg && (
        <View style={styles.successBanner}>
          <Ionicons name="checkmark-circle" size={16} color="#166534" />
          <Text style={styles.successText}>{actionMsg}</Text>
        </View>
      )}
      {saveError && (
        <View style={styles.errorBanner}>
          <Ionicons name="alert-circle" size={16} color="#991b1b" />
          <Text style={styles.errorText}>{saveError}</Text>
        </View>
      )}

      {/* 1. Relevance Feature Weights (Sum = 1.00 validation) */}
      <View style={styles.card}>
        <View style={styles.cardHeaderRow}>
          <Text style={styles.cardTitle}>10-Feature Relevance Weights</Text>
          <View
            style={[
              styles.sumBadge,
              { backgroundColor: isWeightSumValid ? "#dcfce7" : "#fee2e2" },
            ]}
          >
            <Text
              style={[
                styles.sumBadgeText,
                { color: isWeightSumValid ? "#166534" : "#991b1b" },
              ]}
            >
              Sum: {weightSum.toFixed(2)} / 1.00 {isWeightSumValid ? "✓" : "INVALID"}
            </Text>
          </View>
        </View>

        <View style={styles.weightsGrid}>
          {Object.entries(weightsText).map(([key, val]) => (
            <View key={key} style={styles.weightItem}>
              <Text style={styles.weightLabel}>{key}</Text>
              <TextInput
                style={styles.weightInput}
                keyboardType="decimal-pad"
                value={val}
                onChangeText={(txt) =>
                  setWeightsText((prev) => ({ ...prev, [key]: txt }))
                }
              />
            </View>
          ))}
        </View>

        <View style={styles.helperBtnsRow}>
          <TouchableOpacity style={styles.ghostBtn} onPress={handleNormalizeWeights}>
            <Text style={styles.ghostBtnText}>Normalize to 1.00</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.ghostBtn} onPress={handleResetDefaultWeights}>
            <Text style={styles.ghostBtnText}>Reset Defaults</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* 2. Thresholds & Time Decay */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Scoring Thresholds & Time-Decay</Text>
        <View style={styles.thresholdsRow}>
          <View style={styles.thresholdField}>
            <Text style={styles.fieldLabel}>Min Relevance (0–100)</Text>
            <TextInput
              style={styles.textInput}
              keyboardType="decimal-pad"
              value={minRelevance}
              onChangeText={setMinRelevance}
            />
          </View>
          <View style={styles.thresholdField}>
            <Text style={styles.fieldLabel}>Min Confidence (0–100)</Text>
            <TextInput
              style={styles.textInput}
              keyboardType="decimal-pad"
              value={minConfidence}
              onChangeText={setMinConfidence}
            />
          </View>
          <View style={styles.thresholdField}>
            <Text style={styles.fieldLabel}>Decay Lambda (λ)</Text>
            <TextInput
              style={styles.textInput}
              keyboardType="decimal-pad"
              value={decayLambda}
              onChangeText={setDecayLambda}
            />
          </View>
        </View>
      </View>

      {/* 3. Allowed Categories & Channels */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Allowed Categories & Delivery Channels</Text>
        <Text style={styles.fieldLabel}>ALLOWED CATEGORIES</Text>
        <View style={styles.chipsWrap}>
          {ALL_CATEGORIES.map((cat) => {
            const active = allowedCategories.includes(cat);
            return (
              <TouchableOpacity
                key={cat}
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => toggleInList(allowedCategories, cat, setAllowedCategories)}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>
                  {cat}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={[styles.fieldLabel, { marginTop: 10 }]}>ALLOWED CHANNELS</Text>
        <View style={styles.chipsWrap}>
          {ALL_CHANNELS.map((ch) => {
            const active = allowedChannels.includes(ch);
            return (
              <TouchableOpacity
                key={ch}
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => toggleInList(allowedChannels, ch, setAllowedChannels)}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>
                  {ch.toUpperCase()}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* 4. AI Eligibility & Adaptive Timing Configuration */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>AI Personalization & Adaptive Timing</Text>

        <View style={styles.switchRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.switchTitle}>Enable Non-Gating AI Enrichment</Text>
            <Text style={styles.switchSub}>
              Falls back cleanly to deterministic EN/BN templates on timeout or circuit-break.
            </Text>
          </View>
          <Switch value={aiEnabled} onValueChange={setAiEnabled} />
        </View>

        <View style={styles.thresholdsRow}>
          <View style={styles.thresholdField}>
            <Text style={styles.fieldLabel}>AI Timeout (ms)</Text>
            <TextInput
              style={styles.textInput}
              keyboardType="number-pad"
              value={aiTimeoutMs}
              onChangeText={setAiTimeoutMs}
            />
          </View>
          <View style={styles.thresholdField}>
            <Text style={styles.fieldLabel}>AI Max Tokens</Text>
            <TextInput
              style={styles.textInput}
              keyboardType="number-pad"
              value={aiMaxTokens}
              onChangeText={setAiMaxTokens}
            />
          </View>
        </View>

        <Text style={styles.fieldLabel}>AI & ADAPTIVE TIMING ELIGIBLE CATEGORIES (NON-CRITICAL ONLY)</Text>
        <View style={styles.chipsWrap}>
          {(["marketing", "discovery", "price_alerts", "digest", "reactivation", "community"] as const).map((cat) => {
            const active = aiEligibleCategories.includes(cat);
            return (
              <TouchableOpacity
                key={cat}
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => toggleInList(aiEligibleCategories, cat, setAiEligibleCategories)}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{cat}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={[styles.switchRow, { marginTop: 12 }]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.switchTitle}>Adaptive Send-Time Optimization</Text>
            <Text style={styles.switchSub}>
              Critical transactional/security alerts bypass delay ({emergencyOverride}).
            </Text>
          </View>
          <Switch value={timingEnabled} onValueChange={setTimingEnabled} />
        </View>

        <View style={styles.thresholdsRow}>
          <View style={styles.thresholdField}>
            <Text style={styles.fieldLabel}>Timing Min Conf</Text>
            <TextInput
              style={styles.textInput}
              keyboardType="number-pad"
              value={timingMinConf}
              onChangeText={setTimingMinConf}
            />
          </View>
          <View style={styles.thresholdField}>
            <Text style={styles.fieldLabel}>Max Delay (hrs)</Text>
            <TextInput
              style={styles.textInput}
              keyboardType="number-pad"
              value={timingMaxDelayHrs}
              onChangeText={setTimingMaxDelayHrs}
            />
          </View>
          <View style={styles.thresholdField}>
            <Text style={styles.fieldLabel}>Fallback Hour (0–23)</Text>
            <TextInput
              style={styles.textInput}
              keyboardType="number-pad"
              value={timingFallbackHour}
              onChangeText={setTimingFallbackHour}
            />
          </View>
        </View>

        <Text style={styles.fieldLabel}>ALLOWED DELIVERY WINDOWS</Text>
        <View style={styles.chipsWrap}>
          {ALL_WINDOWS.map((win) => {
            const active = timingAllowedWindows.includes(win);
            return (
              <TouchableOpacity
                key={win}
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => toggleInList(timingAllowedWindows, win, setTimingAllowedWindows)}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{win}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* 5. 20 Dimensions Enable/Disable & Expiration Days */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>20 Dimension Toggles & Expiration Policies</Text>
        <View style={styles.dimsList}>
          {CANONICAL_DIMENSION_KEYS.map((key) => {
            const cfg = dimensionConfigs[key] || { enabled: true, expiration_days: 90 };
            return (
              <View key={key} style={styles.dimRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.dimRowKey}>{key}</Text>
                </View>
                <View style={styles.dimRowControls}>
                  <Text style={styles.expLabel}>Exp (days):</Text>
                  <TextInput
                    style={styles.expInput}
                    keyboardType="number-pad"
                    value={String(cfg.expiration_days)}
                    onChangeText={(txt) => {
                      const days = Math.max(1, parseInt(txt, 10) || 1);
                      setDimensionConfigs((prev) => ({
                        ...prev,
                        [key]: { ...cfg, expiration_days: days },
                      }));
                    }}
                  />
                  <Switch
                    value={cfg.enabled}
                    onValueChange={(val) =>
                      setDimensionConfigs((prev) => ({
                        ...prev,
                        [key]: { ...cfg, enabled: val },
                      }))
                    }
                  />
                </View>
              </View>
            );
          })}
        </View>
      </View>

      {/* Publish New Version */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Publish New Rule Version</Text>
        <TextInput
          style={styles.textInput}
          placeholder="Change notes (e.g. Increased DestinationInterest weight to 0.22)"
          value={changeNotes}
          onChangeText={setChangeNotes}
          placeholderTextColor="#94a3b8"
        />
        <TouchableOpacity
          style={[
            styles.publishBtn,
            (!isWeightSumValid || saving) && styles.publishBtnDisabled,
          ]}
          onPress={handlePublishRules}
          disabled={!isWeightSumValid || saving}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <>
              <MaterialCommunityIcons name="publish" size={16} color="#ffffff" />
              <Text style={styles.publishBtnText}>Publish Rule Version</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* 6. Deterministic Event-to-Template Rule Builder & Dry-Run */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Event Automation Rules & Condition Dry-Run</Text>
        <Text style={styles.headerSubtitle}>
          Active rules: {automationRules.length} • Build trigger conditions and test without sending
        </Text>
        <TextInput
          style={styles.textInput}
          value={ruleName}
          onChangeText={setRuleName}
          placeholder="Rule Name"
          placeholderTextColor="#94a3b8"
        />
        <TextInput
          style={styles.textInput}
          value={ruleEventType}
          onChangeText={setRuleEventType}
          placeholder="Event Type (e.g. flight.price_alert.triggered)"
          placeholderTextColor="#94a3b8"
          autoCapitalize="none"
        />
        <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
          <TextInput
            style={[styles.textInput, { flex: 1, minWidth: 100 }]}
            value={condField}
            onChangeText={setCondField}
            placeholder="Field (drop_pct)"
            autoCapitalize="none"
          />
          <TextInput
            style={[styles.textInput, { width: 70 }]}
            value={condOp}
            onChangeText={(txt) => setCondOp((txt || "eq") as RuleConditionOperator)}
            placeholder="gte"
            autoCapitalize="none"
          />
          <TextInput
            style={[styles.textInput, { flex: 1, minWidth: 80 }]}
            value={condVal}
            onChangeText={setCondVal}
            placeholder="Value (10)"
            autoCapitalize="none"
          />
        </View>
        <TextInput
          style={[styles.textInput, { fontFamily: "monospace", fontSize: 11 }]}
          value={samplePayloadStr}
          onChangeText={setSamplePayloadStr}
          placeholder='{"drop_pct": 15}'
          autoCapitalize="none"
        />
        <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
          <TouchableOpacity style={[styles.publishBtn, { flex: 1, backgroundColor: "#7c3aed" }]} onPress={handleDryRunConditionRule}>
            <Text style={styles.publishBtnText}>Dry-Run Condition Test</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.publishBtn, { flex: 1 }]} onPress={handleSaveConditionRule}>
            <Text style={styles.publishBtnText}>Add Automation Rule</Text>
          </TouchableOpacity>
        </View>
        {ruleStatusMsg && <Text style={styles.versionNotes}>{ruleStatusMsg}</Text>}
        {dryRunOutput && (
          <View style={styles.versionRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.versionTitle}>
                Dry-Run Match: {dryRunOutput.matched ? "MATCHED" : "NOT MATCHED"} (dispatched=false)
              </Text>
              <Text style={styles.versionNotes}>{dryRunOutput.note}</Text>
            </View>
          </View>
        )}
      </View>

      {/* 7. Version History & Rollback */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Rule Version History & Rollback</Text>
        {(rulesData.history || []).map((ver) => (
          <View key={ver.version} style={styles.versionRow}>
            <View style={{ flex: 1 }}>
              <View style={styles.versionHeader}>
                <Text style={styles.versionTitle}>Version v{ver.version}</Text>
                {ver.is_active && (
                  <View style={styles.activeBadge}>
                    <Text style={styles.activeBadgeText}>ACTIVE</Text>
                  </View>
                )}
              </View>
              <Text style={styles.versionNotes}>
                {ver.change_notes || "No change notes"} • λ={ver.decay_lambda} • MinRel=
                {ver.min_relevance_threshold} • MinConf={ver.min_confidence_threshold}
              </Text>
              {ver.created_at && (
                <Text style={styles.versionTime}>
                  {new Date(ver.created_at).toLocaleString()}
                </Text>
              )}
            </View>
            {!ver.is_active && (
              <TouchableOpacity
                style={styles.rollbackBtn}
                onPress={() => confirmRollback(ver.version)}
                disabled={rollingBackVersion === ver.version}
              >
                {rollingBackVersion === ver.version ? (
                  <ActivityIndicator size="small" color="#b45309" />
                ) : (
                  <>
                    <MaterialCommunityIcons name="history" size={14} color="#b45309" />
                    <Text style={styles.rollbackBtnText}>Rollback</Text>
                  </>
                )}
              </TouchableOpacity>
            )}
          </View>
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { gap: 14, paddingBottom: 32 },
  headerCard: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
  },
  headerTitle: { fontSize: 15, fontWeight: "700", color: "#0f172a" },
  headerSubtitle: { fontSize: 12, color: "#64748b", marginTop: 2 },
  refreshBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#f0f9ff",
    borderWidth: 1,
    borderColor: "#bae6fd",
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
  },
  refreshBtnText: { fontSize: 12, fontWeight: "600", color: "#0284c7" },
  successBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#dcfce7",
    borderWidth: 1,
    borderColor: "#86efac",
    padding: 10,
    borderRadius: 8,
  },
  successText: { fontSize: 12, fontWeight: "600", color: "#166534", flex: 1 },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#fee2e2",
    borderWidth: 1,
    borderColor: "#fecaca",
    padding: 10,
    borderRadius: 8,
  },
  errorText: { fontSize: 12, fontWeight: "600", color: "#991b1b", flex: 1 },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    gap: 10,
  },
  cardHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
  },
  cardTitle: { fontSize: 14, fontWeight: "700", color: "#0f172a" },
  sumBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 14 },
  sumBadgeText: { fontSize: 11, fontWeight: "700" },
  weightsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  weightItem: {
    width: "47%",
    minWidth: 150,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 8,
    padding: 8,
  },
  weightLabel: { fontSize: 11, fontWeight: "600", color: "#475569", marginBottom: 4 },
  weightInput: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 5,
    fontSize: 13,
    fontWeight: "700",
    color: "#0f172a",
  },
  helperBtnsRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  ghostBtn: {
    backgroundColor: "#f1f5f9",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  ghostBtnText: { fontSize: 12, fontWeight: "600", color: "#334155" },
  thresholdsRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  thresholdField: { flex: 1, minWidth: 130 },
  fieldLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: "#64748b",
    textTransform: "uppercase",
    marginBottom: 4,
  },
  textInput: {
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    color: "#0f172a",
  },
  chipsWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    backgroundColor: "#f1f5f9",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 16,
    paddingHorizontal: 11,
    paddingVertical: 5,
  },
  chipActive: { backgroundColor: "#0284c7", borderColor: "#0284c7" },
  chipText: { fontSize: 11, fontWeight: "600", color: "#475569" },
  chipTextActive: { color: "#ffffff" },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 8,
    padding: 10,
    gap: 10,
  },
  switchTitle: { fontSize: 13, fontWeight: "600", color: "#0f172a" },
  switchSub: { fontSize: 11, color: "#64748b", marginTop: 2 },
  dimsList: { gap: 6 },
  dimRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 8,
  },
  dimRowKey: { fontSize: 12, fontWeight: "600", color: "#1e293b" },
  dimRowControls: { flexDirection: "row", alignItems: "center", gap: 8 },
  expLabel: { fontSize: 11, color: "#64748b" },
  expInput: {
    width: 52,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 3,
    fontSize: 12,
    textAlign: "center",
    color: "#0f172a",
  },
  publishBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#0284c7",
    paddingVertical: 11,
    borderRadius: 8,
  },
  publishBtnDisabled: { backgroundColor: "#94a3b8" },
  publishBtnText: { fontSize: 13, fontWeight: "700", color: "#ffffff" },
  versionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 8,
    padding: 10,
    gap: 10,
  },
  versionHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  versionTitle: { fontSize: 13, fontWeight: "700", color: "#0f172a" },
  activeBadge: {
    backgroundColor: "#dcfce7",
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  activeBadgeText: { fontSize: 10, fontWeight: "700", color: "#166534" },
  versionNotes: { fontSize: 11, color: "#475569", marginTop: 3 },
  versionTime: { fontSize: 10, color: "#94a3b8", marginTop: 2 },
  rollbackBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#fef3c7",
    borderWidth: 1,
    borderColor: "#fde68a",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  rollbackBtnText: { fontSize: 11, fontWeight: "700", color: "#b45309" },
});

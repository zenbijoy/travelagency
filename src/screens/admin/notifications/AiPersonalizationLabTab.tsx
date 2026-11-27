/**
 * AI Personalization Lab Tab — Admin Personalization Command Center (Tab 4)
 * Dry-run preview laboratory using synthetic persona presets or authorized test User UUID.
 * Displays side-by-side Generic vs Personalized (EN & BN variants), 10-feature relevance
 * breakdown, confidence score, fatigue score, suppression reason, AI provider status & token/cost estimate.
 * Explicitly marked "PREVIEW ONLY — NEVER SENDS".
 */

import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Switch,
  ActivityIndicator,
} from "react-native";
import { MaterialCommunityIcons, Ionicons, Feather } from "@expo/vector-icons";
import {
  personalizationService,
  formatPersonalizationError,
  PERSONA_PRESETS_META,
  PersonaPreset,
  BudgetTier,
  LanguageCode,
  DecisionPreviewResponse,
} from "../../../services/personalizationService";
import {
  notificationCommandService,
  AiCopilotSuggestion,
} from "../../../services/notificationCommandService";
import { ErrorStateCard } from "../../../components/common/ErrorStateCard";

export const AiPersonalizationLabTab: React.FC = () => {
  const [targetMode, setTargetMode] = useState<"preset" | "user_id">("preset");
  const [personaPreset, setPersonaPreset] = useState<PersonaPreset>("family_midrange");
  const [testUserId, setTestUserId] = useState("");

  const [category, setCategory] = useState("marketing");
  const [destination, setDestination] = useState("Sylhet");
  const [budgetTier, setBudgetTier] = useState<BudgetTier>("mid_range");
  const [transportMode, setTransportMode] = useState("flight");
  const [baseTitle, setBaseTitle] = useState("Explore travel opportunities this month.");
  const [baseBody, setBaseBody] = useState(
    "Discover seasonal travel ideas, stays, and routes tailored to your next trip."
  );
  const [deepLink, setDeepLink] = useState("/(tabs)");
  const [pricePaisa, setPricePaisa] = useState("850000");
  const [discountPct, setDiscountPct] = useState("15");
  const [allowAi, setAllowAi] = useState(true);
  const [langOverride, setLangOverride] = useState<"auto" | LanguageCode>("auto");

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [preview, setPreview] = useState<DecisionPreviewResponse | null>(null);
  const [globalAiEnabled, setGlobalAiEnabled] = useState(true);
  const [togglingGlobalAi, setTogglingGlobalAi] = useState(false);
  const [aiToggleStatus, setAiToggleStatus] = useState<string | null>(null);

  const [copilotPrompt, setCopilotPrompt] = useState("");
  const [copilotLoading, setCopilotLoading] = useState(false);
  const [copilotResult, setCopilotResult] = useState<AiCopilotSuggestion | null>(null);

  const handleToggleGlobalAi = async (nextVal: boolean) => {
    setGlobalAiEnabled(nextVal);
    setTogglingGlobalAi(true);
    setAiToggleStatus(null);
    const res = await notificationCommandService.setGlobalAiEnabled(nextVal);
    setAiToggleStatus(
      res.ok
        ? `Global AI Personalization ${nextVal ? "ENABLED" : "DISABLED"}.`
        : `Could not persist toggle (${res.error || "backend offline"}).`
    );
    setTogglingGlobalAi(false);
  };

  const handleRunCopilot = async () => {
    if (!copilotPrompt.trim()) return;
    setCopilotLoading(true);
    const res = await notificationCommandService.generateAiCopilotDraft({
      prompt: copilotPrompt.trim(),
      language: langOverride === "bn" ? "bn" : "en",
      category,
      destination: destination.trim() || undefined,
    });
    setCopilotResult(res);
    setCopilotLoading(false);
  };

  const handleRunPreview = async () => {
    try {
      setLoading(true);
      setErrorMsg(null);
      const res = await personalizationService.previewDecision({
        persona_preset: targetMode === "preset" ? personaPreset : null,
        user_id: targetMode === "user_id" && testUserId.trim() ? testUserId.trim() : null,
        category,
        base_title: baseTitle,
        base_body: baseBody,
        destination: destination.trim() || null,
        budget_tier: budgetTier,
        transport_mode: transportMode.trim() || null,
        price_paisa: pricePaisa ? Number(pricePaisa) || null : null,
        discount_pct: discountPct ? Number(discountPct) || null : null,
        deep_link: deepLink.trim() || "/(tabs)",
        allow_ai_enrichment: allowAi,
        language_override: langOverride === "auto" ? null : langOverride,
      });
      setPreview(res);
    } catch (err) {
      setErrorMsg(formatPersonalizationError(err).message);
      setPreview(null);
    } finally {
      setLoading(false);
    }
  };

  const enVariant = preview?.bilingual_variants?.en || preview?.personalized_variant;
  const bnVariant = preview?.bilingual_variants?.bn;

  return (
    <View style={styles.container}>
      {/* Explicit Safety Badge */}
      <View style={styles.previewSafetyBanner}>
        <Feather name="shield" size={16} color="#7c3aed" />
        <View style={{ flex: 1 }}>
          <View style={styles.badgePill}>
            <Text style={styles.badgePillText}>PREVIEW ONLY — NEVER SENDS</Text>
          </View>
          <Text style={styles.safetySubtitle}>
            Evaluates the 24-Step Decision Pipeline and AI/Template renderer in dry-run mode. Zero notifications are queued or delivered.
          </Text>
        </View>
      </View>

      {/* Global AI Kill Switch & Copilot Assistant */}
      <View style={styles.card}>
        <View style={styles.switchRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.switchTitle}>Global AI Enrichment Switch</Text>
            <Text style={styles.switchSub}>
              Disable to force 100% deterministic bilingual templates across all campaigns
            </Text>
          </View>
          <Switch
            value={globalAiEnabled}
            onValueChange={handleToggleGlobalAi}
            disabled={togglingGlobalAi}
          />
        </View>
        {aiToggleStatus && <Text style={styles.aiMetaSub}>{aiToggleStatus}</Text>}

        <Text style={styles.fieldLabel}>AI NOTIFICATION COPILOT (DRAFT & SUGGEST ONLY)</Text>
        <TextInput
          style={styles.textInput}
          value={copilotPrompt}
          onChangeText={setCopilotPrompt}
          placeholder="e.g. Weekend flash deal for Sylhet eco-resorts in Bangla..."
          placeholderTextColor="#94a3b8"
        />
        <TouchableOpacity
          style={[styles.runBtn, { backgroundColor: "#0284c7" }]}
          onPress={handleRunCopilot}
          disabled={copilotLoading}
        >
          {copilotLoading ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.runBtnText}>Generate Preview Draft with Copilot</Text>
          )}
        </TouchableOpacity>
        {copilotResult && (
          <View style={styles.aiMetaBox}>
            <Text style={styles.aiMetaTitle}>
              Copilot Output ({copilotResult.source}) • preview_only=true, dispatched=false
            </Text>
            {copilotResult.error ? (
              <Text style={styles.suppressionText}>{copilotResult.error}</Text>
            ) : (
              <>
                <Text style={styles.aiMetaSub}>EN: {copilotResult.en_title}</Text>
                <Text style={styles.aiMetaSub}>BN: {copilotResult.bn_title}</Text>
                <TouchableOpacity
                  style={[styles.chip, styles.chipActive, { alignSelf: "flex-start", marginTop: 4 }]}
                  onPress={() => {
                    if (copilotResult.en_title) setBaseTitle(copilotResult.en_title);
                    if (copilotResult.en_body) setBaseBody(copilotResult.en_body);
                    if (copilotResult.suggested_deep_link) {
                      setDeepLink(copilotResult.suggested_deep_link);
                    }
                  }}
                >
                  <Text style={styles.chipTextActive}>Load Draft into Preview Simulator</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        )}
      </View>

      {/* Target Selection */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>1. Select Target Persona or Test User</Text>
        <View style={styles.modeRow}>
          <TouchableOpacity
            style={[styles.modeBtn, targetMode === "preset" && styles.modeBtnActive]}
            onPress={() => setTargetMode("preset")}
          >
            <Text style={[styles.modeBtnText, targetMode === "preset" && styles.modeBtnTextActive]}>
              Synthetic Persona Presets (8)
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modeBtn, targetMode === "user_id" && styles.modeBtnActive]}
            onPress={() => setTargetMode("user_id")}
          >
            <Text style={[styles.modeBtnText, targetMode === "user_id" && styles.modeBtnTextActive]}>
              Authorized Test User UUID
            </Text>
          </TouchableOpacity>
        </View>

        {targetMode === "preset" ? (
          <View style={styles.presetsGrid}>
            {PERSONA_PRESETS_META.map((p) => {
              const active = personaPreset === p.key;
              return (
                <TouchableOpacity
                  key={p.key}
                  style={[styles.presetCard, active && styles.presetCardActive]}
                  onPress={() => setPersonaPreset(p.key)}
                >
                  <Text style={[styles.presetLabel, active && styles.presetLabelActive]}>
                    {p.label}
                  </Text>
                  <Text style={styles.presetSummary}>{p.summary}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ) : (
          <TextInput
            style={styles.textInput}
            placeholder="Authorized Test User UUID"
            value={testUserId}
            onChangeText={setTestUserId}
            placeholderTextColor="#94a3b8"
            autoCapitalize="none"
          />
        )}
      </View>

      {/* Candidate Campaign Context */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>2. Candidate Notification Context</Text>
        <View style={styles.fieldsRow}>
          <View style={styles.fieldCol}>
            <Text style={styles.fieldLabel}>CATEGORY</Text>
            <TextInput style={styles.textInput} value={category} onChangeText={setCategory} />
          </View>
          <View style={styles.fieldCol}>
            <Text style={styles.fieldLabel}>DESTINATION</Text>
            <TextInput style={styles.textInput} value={destination} onChangeText={setDestination} />
          </View>
          <View style={styles.fieldCol}>
            <Text style={styles.fieldLabel}>TRANSPORT</Text>
            <TextInput
              style={styles.textInput}
              value={transportMode}
              onChangeText={setTransportMode}
            />
          </View>
        </View>

        <Text style={styles.fieldLabel}>OFFER BUDGET TIER</Text>
        <View style={styles.chipsRow}>
          {(["budget", "economy", "mid_range", "premium", "luxury", "flexible"] as BudgetTier[]).map(
            (tier) => (
              <TouchableOpacity
                key={tier}
                style={[styles.chip, budgetTier === tier && styles.chipActive]}
                onPress={() => setBudgetTier(tier)}
              >
                <Text style={[styles.chipText, budgetTier === tier && styles.chipTextActive]}>
                  {tier}
                </Text>
              </TouchableOpacity>
            )
          )}
        </View>

        <Text style={styles.fieldLabel}>BASE TITLE</Text>
        <TextInput style={styles.textInput} value={baseTitle} onChangeText={setBaseTitle} />

        <Text style={styles.fieldLabel}>BASE BODY</Text>
        <TextInput
          style={[styles.textInput, { minHeight: 64 }]}
          multiline
          value={baseBody}
          onChangeText={setBaseBody}
        />

        <View style={styles.fieldsRow}>
          <View style={styles.fieldCol}>
            <Text style={styles.fieldLabel}>VERIFIED PRICE (PAISA)</Text>
            <TextInput
              style={styles.textInput}
              keyboardType="number-pad"
              value={pricePaisa}
              onChangeText={setPricePaisa}
            />
          </View>
          <View style={styles.fieldCol}>
            <Text style={styles.fieldLabel}>VERIFIED DISCOUNT (%)</Text>
            <TextInput
              style={styles.textInput}
              keyboardType="decimal-pad"
              value={discountPct}
              onChangeText={setDiscountPct}
            />
          </View>
          <View style={styles.fieldCol}>
            <Text style={styles.fieldLabel}>DEEP LINK</Text>
            <TextInput style={styles.textInput} value={deepLink} onChangeText={setDeepLink} />
          </View>
        </View>

        <View style={styles.switchRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.switchTitle}>Allow AI Copy Personalization</Text>
            <Text style={styles.switchSub}>
              Enriches phrasing with factual validation; safely falls back to template if unavailable.
            </Text>
          </View>
          <Switch value={allowAi} onValueChange={setAllowAi} />
        </View>

        <View style={styles.langRow}>
          <Text style={styles.fieldLabel}>LANGUAGE OVERRIDE:</Text>
          {(["auto", "en", "bn"] as const).map((lang) => (
            <TouchableOpacity
              key={lang}
              style={[styles.chip, langOverride === lang && styles.chipActive]}
              onPress={() => setLangOverride(lang)}
            >
              <Text style={[styles.chipText, langOverride === lang && styles.chipTextActive]}>
                {lang.toUpperCase()}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity style={styles.runBtn} onPress={handleRunPreview} disabled={loading}>
          {loading ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <>
              <MaterialCommunityIcons name="creation" size={17} color="#ffffff" />
              <Text style={styles.runBtnText}>Run Dry-Run Preview (Never Sends)</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {errorMsg && (
        <ErrorStateCard
          title="AI Preview Lab Unavailable"
          message={errorMsg}
          onRetry={handleRunPreview}
        />
      )}

      {/* Preview Output */}
      {preview && (
        <View style={styles.resultsWrap}>
          {/* Decision Outcome & Guardrails */}
          <View style={styles.card}>
            <View style={styles.outcomeHeader}>
              <Text style={styles.cardTitle}>Decision Outcome — {preview.target_label}</Text>
              <View style={styles.badgePill}>
                <Text style={styles.badgePillText}>
                  {preview.preview_only && !preview.dispatched
                    ? "PREVIEW ONLY — NEVER SENDS"
                    : "DRY RUN"}
                </Text>
              </View>
            </View>

            <View style={styles.scoreRow}>
              <View style={styles.scoreTile}>
                <Text style={styles.scoreLabel}>ELIGIBILITY</Text>
                <Text
                  style={[
                    styles.scoreVal,
                    { color: preview.eligibility_passed ? "#059669" : "#dc2626" },
                  ]}
                >
                  {preview.eligibility_passed ? "ELIGIBLE" : "SUPPRESSED"}
                </Text>
                {preview.suppression_reason && (
                  <Text style={styles.suppressionText}>{preview.suppression_reason}</Text>
                )}
              </View>

              <View style={styles.scoreTile}>
                <Text style={styles.scoreLabel}>RELEVANCE</Text>
                <Text style={styles.scoreVal}>{preview.relevance_score.toFixed(1)}</Text>
                <Text style={styles.scoreSub}>Tier: {preview.personalization_tier}</Text>
              </View>

              <View style={styles.scoreTile}>
                <Text style={styles.scoreLabel}>CONFIDENCE</Text>
                <Text style={styles.scoreVal}>{preview.confidence_score.toFixed(1)}</Text>
                <Text style={styles.scoreSub}>Channel: {preview.selected_channel || "none"}</Text>
              </View>

              <View style={styles.scoreTile}>
                <Text style={styles.scoreLabel}>FATIGUE</Text>
                <Text style={styles.scoreVal}>{preview.fatigue_score.toFixed(1)}</Text>
                <Text style={styles.scoreSub}>
                  {preview.recommended_send_at
                    ? `Send: ${new Date(preview.recommended_send_at).toLocaleTimeString()}`
                    : "Immediate window"}
                </Text>
              </View>
            </View>

            {/* AI Provider Status & Cost */}
            <View style={styles.aiMetaBox}>
              <Text style={styles.aiMetaTitle}>
                AI Provider: {preview.ai_provider} • AI Used: {preview.ai_used ? "Yes" : "No"} • Fallback:{" "}
                {preview.fallback_used ? "Yes" : "No"}
              </Text>
              <Text style={styles.aiMetaSub}>
                Factual Validation: {preview.factual_validation_passed ? "PASSED ✓" : "FAILED (Reverted to template)"} •
                Est. Tokens: {preview.estimated_tokens} • Est. Cost: ${preview.estimated_cost_usd.toFixed(5)}
              </Text>
              {preview.factual_validation_errors?.length > 0 && (
                <Text style={styles.suppressionText}>
                  Validation notes: {preview.factual_validation_errors.join("; ")}
                </Text>
              )}
            </View>
          </View>

          {/* Side-by-Side Generic vs Personalized (EN & BN) */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Side-by-Side Copy Comparison (Generic vs Personalized)</Text>
            <View style={styles.compareGrid}>
              <View style={[styles.copyCard, { borderColor: "#cbd5e1" }]}>
                <Text style={styles.copyTag}>GENERIC BASELINE ({preview.generic_variant.language.toUpperCase()})</Text>
                <Text style={styles.copyTitle}>{preview.generic_variant.title}</Text>
                <Text style={styles.copyBody}>{preview.generic_variant.body}</Text>
                {preview.generic_variant.cta && (
                  <Text style={styles.copyCta}>CTA: {preview.generic_variant.cta}</Text>
                )}
                <Text style={styles.copyLink}>Route: {preview.generic_variant.deep_link}</Text>
              </View>

              {enVariant && (
                <View style={[styles.copyCard, { borderColor: "#0284c7", backgroundColor: "#f0f9ff" }]}>
                  <Text style={[styles.copyTag, { color: "#0369a1" }]}>
                    PERSONALIZED — ENGLISH ({enVariant.tier.toUpperCase()})
                  </Text>
                  <Text style={styles.copyTitle}>{enVariant.title}</Text>
                  <Text style={styles.copyBody}>{enVariant.body}</Text>
                  {enVariant.cta && <Text style={styles.copyCta}>CTA: {enVariant.cta}</Text>}
                  {enVariant.push_short_title && (
                    <Text style={styles.lockscreenHint}>
                      Lockscreen: {enVariant.push_short_title} — {enVariant.push_short_body}
                    </Text>
                  )}
                  <Text style={styles.copyLink}>Route: {enVariant.deep_link}</Text>
                </View>
              )}

              {bnVariant && (
                <View style={[styles.copyCard, { borderColor: "#7c3aed", backgroundColor: "#faf5ff" }]}>
                  <Text style={[styles.copyTag, { color: "#6d28d9" }]}>
                    PERSONALIZED — বাংলা ({bnVariant.tier.toUpperCase()})
                  </Text>
                  <Text style={styles.copyTitle}>{bnVariant.title}</Text>
                  <Text style={styles.copyBody}>{bnVariant.body}</Text>
                  {bnVariant.cta && <Text style={styles.copyCta}>CTA: {bnVariant.cta}</Text>}
                  {bnVariant.push_short_title && (
                    <Text style={styles.lockscreenHint}>
                      Lockscreen: {bnVariant.push_short_title} — {bnVariant.push_short_body}
                    </Text>
                  )}
                  <Text style={styles.copyLink}>Route: {bnVariant.deep_link}</Text>
                </View>
              )}
            </View>
          </View>

          {/* Relevance Breakdown & Explainability */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Relevance Feature Breakdown & Safe Explainability</Text>
            <View style={{ gap: 6 }}>
              {Object.entries(preview.feature_breakdown || {}).map(([feat, score]) => (
                <View key={feat}>
                  <View style={styles.barHeaderRow}>
                    <Text style={styles.barLabel}>{feat}</Text>
                    <Text style={styles.barValue}>{Number(score).toFixed(1)} / 100</Text>
                  </View>
                  <View style={styles.barTrack}>
                    <View
                      style={[
                        styles.barFill,
                        { width: `${Math.min(Math.max(Number(score), 0), 100)}%` },
                      ]}
                    />
                  </View>
                </View>
              ))}
            </View>

            {preview.explanation_factors?.length > 0 && (
              <View style={styles.factorsBox}>
                <Text style={styles.fieldLabel}>SAFE EXPLANATION FACTORS</Text>
                {preview.explanation_factors.map((f, idx) => (
                  <Text key={idx} style={styles.factorItem}>
                    • {f}
                  </Text>
                ))}
              </View>
            )}
          </View>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { gap: 14, paddingBottom: 32 },
  previewSafetyBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: "#f5f3ff",
    borderColor: "#ddd6fe",
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
  },
  badgePill: {
    alignSelf: "flex-start",
    backgroundColor: "#6d28d9",
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgePillText: { fontSize: 10, fontWeight: "800", color: "#ffffff", letterSpacing: 0.5 },
  safetySubtitle: { fontSize: 12, color: "#5b21b6", marginTop: 4, lineHeight: 17 },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    gap: 10,
  },
  cardTitle: { fontSize: 14, fontWeight: "700", color: "#0f172a" },
  modeRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  modeBtn: {
    flex: 1,
    minWidth: 170,
    backgroundColor: "#f1f5f9",
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  modeBtnActive: { backgroundColor: "#0284c7" },
  modeBtnText: { fontSize: 12, fontWeight: "600", color: "#475569" },
  modeBtnTextActive: { color: "#ffffff" },
  presetsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  presetCard: {
    flex: 1,
    minWidth: 200,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 8,
    padding: 10,
  },
  presetCardActive: { backgroundColor: "#f0f9ff", borderColor: "#0284c7" },
  presetLabel: { fontSize: 12, fontWeight: "700", color: "#0f172a" },
  presetLabelActive: { color: "#0284c7" },
  presetSummary: { fontSize: 11, color: "#64748b", marginTop: 3 },
  fieldsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  fieldCol: { flex: 1, minWidth: 130 },
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
  chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: {
    backgroundColor: "#f1f5f9",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 14,
    paddingHorizontal: 10,
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
  langRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  runBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#6d28d9",
    paddingVertical: 11,
    borderRadius: 8,
  },
  runBtnText: { fontSize: 13, fontWeight: "700", color: "#ffffff" },
  resultsWrap: { gap: 14 },
  outcomeHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
  },
  scoreRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  scoreTile: {
    flex: 1,
    minWidth: 130,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 8,
    padding: 10,
  },
  scoreLabel: { fontSize: 10, fontWeight: "700", color: "#64748b" },
  scoreVal: { fontSize: 18, fontWeight: "800", color: "#0f172a", marginTop: 2 },
  scoreSub: { fontSize: 11, color: "#64748b", marginTop: 2 },
  suppressionText: { fontSize: 11, color: "#dc2626", marginTop: 3, fontWeight: "600" },
  aiMetaBox: {
    backgroundColor: "#f8fafc",
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    gap: 3,
  },
  aiMetaTitle: { fontSize: 12, fontWeight: "700", color: "#1e293b" },
  aiMetaSub: { fontSize: 11, color: "#475569" },
  compareGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  copyCard: {
    flex: 1,
    minWidth: 230,
    backgroundColor: "#ffffff",
    borderWidth: 1.5,
    borderRadius: 10,
    padding: 12,
    gap: 6,
  },
  copyTag: { fontSize: 10, fontWeight: "800", color: "#64748b" },
  copyTitle: { fontSize: 14, fontWeight: "700", color: "#0f172a" },
  copyBody: { fontSize: 12, color: "#334155", lineHeight: 18 },
  copyCta: { fontSize: 11, fontWeight: "700", color: "#0284c7" },
  lockscreenHint: { fontSize: 10, color: "#64748b", fontStyle: "italic" },
  copyLink: { fontSize: 10, color: "#64748b" },
  barHeaderRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 3 },
  barLabel: { fontSize: 11, fontWeight: "600", color: "#334155" },
  barValue: { fontSize: 11, fontWeight: "600", color: "#64748b" },
  barTrack: { height: 7, backgroundColor: "#f1f5f9", borderRadius: 4, overflow: "hidden" },
  barFill: { height: "100%", backgroundColor: "#0284c7", borderRadius: 4 },
  factorsBox: {
    backgroundColor: "#f8fafc",
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    gap: 4,
    marginTop: 4,
  },
  factorItem: { fontSize: 12, color: "#334155" },
});

/**
 * Bilingual Template Manager Tab — Admin Notification Command Center
 * Manage English & Bangla templates, validate `{{variable}}` placeholders across languages,
 * validate deep-link targets, and preview rendered output cleanly.
 */

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import {
  notificationCommandService,
  NotificationTemplateRecord,
  validateTemplateVariables,
} from "../../../services/notificationCommandService";
import { validateNotificationDeepLink } from "../../../services/navigation/notificationDeepLinkRegistry";
import { LoadingState } from "../../../components/ui/LoadingState";

export const TemplateManagerTab: React.FC<{
  onApplyTemplateToCompose?: (tpl: NotificationTemplateRecord, lang: "en" | "bn") => void;
}> = ({ onApplyTemplateToCompose }) => {
  const [templates, setTemplates] = useState<NotificationTemplateRecord[]>([]);
  const [source, setSource] = useState<"backend" | "local_catalog">("local_catalog");
  const [warning, setWarning] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [selectedId, setSelectedId] = useState<string>("");
  const [keyInput, setKeyInput] = useState("");
  const [nameInput, setNameInput] = useState("");
  const [categoryInput, setCategoryInput] = useState("booking");
  const [enTitle, setEnTitle] = useState("");
  const [enBody, setEnBody] = useState("");
  const [bnTitle, setBnTitle] = useState("");
  const [bnBody, setBnBody] = useState("");
  const [deepLink, setDeepLink] = useState("/(tabs)/trips");
  const [sampleVarsJson, setSampleVarsJson] = useState(
    JSON.stringify(
      {
        booking_reference: "SJ-BK-9012",
        destination: "Sylhet",
        check_in_date: "2026-12-05",
      },
      null,
      2
    )
  );

  const [previewLang, setPreviewLang] = useState<"en" | "bn">("en");
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [serverPreview, setServerPreview] = useState<{
    enTitle: string;
    enBody: string;
    bnTitle: string;
    bnBody: string;
  } | null>(null);

  const hydrateEditor = useCallback((tpl: NotificationTemplateRecord) => {
    setSelectedId(tpl.id);
    setKeyInput(tpl.key);
    setNameInput(tpl.name);
    setCategoryInput(tpl.category);
    setEnTitle(tpl.en_title);
    setEnBody(tpl.en_body);
    setBnTitle(tpl.bn_title);
    setBnBody(tpl.bn_body);
    setDeepLink(tpl.default_deep_link);
    const defaultVars: Record<string, string> = {};
    for (const v of tpl.declared_variables || []) {
      defaultVars[v] = `sample_${v}`;
    }
    if (Object.keys(defaultVars).length > 0) {
      setSampleVarsJson(JSON.stringify(defaultVars, null, 2));
    }
    setServerPreview(null);
  }, []);

  const loadTemplates = useCallback(async () => {
    try {
      setLoading(true);
      const res = await notificationCommandService.getTemplates();
      setTemplates(res.templates);
      setSource(res.source);
      setWarning(res.warning || null);
      if (res.templates.length > 0 && !selectedId) {
        hydrateEditor(res.templates[0]);
      }
    } finally {
      setLoading(false);
    }
  }, [hydrateEditor, selectedId]);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  const parsedSampleVars = useMemo(() => {
    try {
      const obj = JSON.parse(sampleVarsJson || "{}");
      return typeof obj === "object" && obj !== null ? (obj as Record<string, string>) : {};
    } catch {
      return {};
    }
  }, [sampleVarsJson]);

  const validation = useMemo(
    () =>
      validateTemplateVariables({
        enTitle,
        enBody,
        bnTitle,
        bnBody,
        sampleValues: parsedSampleVars,
      }),
    [enTitle, enBody, bnTitle, bnBody, parsedSampleVars]
  );

  const deepLinkCheck = useMemo(() => validateNotificationDeepLink(deepLink), [deepLink]);

  const handleRunPreview = async () => {
    const draft: NotificationTemplateRecord = {
      id: selectedId || `local-${Date.now()}`,
      key: keyInput.trim() || "custom_template",
      name: nameInput.trim() || "Custom Template",
      category: categoryInput.trim() || "booking",
      en_title: enTitle,
      en_body: enBody,
      bn_title: bnTitle,
      bn_body: bnBody,
      default_deep_link: deepLinkCheck.normalizedRoute,
      channels: ["push", "in_app"],
      declared_variables: validation.requiredVariables,
      is_active: true,
    };
    const res = await notificationCommandService.previewTemplateServerOrLocal({
      template: draft,
      variables: parsedSampleVars,
      language: previewLang,
    });
    setServerPreview({
      enTitle: res.renderedEnTitle,
      enBody: res.renderedEnBody,
      bnTitle: res.renderedBnTitle,
      bnBody: res.renderedBnBody,
    });
  };

  const handleSaveTemplate = async () => {
    if (!validation.valid || !deepLinkCheck.valid) {
      setSaveMessage("Fix template validation or deep-link errors before saving.");
      return;
    }
    try {
      setSaving(true);
      const res = await notificationCommandService.saveTemplate({
        id: selectedId || `local-${Date.now()}`,
        key: keyInput.trim() || `tpl_${Date.now()}`,
        name: nameInput.trim() || "Untitled Template",
        category: categoryInput.trim() || "system",
        en_title: enTitle,
        en_body: enBody,
        bn_title: bnTitle,
        bn_body: bnBody,
        default_deep_link: deepLinkCheck.normalizedRoute,
        channels: ["push", "in_app", "email"],
        declared_variables: validation.requiredVariables,
        is_active: true,
      });
      setTemplates((prev) => {
        const exists = prev.some((t) => t.id === res.saved.id);
        return exists
          ? prev.map((t) => (t.id === res.saved.id ? res.saved : t))
          : [res.saved, ...prev];
      });
      setSelectedId(res.saved.id);
      setSaveMessage(res.warning || `Saved template "${res.saved.key}" (${res.source}).`);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <LoadingState variant="skeleton" skeletonType="card" count={3} />;
  }

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Bilingual Template Manager (EN & বাংলা)</Text>
            <Text style={styles.sub}>
              Validate `{"{{variables}}"}` parity, test sample substitution & check deep links
            </Text>
          </View>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>
              {source === "backend" ? "BACKEND SYNCED" : "STARTER CATALOG"}
            </Text>
          </View>
        </View>
        {warning && <Text style={styles.warnBox}>{warning}</Text>}

        {/* Template Selector */}
        <View style={styles.tplChipsRow}>
          {templates.map((tpl) => {
            const active = tpl.id === selectedId;
            return (
              <TouchableOpacity
                key={tpl.id}
                style={[styles.tplChip, active && styles.tplChipActive]}
                onPress={() => hydrateEditor(tpl)}
              >
                <Text style={[styles.tplChipText, active && styles.tplChipTextActive]}>
                  {tpl.name}
                </Text>
              </TouchableOpacity>
            );
          })}
          <TouchableOpacity
            style={styles.newBtn}
            onPress={() =>
              hydrateEditor({
                id: `local-${Date.now()}`,
                key: "custom_bilingual_v1",
                name: "New Bilingual Template",
                category: "marketing",
                en_title: "Special {{destination}} Offer",
                en_body: "Save {{discount_pct}}% on {{destination}} packages.",
                bn_title: "{{destination}} ভ্রমণে বিশেষ অফার",
                bn_body: "{{destination}} প্যাকেজে {{discount_pct}}% পর্যন্ত ছাড়।",
                default_deep_link: "/screens/packages",
                channels: ["push", "in_app"],
                declared_variables: ["destination", "discount_pct"],
                is_active: true,
              })
            }
          >
            <Text style={styles.newBtnText}>+ New Template</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Bilingual Editor */}
      <View style={styles.card}>
        <Text style={styles.sectionLabel}>ENGLISH (EN) COPY</Text>
        <TextInput
          style={styles.input}
          value={enTitle}
          onChangeText={setEnTitle}
          placeholder="English Title with {{variable}}"
          placeholderTextColor="#94a3b8"
        />
        <TextInput
          style={[styles.input, styles.textArea]}
          multiline
          value={enBody}
          onChangeText={setEnBody}
          placeholder="English Body with {{variable}}"
          placeholderTextColor="#94a3b8"
        />

        <Text style={styles.sectionLabel}>BANGLA (বাংলা) COPY</Text>
        <TextInput
          style={styles.input}
          value={bnTitle}
          onChangeText={setBnTitle}
          placeholder="বাংলা শিরোনাম {{variable}} সহ"
          placeholderTextColor="#94a3b8"
        />
        <TextInput
          style={[styles.input, styles.textArea]}
          multiline
          value={bnBody}
          onChangeText={setBnBody}
          placeholder="বাংলা বার্তা {{variable}} সহ"
          placeholderTextColor="#94a3b8"
        />

        <Text style={styles.sectionLabel}>TARGET DEEP LINK</Text>
        <TextInput
          style={styles.input}
          value={deepLink}
          onChangeText={setDeepLink}
          placeholder="/(tabs)/trips"
          placeholderTextColor="#94a3b8"
          autoCapitalize="none"
        />
        <Text style={[styles.validationLine, { color: deepLinkCheck.valid ? "#059669" : "#dc2626" }]}>
          {deepLinkCheck.valid
            ? `✓ Valid deep link: ${deepLinkCheck.normalizedRoute}`
            : `✕ ${deepLinkCheck.reason}`}
        </Text>

        <Text style={styles.sectionLabel}>SAMPLE VARIABLE PAYLOAD (JSON)</Text>
        <TextInput
          style={[styles.input, styles.codeArea]}
          multiline
          value={sampleVarsJson}
          onChangeText={setSampleVarsJson}
          autoCapitalize="none"
        />

        {/* Variable Check Summary */}
        <View style={styles.valSummaryBox}>
          <Text style={styles.valTitle}>
            Detected Variables ({validation.requiredVariables.length}):{" "}
            {validation.requiredVariables.map((v) => `{{${v}}}`).join(", ") || "None"}
          </Text>
          {validation.missingVariables.length > 0 && (
            <Text style={styles.valWarn}>
              Missing sample values: {validation.missingVariables.join(", ")}
            </Text>
          )}
          {validation.enBnParityMismatch.length > 0 && (
            <Text style={styles.valWarn}>
              EN / বাংলা placeholder parity mismatch: {validation.enBnParityMismatch.join(", ")}
            </Text>
          )}
        </View>

        <View style={styles.actionsRow}>
          <TouchableOpacity style={styles.previewBtn} onPress={handleRunPreview}>
            <Ionicons name="eye-outline" size={16} color="#fff" />
            <Text style={styles.btnText}>Validate & Preview</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.saveBtn} onPress={handleSaveTemplate} disabled={saving}>
            {saving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name="save-outline" size={16} color="#fff" />
                <Text style={styles.btnText}>Save Template</Text>
              </>
            )}
          </TouchableOpacity>
          {onApplyTemplateToCompose && (
            <TouchableOpacity
              style={styles.applyBtn}
              onPress={() =>
                onApplyTemplateToCompose(
                  {
                    id: selectedId || "draft",
                    key: keyInput || "draft",
                    name: nameInput || "Draft",
                    category: categoryInput || "marketing",
                    en_title: serverPreview?.enTitle || enTitle,
                    en_body: serverPreview?.enBody || enBody,
                    bn_title: serverPreview?.bnTitle || bnTitle,
                    bn_body: serverPreview?.bnBody || bnBody,
                    default_deep_link: deepLinkCheck.normalizedRoute,
                    channels: ["push", "in_app"],
                    declared_variables: validation.requiredVariables,
                    is_active: true,
                  },
                  previewLang
                )
              }
            >
              <MaterialCommunityIcons name="send-check-outline" size={16} color="#0284c7" />
              <Text style={styles.applyBtnText}>Use in Compose</Text>
            </TouchableOpacity>
          )}
        </View>

        {saveMessage && <Text style={styles.saveNote}>{saveMessage}</Text>}
      </View>

      {/* Rendered Output Preview */}
      {serverPreview && (
        <View style={styles.card}>
          <View style={styles.headerRow}>
            <Text style={styles.title}>Rendered EN / বাংলা Preview</Text>
            <View style={{ flexDirection: "row", gap: 6 }}>
              {(["en", "bn"] as const).map((lng) => (
                <TouchableOpacity
                  key={lng}
                  style={[styles.langBtn, previewLang === lng && styles.langBtnActive]}
                  onPress={() => setPreviewLang(lng)}
                >
                  <Text style={[styles.langBtnText, previewLang === lng && { color: "#fff" }]}>
                    {lng === "en" ? "English" : "বাংলা"}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          <View style={styles.renderedCard}>
            <Text style={styles.renderedTitle}>
              {previewLang === "en" ? serverPreview.enTitle : serverPreview.bnTitle}
            </Text>
            <Text style={styles.renderedBody}>
              {previewLang === "en" ? serverPreview.enBody : serverPreview.bnBody}
            </Text>
          </View>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { gap: 14, paddingBottom: 24 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    gap: 10,
  },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  title: { fontSize: 15, fontWeight: "700", color: "#0f172a" },
  sub: { fontSize: 12, color: "#64748b", marginTop: 2 },
  badge: { backgroundColor: "#e0f2fe", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  badgeText: { fontSize: 10, fontWeight: "700", color: "#0369a1" },
  warnBox: { fontSize: 11, color: "#92400e", backgroundColor: "#fef3c7", padding: 8, borderRadius: 6 },
  tplChipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tplChip: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: "#f1f5f9",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  tplChipActive: { backgroundColor: "#0284c7", borderColor: "#0284c7" },
  tplChipText: { fontSize: 12, fontWeight: "600", color: "#334155" },
  tplChipTextActive: { color: "#fff" },
  newBtn: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: "#ecfdf5",
    borderWidth: 1,
    borderColor: "#a7f3d0",
  },
  newBtnText: { fontSize: 12, fontWeight: "700", color: "#047857" },
  sectionLabel: { fontSize: 11, fontWeight: "700", color: "#475569", marginTop: 4 },
  input: {
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13,
    color: "#0f172a",
  },
  textArea: { minHeight: 68, textAlignVertical: "top" },
  codeArea: { minHeight: 74, textAlignVertical: "top", fontFamily: "monospace", fontSize: 12 },
  validationLine: { fontSize: 11, fontWeight: "600" },
  valSummaryBox: {
    backgroundColor: "#f8fafc",
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    gap: 4,
  },
  valTitle: { fontSize: 12, fontWeight: "700", color: "#1e293b" },
  valWarn: { fontSize: 11, color: "#b45309" },
  actionsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 },
  previewBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#7c3aed",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
  },
  saveBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#0284c7",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
  },
  applyBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#f0f9ff",
    borderWidth: 1,
    borderColor: "#bae6fd",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
  },
  applyBtnText: { fontSize: 12, fontWeight: "700", color: "#0284c7" },
  btnText: { fontSize: 12, fontWeight: "700", color: "#fff" },
  saveNote: { fontSize: 12, color: "#0369a1", fontWeight: "600" },
  langBtn: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6, backgroundColor: "#f1f5f9" },
  langBtnActive: { backgroundColor: "#0284c7" },
  langBtnText: { fontSize: 11, fontWeight: "700", color: "#334155" },
  renderedCard: {
    backgroundColor: "#0f172a",
    padding: 14,
    borderRadius: 10,
    gap: 6,
  },
  renderedTitle: { fontSize: 14, fontWeight: "700", color: "#f8fafc" },
  renderedBody: { fontSize: 13, color: "#cbd5e1", lineHeight: 19 },
});

import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  Modal,
  Alert,
  PanResponder,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Svg, { Path } from "react-native-svg";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { useProviderHubStore } from "@/features/rider/providerStore";
import { Contract, ContractType } from "@/services/contract/contractService";

const TEAL = "#0D9488";
const GOLD = "#E5A93C";
const NAVY = "#0F172A";
const NAVY_LIGHT = "#1E293B";
const BORDER = "#334155";

const CONTRACT_TYPES: Array<{ key: ContractType; label: string }> = [
  { key: "booking_agreement", label: "Booking Agreement" },
  { key: "agency_commission", label: "Agency Commission" },
  { key: "maintenance_agreement", label: "Fleet Maintenance" },
];

export default function ProviderContractScreen() {
  const contracts = useProviderHubStore((s) => s.contracts);
  const providerName = useProviderHubStore((s) => s.providerName);
  const loadContracts = useProviderHubStore((s) => s.loadContracts);
  const createProviderContract = useProviderHubStore((s) => s.createProviderContract);
  const signProviderContract = useProviderHubStore((s) => s.signProviderContract);

  const [createVisible, setCreateVisible] = useState(false);
  const [signTarget, setSignTarget] = useState<Contract | null>(null);
  const [title, setTitle] = useState("");
  const [contractType, setContractType] = useState<ContractType>("booking_agreement");
  const [partyName, setPartyName] = useState("");
  const [partyPhone, setPartyPhone] = useState("");
  const [partyEmail, setPartyEmail] = useState("");
  const [terms, setTerms] = useState(
    "Standard Bangladesh mobility & guided tour SLA: 15% platform commission, BRTA verified vehicle compliance, 24h cancellation notice."
  );
  const [paths, setPaths] = useState<string[]>([]);
  const [activePath, setActivePath] = useState("");
  const [busy, setBusy] = useState(false);

  const strokeRef = useRef("");

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        const { locationX, locationY } = evt.nativeEvent;
        const start = `M${locationX.toFixed(1)},${locationY.toFixed(1)}`;
        strokeRef.current = start;
        setActivePath(start);
      },
      onPanResponderMove: (evt) => {
        const { locationX, locationY } = evt.nativeEvent;
        const next = `${strokeRef.current} L${locationX.toFixed(1)},${locationY.toFixed(1)}`;
        strokeRef.current = next;
        setActivePath(next);
      },
      onPanResponderRelease: () => {
        if (strokeRef.current) {
          const done = strokeRef.current;
          setPaths((prev) => [...prev, done]);
          strokeRef.current = "";
          setActivePath("");
        }
      },
    })
  ).current;

  useEffect(() => {
    loadContracts().catch(() => {});
  }, [loadContracts]);

  const handleCreate = async () => {
    if (!title.trim() || !partyName.trim()) {
      Alert.alert("Required", "Enter contract title and counterparty name.");
      return;
    }
    setBusy(true);
    try {
      await createProviderContract({
        type: contractType,
        title: title.trim(),
        partyName: partyName.trim(),
        partyPhone: partyPhone.trim() || "+8801700000000",
        partyEmail: partyEmail.trim() || "partner@shopnojatra.com",
        terms: terms.trim(),
      });
      setCreateVisible(false);
      setTitle("");
      setPartyName("");
      setPartyPhone("");
      setPartyEmail("");
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmSignature = async () => {
    if (!signTarget) return;
    const svgStroke = [...paths, activePath].filter(Boolean).join(" ");
    if (svgStroke.length < 4) {
      Alert.alert("Signature Needed", "Please draw your signature inside the pad.");
      return;
    }
    setBusy(true);
    try {
      const encoded = `svg-path:${svgStroke}`;
      await signProviderContract(signTarget.id, encoded);
      setSignTarget(null);
      setPaths([]);
      setActivePath("");
      Alert.alert("Contract Signed", "Digital e-signature applied and saved.");
    } finally {
      setBusy(false);
    }
  };

  const handleExportPdf = async (contract: Contract) => {
    const html = `
      <html>
        <body style="font-family: Arial, sans-serif; padding: 28px; color: #0F172A;">
          <h2>ShopnoJatra Official Service Agreement</h2>
          <p><strong>Title:</strong> ${contract.title}</p>
          <p><strong>Type:</strong> ${contract.type}</p>
          <p><strong>Status:</strong> ${contract.status.toUpperCase()}</p>
          <hr />
          <p><strong>Provider:</strong> ${providerName}</p>
          <p><strong>Counterparty:</strong> ${contract.party.name} (${contract.party.phone}, ${contract.party.email})</p>
          <h3>Terms & Conditions</h3>
          <p>${contract.terms}</p>
          <p style="margin-top: 24px;"><strong>Digital Signature Record:</strong> ${
            contract.signatureBase64 ? "SIGNED (" + contract.signatureBase64.slice(0, 48) + "...)" : "PENDING"
          }</p>
        </body>
      </html>
    `;
    try {
      const { uri } = await Print.printToFileAsync({ html });
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, { mimeType: "application/pdf" });
      } else {
        Alert.alert("PDF Exported", `Saved to ${uri}`);
      }
    } catch (err: unknown) {
      Alert.alert(
        "Export Info",
        err instanceof Error ? err.message : "Could not generate PDF on this platform."
      );
    }
  };

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <Text style={styles.pageTitle}>📄 E-Contracts & Agreements</Text>
        <Pressable style={styles.addBtn} onPress={() => setCreateVisible(true)}>
          <Ionicons name="add" size={18} color="#fff" />
          <Text style={styles.addBtnText}>New Contract</Text>
        </Pressable>
      </View>

      {contracts.length === 0 ? (
        <View style={styles.emptyBox}>
          <Ionicons name="document-text-outline" size={40} color="#64748B" />
          <Text style={styles.emptyTitle}>No Contracts Drafted Yet</Text>
          <Text style={styles.emptySub}>
            Create chauffeur agreements, hotel tour SLAs, or agency commission contracts with instant e-signature and PDF export.
          </Text>
        </View>
      ) : (
        contracts.map((c) => {
          const isSigned = c.status === "signed";
          return (
            <View key={c.id} style={styles.card}>
              <View style={styles.cardTop}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>{c.title}</Text>
                  <Text style={styles.cardParty}>
                    Counterparty: {c.party.name} • {c.party.phone}
                  </Text>
                </View>
                <View
                  style={[
                    styles.statusChip,
                    { backgroundColor: isSigned ? "#065F46" : "#1E3A8A" },
                  ]}
                >
                  <Text
                    style={[
                      styles.statusText,
                      { color: isSigned ? "#6EE7B7" : "#93C5FD" },
                    ]}
                  >
                    {c.status.toUpperCase()}
                  </Text>
                </View>
              </View>

              <Text style={styles.termsText} numberOfLines={3}>
                {c.terms}
              </Text>

              <View style={styles.cardActions}>
                {!isSigned && (
                  <Pressable
                    style={styles.signBtn}
                    onPress={() => {
                      setPaths([]);
                      setActivePath("");
                      setSignTarget(c);
                    }}
                  >
                    <Ionicons name="create-outline" size={16} color="#fff" />
                    <Text style={styles.signBtnText}>E-Sign Contract</Text>
                  </Pressable>
                )}
                <Pressable
                  style={styles.pdfBtn}
                  onPress={() => handleExportPdf(c)}
                >
                  <Ionicons name="download-outline" size={16} color={GOLD} />
                  <Text style={styles.pdfBtnText}>Export PDF</Text>
                </Pressable>
              </View>
            </View>
          );
        })
      )}

      <View style={{ height: 40 }} />

      {/* Create Contract Modal */}
      <Modal
        visible={createVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setCreateVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Draft New Agreement</Text>
              <Pressable onPress={() => setCreateVisible(false)}>
                <Ionicons name="close" size={22} color="#94A3B8" />
              </Pressable>
            </View>

            <Text style={styles.fieldLabel}>Agreement Title *</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Executive Airport Transfer SLA"
              placeholderTextColor="#475569"
              value={title}
              onChangeText={setTitle}
            />

            <Text style={styles.fieldLabel}>Type</Text>
            <View style={styles.typeRow}>
              {CONTRACT_TYPES.map((t) => (
                <Pressable
                  key={t.key}
                  style={[
                    styles.typeChip,
                    contractType === t.key && styles.typeChipActive,
                  ]}
                  onPress={() => setContractType(t.key)}
                >
                  <Text
                    style={[
                      styles.typeText,
                      contractType === t.key && styles.typeTextActive,
                    ]}
                  >
                    {t.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.fieldLabel}>Counterparty Name *</Text>
            <TextInput
              style={styles.input}
              placeholder="Hotel / Corporate / Passenger Name"
              placeholderTextColor="#475569"
              value={partyName}
              onChangeText={setPartyName}
            />

            <View style={styles.row}>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                placeholder="Phone (+880...)"
                placeholderTextColor="#475569"
                value={partyPhone}
                onChangeText={setPartyPhone}
              />
              <TextInput
                style={[styles.input, { flex: 1 }]}
                placeholder="Email"
                placeholderTextColor="#475569"
                value={partyEmail}
                onChangeText={setPartyEmail}
              />
            </View>

            <Text style={styles.fieldLabel}>Terms</Text>
            <TextInput
              style={[styles.input, { minHeight: 72, textAlignVertical: "top" }]}
              multiline
              value={terms}
              onChangeText={setTerms}
            />

            <Pressable style={styles.primaryBtn} onPress={handleCreate} disabled={busy}>
              <Text style={styles.primaryBtnText}>
                {busy ? "Creating..." : "Create Draft"}
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Interactive E-Signature Modal */}
      <Modal
        visible={!!signTarget}
        transparent
        animationType="fade"
        onRequestClose={() => setSignTarget(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>E-Sign: {signTarget?.title}</Text>
              <Pressable onPress={() => setSignTarget(null)}>
                <Ionicons name="close" size={22} color="#94A3B8" />
              </Pressable>
            </View>

            <View style={styles.sigTop}>
              <Text style={styles.fieldLabel}>Draw your digital signature below</Text>
              <Pressable
                onPress={() => {
                  setPaths([]);
                  setActivePath("");
                }}
              >
                <Text style={{ color: GOLD, fontSize: 12, fontWeight: "700" }}>
                  Clear
                </Text>
              </Pressable>
            </View>

            <View style={styles.sigPad} {...panResponder.panHandlers}>
              <Svg style={StyleSheet.absoluteFill}>
                {paths.map((d, i) => (
                  <Path
                    key={i}
                    d={d}
                    stroke="#34D399"
                    strokeWidth={2.5}
                    fill="none"
                    strokeLinecap="round"
                  />
                ))}
                {activePath ? (
                  <Path
                    d={activePath}
                    stroke="#34D399"
                    strokeWidth={2.5}
                    fill="none"
                    strokeLinecap="round"
                  />
                ) : null}
              </Svg>
              {paths.length === 0 && !activePath && (
                <Text style={{ color: "#475569", fontSize: 12 }}>
                  Sign inside this pad
                </Text>
              )}
            </View>

            <Pressable
              style={styles.primaryBtn}
              onPress={handleConfirmSignature}
              disabled={busy}
            >
              <Text style={styles.primaryBtnText}>
                {busy ? "Signing..." : "Apply Signature"}
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: NAVY, padding: 16 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 20,
    marginBottom: 16,
  },
  pageTitle: { color: "#F1F5F9", fontSize: 20, fontWeight: "700" },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: TEAL,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  addBtnText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  emptyBox: {
    backgroundColor: NAVY_LIGHT,
    borderRadius: 14,
    padding: 28,
    alignItems: "center",
    borderWidth: 1,
    borderColor: BORDER,
  },
  emptyTitle: { color: "#F1F5F9", fontSize: 15, fontWeight: "700", marginTop: 10 },
  emptySub: {
    color: "#94A3B8",
    fontSize: 12,
    textAlign: "center",
    marginTop: 6,
    lineHeight: 18,
  },
  card: {
    backgroundColor: NAVY_LIGHT,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: BORDER,
    marginBottom: 12,
  },
  cardTop: { flexDirection: "row", alignItems: "flex-start", gap: 8, marginBottom: 8 },
  cardTitle: { color: "#F1F5F9", fontSize: 15, fontWeight: "700" },
  cardParty: { color: "#94A3B8", fontSize: 12, marginTop: 2 },
  statusChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  statusText: { fontSize: 10, fontWeight: "800" },
  termsText: { color: "#CBD5E1", fontSize: 12, lineHeight: 17, marginBottom: 12 },
  cardActions: { flexDirection: "row", gap: 8 },
  signBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: TEAL,
    paddingVertical: 9,
    borderRadius: 8,
  },
  signBtnText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  pdfBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    backgroundColor: NAVY,
    borderWidth: 1,
    borderColor: GOLD + "66",
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 8,
  },
  pdfBtnText: { color: GOLD, fontSize: 12, fontWeight: "700" },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.75)",
    justifyContent: "center",
    padding: 18,
  },
  modalCard: {
    backgroundColor: NAVY_LIGHT,
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: BORDER,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  modalTitle: { color: "#F1F5F9", fontSize: 16, fontWeight: "700" },
  fieldLabel: { color: "#94A3B8", fontSize: 12, marginBottom: 5 },
  input: {
    backgroundColor: NAVY,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: BORDER,
    color: "#F1F5F9",
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13,
    marginBottom: 10,
  },
  row: { flexDirection: "row", gap: 8 },
  typeRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 10 },
  typeChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: NAVY,
    borderWidth: 1,
    borderColor: BORDER,
  },
  typeChipActive: { backgroundColor: TEAL, borderColor: TEAL },
  typeText: { color: "#94A3B8", fontSize: 11 },
  typeTextActive: { color: "#fff", fontWeight: "700" },
  primaryBtn: {
    backgroundColor: TEAL,
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: "center",
    marginTop: 6,
  },
  primaryBtnText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  sigTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  sigPad: {
    height: 130,
    backgroundColor: NAVY,
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: BORDER,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
    overflow: "hidden",
  },
});

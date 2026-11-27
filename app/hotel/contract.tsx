import React, { useState, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  Modal,
  TextInput,
  ScrollView,
  PanResponder,
  Animated,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system/legacy";
import { useContract } from "@/hooks/useContract";
import type { ContractData, Contract, ContractType, ContractStatus } from "@/services/contract/contractService";
import { useHotelPmsStore, useHotelPmsComputed, HotelContractRecord } from "@/features/hotel";

const NAVY = "#0F172A";
const NAVY_LIGHT = "#1E293B";
const GOLD = "#E5A93C";
const GREEN = "#22C55E";
const RED = "#EF4444";
const YELLOW = "#F59E0B";
const BLUE = "#3B82F6";
const GRAY = "#64748B";

const STATUS_COLORS: Record<ContractStatus, string> = {
  draft: GRAY,
  sent: BLUE,
  signed: GREEN,
  expired: RED,
};

const CONTRACT_TYPES: { value: ContractType; label: string }[] = [
  { value: "booking_agreement", label: "Booking Agreement" },
  { value: "maintenance_agreement", label: "Maintenance Agreement" },
  { value: "agency_commission", label: "Agency Commission Contract" },
];

interface SignatureCanvasProps {
  onSignatureCapture: (sig: string) => void;
}

function SignatureCanvas({ onSignatureCapture }: SignatureCanvasProps) {
  const pathRef = useRef<string[]>([]);
  const [paths, setPaths] = useState<string[]>([]);

  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (e) => {
      const { locationX, locationY } = e.nativeEvent;
      pathRef.current = [`M${locationX.toFixed(0)},${locationY.toFixed(0)}`];
    },
    onPanResponderMove: (e) => {
      const { locationX, locationY } = e.nativeEvent;
      pathRef.current.push(`L${locationX.toFixed(0)},${locationY.toFixed(0)}`);
      setPaths([...pathRef.current]);
    },
    onPanResponderRelease: () => {
      const svgPath = pathRef.current.join(" ");
      const base64 = Buffer.from(svgPath).toString("base64");
      onSignatureCapture(base64);
    },
  });

  const clear = () => {
    pathRef.current = [];
    setPaths([]);
    onSignatureCapture("");
  };

  const pathD = paths.join(" ");

  return (
    <View>
      <View style={sig.canvas} {...panResponder.panHandlers}>
        {paths.length === 0 && (
          <Text style={sig.placeholder}>Draw signature here</Text>
        )}
        {paths.length > 0 && (
          <View style={sig.drawArea}>
            {/* Visual feedback for signature path */}
            <Text style={sig.sigPreview}>✍ Signature captured ({paths.length} points)</Text>
          </View>
        )}
      </View>
      <Pressable style={sig.clearBtn} onPress={clear}>
        <Text style={sig.clearText}>Clear</Text>
      </Pressable>
    </View>
  );
}

interface ContractModalProps {
  visible: boolean;
  onClose: () => void;
  onSave: (data: ContractData) => void;
}

type ModalStep = "form" | "signature" | "preview";

function ContractModal({ visible, onClose, onSave }: ContractModalProps) {
  const [step, setStep] = useState<ModalStep>("form");
  const [contractType, setContractType] = useState<ContractType>("booking_agreement");
  const [partyName, setPartyName] = useState("");
  const [partyPhone, setPartyPhone] = useState("");
  const [partyEmail, setPartyEmail] = useState("");
  const [terms, setTerms] = useState("");
  const [signature, setSignature] = useState("");

  const reset = () => {
    setStep("form");
    setContractType("booking_agreement");
    setPartyName("");
    setPartyPhone("");
    setPartyEmail("");
    setTerms("");
    setSignature("");
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSend = () => {
    if (!partyName || !terms) {
      Alert.alert("Error", "Name and terms are required.");
      return;
    }
    onSave({
      type: contractType,
      title: CONTRACT_TYPES.find((t) => t.value === contractType)?.label ?? "Contract",
      party: { name: partyName, phone: partyPhone, email: partyEmail },
      terms,
      ownerId: "hotel1",
    });
    handleClose();
  };

  const handleDownload = async () => {
    const content = `CONTRACT\n\nType: ${contractType}\nParty: ${partyName}\nPhone: ${partyPhone}\nEmail: ${partyEmail}\n\nTERMS:\n${terms}\n\nSigned: ${signature ? "Yes" : "No"}`;
    const path = `${FileSystem.documentDirectory}contract_${Date.now()}.txt`;
    await FileSystem.writeAsStringAsync(path, content);
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(path);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={cModal.overlay}>
        <View style={cModal.container}>
          <View style={cModal.header}>
            <Text style={cModal.title}>
              {step === "form" ? "New Contract" : step === "signature" ? "E-Signature" : "Preview"}
            </Text>
            <Pressable onPress={handleClose}>
              <Ionicons name="close" size={24} color="#94A3B8" />
            </Pressable>
          </View>

          {/* Steps indicator */}
          <View style={cModal.steps}>
            {(["form", "signature", "preview"] as ModalStep[]).map((s, i) => (
              <View key={s} style={cModal.stepRow}>
                <View style={[cModal.stepDot, step === s && cModal.stepDotActive]}>
                  <Text style={cModal.stepNum}>{i + 1}</Text>
                </View>
                {i < 2 && <View style={cModal.stepLine} />}
              </View>
            ))}
          </View>

          <ScrollView style={cModal.scroll}>
            {step === "form" && (
              <View style={cModal.formBody}>
                <Text style={cModal.label}>Contract Type</Text>
                {CONTRACT_TYPES.map((ct) => (
                  <Pressable
                    key={ct.value}
                    style={[cModal.typeBtn, contractType === ct.value && cModal.typeBtnActive]}
                    onPress={() => setContractType(ct.value)}
                  >
                    <Text style={[cModal.typeText, contractType === ct.value && cModal.typeTextActive]}>{ct.label}</Text>
                  </Pressable>
                ))}

                <Text style={cModal.label}>Party Name</Text>
                <TextInput style={cModal.input} value={partyName} onChangeText={setPartyName} placeholder="Full name" placeholderTextColor={GRAY} />

                <Text style={cModal.label}>Phone</Text>
                <TextInput style={cModal.input} value={partyPhone} onChangeText={setPartyPhone} placeholder="+880..." placeholderTextColor={GRAY} keyboardType="phone-pad" />

                <Text style={cModal.label}>Email</Text>
                <TextInput style={cModal.input} value={partyEmail} onChangeText={setPartyEmail} placeholder="email@example.com" placeholderTextColor={GRAY} keyboardType="email-address" />

                <Text style={cModal.label}>Terms & Conditions</Text>
                <TextInput
                  style={[cModal.input, cModal.termsInput]}
                  value={terms}
                  onChangeText={setTerms}
                  placeholder="Enter contract terms..."
                  placeholderTextColor={GRAY}
                  multiline
                  textAlignVertical="top"
                />

                <Pressable style={cModal.nextBtn} onPress={() => setStep("signature")}>
                  <Text style={cModal.nextBtnText}>Next: Signature →</Text>
                </Pressable>
              </View>
            )}

            {step === "signature" && (
              <View style={cModal.formBody}>
                <Text style={cModal.label}>Draw Your Signature</Text>
                <SignatureCanvas onSignatureCapture={setSignature} />
                <View style={cModal.sigActions}>
                  <Pressable style={cModal.backBtn} onPress={() => setStep("form")}>
                    <Text style={cModal.backBtnText}>← Back</Text>
                  </Pressable>
                  <Pressable style={cModal.nextBtn} onPress={() => setStep("preview")}>
                    <Text style={cModal.nextBtnText}>Preview →</Text>
                  </Pressable>
                </View>
              </View>
            )}

            {step === "preview" && (
              <View style={cModal.formBody}>
                <View style={cModal.previewCard}>
                  <Text style={cModal.previewTitle}>{CONTRACT_TYPES.find((t) => t.value === contractType)?.label}</Text>
                  <Text style={cModal.previewDetail}>Party: {partyName}</Text>
                  <Text style={cModal.previewDetail}>Phone: {partyPhone}</Text>
                  <Text style={cModal.previewDetail}>Email: {partyEmail}</Text>
                  <Text style={cModal.previewLabel}>Terms:</Text>
                  <Text style={cModal.previewTerms}>{terms}</Text>
                  <Text style={cModal.previewSig}>{signature ? "✍ Signed" : "⚠ No signature"}</Text>
                </View>
                <View style={cModal.sigActions}>
                  <Pressable style={cModal.backBtn} onPress={() => setStep("signature")}>
                    <Text style={cModal.backBtnText}>← Back</Text>
                  </Pressable>
                  <Pressable style={cModal.sendBtn} onPress={handleSend}>
                    <Ionicons name="send-outline" size={16} color={NAVY} />
                    <Text style={cModal.sendBtnText}>Send</Text>
                  </Pressable>
                  <Pressable style={cModal.dlBtn} onPress={handleDownload}>
                    <Ionicons name="download-outline" size={16} color={GOLD} />
                    <Text style={cModal.dlBtnText}>PDF</Text>
                  </Pressable>
                </View>
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function ContractCard({ contract }: { contract: Contract }) {
  const statusColor = STATUS_COLORS[contract.status];
  const timeline: ContractStatus[] = ["draft", "sent", "signed"];

  return (
    <View style={cc.container}>
      <View style={cc.header}>
        <View style={cc.info}>
          <Text style={cc.title}>{contract.title}</Text>
          <Text style={cc.party}>{contract.party.name}</Text>
          <Text style={cc.date}>{contract.createdAt.toLocaleDateString()}</Text>
        </View>
        <View style={[cc.badge, { backgroundColor: statusColor + "33" }]}>
          <Text style={[cc.badgeText, { color: statusColor }]}>
            {contract.status.charAt(0).toUpperCase() + contract.status.slice(1)}
          </Text>
        </View>
      </View>

      {/* Status Timeline */}
      <View style={cc.timeline}>
        {timeline.map((s, i) => {
          const idx = timeline.indexOf(contract.status as ContractStatus);
          const isActive = i <= idx;
          const tColor = STATUS_COLORS[s];
          return (
            <React.Fragment key={s}>
              <View style={[cc.tlDot, { backgroundColor: isActive ? tColor : "#334155" }]}>
                {isActive && <Ionicons name="checkmark" size={8} color="#fff" />}
              </View>
              {i < timeline.length - 1 && (
                <View style={[cc.tlLine, { backgroundColor: i < idx ? tColor : "#334155" }]} />
              )}
            </React.Fragment>
          );
        })}
      </View>
      <View style={cc.tlLabels}>
        {timeline.map((s) => (
          <Text key={s} style={cc.tlLabel}>{s.charAt(0).toUpperCase() + s.slice(1)}</Text>
        ))}
      </View>
    </View>
  );
}

export default function ContractScreen() {
  const { workspace, patchWorkspace } = useHotelPmsStore();
  const { currentProperty } = useHotelPmsComputed();
  const [modalVisible, setModalVisible] = useState(false);

  const contracts: Contract[] = workspace.contracts
    .filter((c) => c.hotelId === currentProperty.id)
    .map((c) => ({
      ...c,
      createdAt: new Date(c.createdAt),
      updatedAt: new Date(c.updatedAt),
    }));

  const handleSave = (data: ContractData) => {
    const nowIso = new Date().toISOString();
    const newRecord: HotelContractRecord = {
      id: `cnt_${Date.now()}`,
      hotelId: currentProperty.id,
      type: data.type,
      title: data.title,
      party: data.party,
      terms: data.terms,
      ownerId: currentProperty.id,
      status: "sent",
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    patchWorkspace((draft) => ({
      ...draft,
      contracts: [newRecord, ...draft.contracts],
    }));
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Partner Contracts</Text>
          <Text style={{ color: "#94A3B8", fontSize: 11, marginTop: 2 }}>
            {currentProperty.name} • {contracts.length} Agreements
          </Text>
        </View>
        <Pressable style={styles.addBtn} onPress={() => setModalVisible(true)}>
          <Ionicons name="add" size={18} color={NAVY} />
          <Text style={styles.addBtnText}>New Contract</Text>
        </Pressable>
      </View>

      <FlatList
        data={contracts}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <ContractCard contract={item} />}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
      />

      <ContractModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        onSave={handleSave}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: NAVY },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 16, paddingTop: 52 },
  title: { fontSize: 22, fontWeight: "800", color: "#F1F5F9" },
  addBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: GOLD, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 },
  addBtnText: { color: NAVY, fontWeight: "700", fontSize: 14 },
  list: { padding: 16, paddingBottom: 32 },
});

const cc = StyleSheet.create({
  container: { backgroundColor: NAVY_LIGHT, borderRadius: 16, padding: 16, marginBottom: 12 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 },
  info: {},
  title: { color: "#F1F5F9", fontSize: 15, fontWeight: "700" },
  party: { color: "#94A3B8", fontSize: 13, marginTop: 2 },
  date: { color: GRAY, fontSize: 11, marginTop: 2 },
  badge: { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5 },
  badgeText: { fontSize: 12, fontWeight: "700" },
  timeline: { flexDirection: "row", alignItems: "center", marginTop: 8 },
  tlDot: { width: 18, height: 18, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  tlLine: { flex: 1, height: 2 },
  tlLabels: { flexDirection: "row", justifyContent: "space-between", marginTop: 4 },
  tlLabel: { color: GRAY, fontSize: 10, flex: 1, textAlign: "center" },
});

const sig = StyleSheet.create({
  canvas: { height: 150, backgroundColor: NAVY, borderRadius: 14, borderWidth: 1, borderColor: "#334155", alignItems: "center", justifyContent: "center", marginBottom: 8 },
  placeholder: { color: GRAY, fontSize: 14 },
  drawArea: { flex: 1, width: "100%", alignItems: "center", justifyContent: "center" },
  sigPreview: { color: GREEN, fontSize: 13, fontWeight: "600" },
  clearBtn: { alignSelf: "flex-end", paddingHorizontal: 12, paddingVertical: 6, backgroundColor: RED + "22", borderRadius: 8 },
  clearText: { color: RED, fontSize: 12, fontWeight: "600" },
});

const cModal = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.75)", justifyContent: "flex-end" },
  container: { backgroundColor: NAVY_LIGHT, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "92%", paddingBottom: 20 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 20, borderBottomWidth: 1, borderBottomColor: "#334155" },
  title: { fontSize: 18, fontWeight: "800", color: "#F1F5F9" },
  steps: { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingVertical: 12 },
  stepRow: { flexDirection: "row", alignItems: "center", flex: 1 },
  stepDot: { width: 24, height: 24, borderRadius: 12, backgroundColor: "#334155", alignItems: "center", justifyContent: "center" },
  stepDotActive: { backgroundColor: GOLD },
  stepNum: { color: "#fff", fontSize: 12, fontWeight: "700" },
  stepLine: { flex: 1, height: 2, backgroundColor: "#334155" },
  scroll: { paddingHorizontal: 20, maxHeight: 480 },
  formBody: { paddingBottom: 16 },
  label: { color: "#94A3B8", fontSize: 13, fontWeight: "600", marginTop: 14, marginBottom: 6 },
  input: { backgroundColor: NAVY, borderRadius: 12, padding: 14, color: "#F1F5F9", fontSize: 14, borderWidth: 1, borderColor: "#334155" },
  termsInput: { height: 120 },
  typeBtn: { padding: 12, borderRadius: 10, borderWidth: 1, borderColor: "#334155", marginBottom: 6 },
  typeBtnActive: { borderColor: GOLD, backgroundColor: GOLD + "22" },
  typeText: { color: "#94A3B8", fontSize: 13 },
  typeTextActive: { color: GOLD, fontWeight: "700" },
  nextBtn: { backgroundColor: GOLD, borderRadius: 12, padding: 14, alignItems: "center", marginTop: 16 },
  nextBtnText: { color: NAVY, fontSize: 15, fontWeight: "800" },
  backBtn: { flex: 1, backgroundColor: "#334155", borderRadius: 12, padding: 14, alignItems: "center" },
  backBtnText: { color: "#94A3B8", fontSize: 14, fontWeight: "600" },
  sigActions: { flexDirection: "row", gap: 8, marginTop: 16 },
  sendBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: GOLD, borderRadius: 12, padding: 14 },
  sendBtnText: { color: NAVY, fontSize: 14, fontWeight: "700" },
  dlBtn: { backgroundColor: GOLD + "22", borderRadius: 12, padding: 14, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: GOLD },
  dlBtnText: { color: GOLD, fontSize: 13, fontWeight: "700" },
  previewCard: { backgroundColor: NAVY, borderRadius: 14, padding: 16, gap: 6 },
  previewTitle: { color: "#F1F5F9", fontSize: 16, fontWeight: "800", marginBottom: 8 },
  previewDetail: { color: "#94A3B8", fontSize: 13 },
  previewLabel: { color: "#94A3B8", fontSize: 13, fontWeight: "700", marginTop: 8 },
  previewTerms: { color: "#F1F5F9", fontSize: 13, lineHeight: 20 },
  previewSig: { color: GREEN, fontSize: 13, fontWeight: "700", marginTop: 8 },
});

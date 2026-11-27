import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  TextInput,
} from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useMarketplaceStore } from "../store/marketplaceStore";
import { HERITAGE_DISTRICTS } from "../constants/catalog";

interface GiProvenanceModalProps {
  visible: boolean;
  onClose: () => void;
  initialCode?: string;
  initialProductId?: string;
}

const THEME_PRIMARY = "#78350F";
const THEME_ACCENT = "#D97706";
const THEME_EMERALD = "#059669";
const THEME_RED = "#DC2626";

export const GiProvenanceModal: React.FC<GiProvenanceModalProps> = ({
  visible,
  onClose,
  initialCode,
}) => {
  const [code, setCode] = useState(initialCode || "SJ-GI-01");
  const selectedDistrictId = useMarketplaceStore((s) => s.giSelectedDistrictId);
  const setSelectedDistrictId = useMarketplaceStore(
    (s) => s.setSelectedDistrictId
  );
  const verifyGiTag = useMarketplaceStore((s) => s.verifyGiTag);
  const verificationResult = useMarketplaceStore(
    (s) => s.giVerificationResult
  );

  useEffect(() => {
    if (initialCode) {
      setCode(initialCode);
    }
  }, [initialCode]);

  const activeDistrict =
    HERITAGE_DISTRICTS.find((d) => d.id === selectedDistrictId) ||
    HERITAGE_DISTRICTS[0];

  const handleVerify = () => {
    if (!code.trim()) return;
    verifyGiTag(code.trim());
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View style={styles.titleRow}>
              <MaterialCommunityIcons name="certificate" size={24} color={THEME_EMERALD} />
              <View>
                <Text style={styles.title}>জিআই স্বীকৃতি ও ভৌগোলিক উৎস যাচাই</Text>
                <Text style={styles.subtitle}>
                  Geographical Indication (GI) Provenance & Trust
                </Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={20} color="#64748B" />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
            <View style={styles.verifierCard}>
              <Text style={styles.verifierLabel}>জিআই সনদ বা কিউআর কোড যাচাই করুন:</Text>
              <View style={styles.inputRow}>
                <TextInput
                  style={styles.input}
                  placeholder="যেমন: SJ-GI-01 বা BD-GI-01/NRG"
                  value={code}
                  onChangeText={setCode}
                  placeholderTextColor="#94A3B8"
                  autoCapitalize="characters"
                />
                <TouchableOpacity style={styles.verifyBtn} onPress={handleVerify}>
                  <Ionicons name="shield-checkmark" size={16} color="#FFF" />
                  <Text style={styles.verifyBtnText}>যাচাই করুন</Text>
                </TouchableOpacity>
              </View>

              {verificationResult && (
                <View
                  style={[
                    styles.resultCard,
                    verificationResult.valid
                      ? styles.resultAuthentic
                      : styles.resultInvalid,
                  ]}
                >
                  <View style={styles.resultHeader}>
                    <Ionicons
                      name={
                        verificationResult.valid
                          ? "checkmark-circle"
                          : "alert-circle"
                      }
                      size={24}
                      color={
                        verificationResult.valid ? THEME_EMERALD : THEME_RED
                      }
                    />
                    <Text
                      style={[
                        styles.resultStatusText,
                        verificationResult.valid
                          ? { color: THEME_EMERALD }
                          : { color: THEME_RED },
                      ]}
                    >
                      {verificationResult.valid
                        ? "১০০% আসল ও অনুমোদিত জিআই সনদ"
                        : "সনদ যাচাইয়ে অসংগতি পাওয়া গেছে"}
                    </Text>
                  </View>

                  <Text style={styles.resultMessage}>
                    {verificationResult.provenanceStory ||
                      verificationResult.reason ||
                      "Department of Patents, Designs and Trademarks (DPDT) Registry Verified."}
                  </Text>

                  {verificationResult.valid && (
                    <View style={styles.certMetadata}>
                      <View style={styles.metaRow}>
                        <Text style={styles.metaKey}>সনদ কোড:</Text>
                        <Text style={styles.metaVal}>
                          {verificationResult.certificateCode}
                        </Text>
                      </View>
                      {verificationResult.originDistrict && (
                        <View style={styles.metaRow}>
                          <Text style={styles.metaKey}>উৎপত্তি জেলা:</Text>
                          <Text style={styles.metaVal}>
                            {verificationResult.originDistrict}
                          </Text>
                        </View>
                      )}
                      {verificationResult.artisanGuild && (
                        <View style={styles.metaRow}>
                          <Text style={styles.metaKey}>অনুমোদিত সমিতি:</Text>
                          <Text style={styles.metaVal}>
                            {verificationResult.artisanGuild}
                          </Text>
                        </View>
                      )}
                      {verificationResult.giRegistrationNumber && (
                        <View style={styles.metaRow}>
                          <Text style={styles.metaKey}>জাতীয় রেজিস্ট্রি:</Text>
                          <Text style={styles.metaVal}>
                            {verificationResult.giRegistrationNumber}
                          </Text>
                        </View>
                      )}
                    </View>
                  )}
                </View>
              )}
            </View>

            <Text style={styles.sectionTitle}>ঐতিহ্যবাহী জেলা ও জিআই তালিকা:</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.districtsScroll}>
              {HERITAGE_DISTRICTS.map((dist) => {
                const isSelected = dist.id === activeDistrict.id;
                return (
                  <TouchableOpacity
                    key={dist.id}
                    style={[
                      styles.districtTab,
                      isSelected && styles.districtTabActive,
                    ]}
                    onPress={() => setSelectedDistrictId(dist.id)}
                  >
                    <Ionicons
                      name="location"
                      size={14}
                      color={isSelected ? "#FFF" : THEME_PRIMARY}
                    />
                    <Text
                      style={[
                        styles.districtTabText,
                        isSelected && styles.districtTabTextActive,
                      ]}
                    >
                      {dist.region}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <View style={styles.districtDetailCard}>
              <View style={styles.districtHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.districtTitle}>
                    {activeDistrict.titleBn} ({activeDistrict.district})
                  </Text>
                  <Text style={styles.giTagBadge}>
                    {activeDistrict.heritageBadge}
                  </Text>
                </View>
                <View style={styles.artisanCountBadge}>
                  <Text style={styles.artisanCountText}>
                    {activeDistrict.giCodes[0]}
                  </Text>
                </View>
              </View>

              <Text style={styles.heritageStory}>
                {activeDistrict.storyBn}
              </Text>

              <Text style={styles.specialtyTitle}>প্রধান বৈশিষ্ট্য ও পণ্য:</Text>
              <View style={styles.specialtyChips}>
                {activeDistrict.signatureCrafts.map((spec, i) => (
                  <View key={i} style={styles.specialtyChip}>
                    <Ionicons name="checkmark-sharp" size={12} color={THEME_PRIMARY} />
                    <Text style={styles.specialtyChipText}>{spec}</Text>
                  </View>
                ))}
              </View>
            </View>

            <TouchableOpacity style={styles.dismissBtn} onPress={onClose}>
              <Text style={styles.dismissBtnText}>ফিরে যান</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.6)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    height: "90%",
    paddingBottom: 24,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  title: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0F172A",
  },
  subtitle: {
    fontSize: 11,
    color: "#64748B",
    marginTop: 2,
  },
  closeBtn: {
    padding: 4,
  },
  scroll: {
    padding: 16,
  },
  verifierCard: {
    backgroundColor: "#F8FAFC",
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginBottom: 16,
  },
  verifierLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#334155",
    marginBottom: 8,
  },
  inputRow: {
    flexDirection: "row",
    gap: 8,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 42,
    fontSize: 13,
    backgroundColor: "#FFF",
    fontWeight: "600",
  },
  verifyBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: THEME_EMERALD,
    paddingHorizontal: 14,
    borderRadius: 10,
    justifyContent: "center",
  },
  verifyBtnText: {
    color: "#FFF",
    fontSize: 12,
    fontWeight: "700",
  },
  resultCard: {
    marginTop: 12,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  resultAuthentic: {
    backgroundColor: "#ECFDF5",
    borderColor: "#A7F3D0",
  },
  resultInvalid: {
    backgroundColor: "#FEF2F2",
    borderColor: "#FECACA",
  },
  resultHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  resultStatusText: {
    fontSize: 13,
    fontWeight: "700",
  },
  resultMessage: {
    fontSize: 11,
    color: "#334155",
    marginTop: 2,
    lineHeight: 16,
  },
  certMetadata: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#A7F3D0",
    gap: 4,
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  metaKey: {
    fontSize: 11,
    color: "#64748B",
  },
  metaVal: {
    fontSize: 11,
    fontWeight: "700",
    color: "#1E293B",
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#1E293B",
    marginBottom: 8,
  },
  districtsScroll: {
    marginBottom: 12,
  },
  districtTab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "#F1F5F9",
    marginRight: 8,
  },
  districtTabActive: {
    backgroundColor: THEME_PRIMARY,
  },
  districtTabText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#475569",
  },
  districtTabTextActive: {
    color: "#FFF",
    fontWeight: "700",
  },
  districtDetailCard: {
    backgroundColor: "#FFFBEB",
    borderWidth: 1,
    borderColor: "#FDE68A",
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
  },
  districtHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 8,
  },
  districtTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: THEME_PRIMARY,
  },
  giTagBadge: {
    fontSize: 11,
    color: THEME_ACCENT,
    fontWeight: "700",
    marginTop: 2,
  },
  artisanCountBadge: {
    backgroundColor: "#FEF3C7",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  artisanCountText: {
    fontSize: 10,
    fontWeight: "700",
    color: THEME_PRIMARY,
  },
  heritageStory: {
    fontSize: 12,
    color: "#475569",
    lineHeight: 18,
    marginBottom: 10,
  },
  specialtyTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: "#1E293B",
    marginBottom: 6,
  },
  specialtyChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  specialtyChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#FFF",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  specialtyChipText: {
    fontSize: 10,
    color: "#334155",
    fontWeight: "600",
  },
  dismissBtn: {
    backgroundColor: "#334155",
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
    marginBottom: 20,
  },
  dismissBtnText: {
    color: "#FFF",
    fontSize: 13,
    fontWeight: "700",
  },
});

import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  Image,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useMarketplaceStore } from "../store/marketplaceStore";
import { BargainOfferRecord } from "../types";
import { getBargainPresetOptions } from "../engines/bargainEngine";

const THEME_PRIMARY = "#78350F";
const THEME_ACCENT = "#D97706";
const THEME_EMERALD = "#059669";
const THEME_RED = "#DC2626";

export const BargainModal: React.FC = () => {
  const bargainingProductId = useMarketplaceStore((s) => s.bargainingProductId);
  const closeBargainModal = useMarketplaceStore((s) => s.closeBargainModal);
  const products = useMarketplaceStore((s) => s.products);
  const activeBargains = useMarketplaceStore((s) => s.activeBargains);
  const submitBargainOffer = useMarketplaceStore((s) => s.submitBargainOffer);
  const acceptCounterOffer = useMarketplaceStore((s) => s.acceptCounterOffer);

  const product = products.find((p) => p.id === bargainingProductId);
  const existingBargain: BargainOfferRecord | undefined = bargainingProductId
    ? activeBargains[bargainingProductId]
    : undefined;

  const [offerPrice, setOfferPrice] = useState<string>("");
  const [quantity, setQuantity] = useState<number>(1);
  const [buyerNote, setBuyerNote] = useState<string>("");
  const [lastSubmitted, setLastSubmitted] = useState<BargainOfferRecord | null>(
    null
  );

  if (!bargainingProductId || !product) {
    return null;
  }

  const presetOptions = getBargainPresetOptions(product, quantity);

  const handleSubmit = () => {
    const priceNum = parseInt(offerPrice, 10);
    if (isNaN(priceNum) || priceNum <= 0) return;

    const record = submitBargainOffer(
      product.id,
      priceNum,
      quantity,
      buyerNote.trim() ? buyerNote.trim() : undefined
    );
    setLastSubmitted(record);
  };

  const handleAcceptCounter = () => {
    acceptCounterOffer(product.id);
    closeBargainModal();
  };

  const activeRecord = lastSubmitted || existingBargain;
  const isAccepted =
    activeRecord?.status === "accepted" ||
    activeRecord?.status === "auto_accepted";
  const isCountered = activeRecord?.status === "countered";
  const isRejected = activeRecord?.status === "rejected";

  return (
    <Modal
      visible={Boolean(bargainingProductId)}
      animationType="slide"
      transparent
      onRequestClose={closeBargainModal}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.overlay}
      >
        <View style={styles.sheet}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.titleRow}>
              <MaterialCommunityIcons
                name="handshake-outline"
                size={22}
                color={THEME_ACCENT}
              />
              <Text style={styles.title}>সরাসরি কারিগরের সাথে দরদাম</Text>
            </View>
            <TouchableOpacity
              onPress={closeBargainModal}
              style={styles.closeBtn}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="close" size={20} color="#64748B" />
            </TouchableOpacity>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scroll}
          >
            {/* Product Summary */}
            <View style={styles.productSummary}>
              <Image source={{ uri: product.image_url }} style={styles.thumb} />
              <View style={styles.productInfo}>
                <Text style={styles.banglaName} numberOfLines={1}>
                  {product.bangla_name}
                </Text>
                <Text style={styles.sellerName} numberOfLines={1}>
                  কারিগর: {product.artisan?.name || product.seller_name}
                </Text>
                <View style={styles.priceRow}>
                  <Text style={styles.listPriceLabel}>তালিকা মূল্য:</Text>
                  <Text style={styles.listPriceValue}>৳{product.price}</Text>
                </View>
              </View>
            </View>

            {/* Evaluation Result */}
            {activeRecord ? (
              <View
                style={[
                  styles.resultBox,
                  isAccepted && styles.resultAccepted,
                  isCountered && styles.resultCounter,
                  isRejected && styles.resultRejected,
                ]}
              >
                <View style={styles.resultHeader}>
                  <Ionicons
                    name={
                      isAccepted
                        ? "checkmark-circle"
                        : isCountered
                        ? "git-compare-outline"
                        : "close-circle"
                    }
                    size={22}
                    color={
                      isAccepted
                        ? THEME_EMERALD
                        : isCountered
                        ? THEME_ACCENT
                        : THEME_RED
                    }
                  />
                  <Text style={styles.resultTitle}>
                    {isAccepted
                      ? "আলহামদুলিল্লাহ! অফার গৃহীত হয়েছে"
                      : isCountered
                      ? "উস্তাদের পাল্টা অফার (Counter Offer)"
                      : "অফারটি গ্রহণ করা সম্ভব হয়নি"}
                  </Text>
                </View>

                <Text style={styles.resultMessage}>
                  {activeRecord.sellerResponse}
                </Text>

                {isCountered && activeRecord.counterUnitPriceBdt && (
                  <View style={styles.counterBox}>
                    <Text style={styles.counterLabel}>
                      কারিগর নির্ধারিত বিশেষ মূল্য:
                    </Text>
                    <Text style={styles.counterPrice}>
                      ৳{activeRecord.counterUnitPriceBdt}
                    </Text>
                    <TouchableOpacity
                      style={styles.acceptCounterBtn}
                      onPress={handleAcceptCounter}
                    >
                      <Ionicons name="cart" size={16} color="#FFF" />
                      <Text style={styles.acceptCounterBtnText}>
                        এই মূল্যে গ্রহণ করুন ও কার্টে যোগ করুন
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}

                {isAccepted && (
                  <TouchableOpacity
                    style={styles.doneBtn}
                    onPress={closeBargainModal}
                  >
                    <Text style={styles.doneBtnText}>কার্ট দেখুন</Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : null}

            {/* Offer Form */}
            <Text style={styles.sectionLabel}>
              আপনার প্রস্তাবিত মূল্য (প্রতি পিস টাকা):
            </Text>
            <View style={styles.inputContainer}>
              <Text style={styles.inputPrefix}>৳</Text>
              <TextInput
                style={styles.input}
                placeholder={`উদা: ${Math.round(product.price * 0.9)}`}
                keyboardType="numeric"
                value={offerPrice}
                onChangeText={setOfferPrice}
                placeholderTextColor="#94A3B8"
              />
            </View>

            {/* Quick Discount Suggestion Chips */}
            <View style={styles.chipsRow}>
              {presetOptions.map((opt) => (
                <TouchableOpacity
                  key={opt.id}
                  style={styles.chip}
                  onPress={() => setOfferPrice(opt.unitPriceBdt.toString())}
                >
                  <Text style={styles.chipText}>{opt.labelBn}</Text>
                  <Text style={styles.chipPrice}>(৳{opt.unitPriceBdt})</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Quantity Stepper */}
            <View style={styles.stepperRow}>
              <Text style={styles.stepperLabel}>অর্ডার পরিমাণ (পিস/ইউনিট):</Text>
              <View style={styles.stepper}>
                <TouchableOpacity
                  style={styles.stepBtn}
                  onPress={() => setQuantity((q) => Math.max(1, q - 1))}
                >
                  <Ionicons name="remove" size={16} color="#475569" />
                </TouchableOpacity>
                <Text style={styles.stepQty}>{quantity}</Text>
                <TouchableOpacity
                  style={styles.stepBtn}
                  onPress={() => setQuantity((q) => q + 1)}
                >
                  <Ionicons name="add" size={16} color="#475569" />
                </TouchableOpacity>
              </View>
            </View>

            {/* Optional Note */}
            <Text style={styles.sectionLabel}>কারিগরকে বার্তা (ঐচ্ছিক):</Text>
            <TextInput
              style={styles.noteInput}
              placeholder="যেমন: একসাথে একাধিক নিব বা উপহারের জন্য..."
              value={buyerNote}
              onChangeText={setBuyerNote}
              placeholderTextColor="#94A3B8"
              multiline
            />

            {/* Submit CTA */}
            <TouchableOpacity
              style={[
                styles.submitBtn,
                !offerPrice && styles.submitBtnDisabled,
              ]}
              onPress={handleSubmit}
              disabled={!offerPrice}
            >
              <Ionicons name="paper-plane" size={16} color="#FFF" />
              <Text style={styles.submitBtnText}>অফার জমা দিন</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
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
    maxHeight: "85%",
    paddingBottom: Platform.OS === "ios" ? 34 : 20,
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
    gap: 8,
  },
  title: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0F172A",
  },
  closeBtn: {
    padding: 4,
  },
  scroll: {
    padding: 16,
  },
  productSummary: {
    flexDirection: "row",
    backgroundColor: "#F8FAFC",
    padding: 10,
    borderRadius: 12,
    gap: 12,
    marginBottom: 16,
  },
  thumb: {
    width: 60,
    height: 60,
    borderRadius: 8,
    backgroundColor: "#E2E8F0",
  },
  productInfo: {
    flex: 1,
    justifyContent: "center",
  },
  banglaName: {
    fontSize: 13,
    fontWeight: "700",
    color: "#1E293B",
  },
  sellerName: {
    fontSize: 11,
    color: "#64748B",
    marginTop: 2,
  },
  priceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 4,
  },
  listPriceLabel: {
    fontSize: 11,
    color: "#94A3B8",
  },
  listPriceValue: {
    fontSize: 13,
    fontWeight: "800",
    color: THEME_PRIMARY,
  },
  resultBox: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
  },
  resultAccepted: {
    backgroundColor: "#ECFDF5",
    borderColor: "#A7F3D0",
  },
  resultCounter: {
    backgroundColor: "#FFFBEB",
    borderColor: "#FDE68A",
  },
  resultRejected: {
    backgroundColor: "#FEF2F2",
    borderColor: "#FECACA",
  },
  resultHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 6,
  },
  resultTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0F172A",
  },
  resultMessage: {
    fontSize: 12,
    color: "#334155",
    lineHeight: 18,
  },
  counterBox: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#FDE68A",
    alignItems: "center",
  },
  counterLabel: {
    fontSize: 12,
    color: "#78350F",
  },
  counterPrice: {
    fontSize: 22,
    fontWeight: "800",
    color: THEME_ACCENT,
    marginVertical: 4,
  },
  acceptCounterBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: THEME_ACCENT,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    marginTop: 6,
    width: "100%",
    justifyContent: "center",
  },
  acceptCounterBtnText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
  doneBtn: {
    backgroundColor: THEME_EMERALD,
    paddingVertical: 10,
    borderRadius: 10,
    marginTop: 10,
    alignItems: "center",
  },
  doneBtnText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#334155",
    marginBottom: 8,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: "#CBD5E1",
    borderRadius: 10,
    paddingHorizontal: 12,
    backgroundColor: "#FFFFFF",
    marginBottom: 10,
  },
  inputPrefix: {
    fontSize: 18,
    fontWeight: "700",
    color: THEME_PRIMARY,
    marginRight: 6,
  },
  input: {
    flex: 1,
    height: 46,
    fontSize: 16,
    fontWeight: "700",
    color: "#0F172A",
  },
  chipsRow: {
    flexDirection: "row",
    gap: 6,
    marginBottom: 16,
  },
  chip: {
    flex: 1,
    backgroundColor: "#F1F5F9",
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: 8,
    alignItems: "center",
  },
  chipText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#334155",
    textAlign: "center",
  },
  chipPrice: {
    fontSize: 10,
    color: "#64748B",
    marginTop: 2,
  },
  stepperRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  stepperLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#334155",
  },
  stepper: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 8,
  },
  stepBtn: {
    width: 34,
    height: 34,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
  },
  stepQty: {
    width: 36,
    textAlign: "center",
    fontSize: 14,
    fontWeight: "700",
    color: "#0F172A",
  },
  noteInput: {
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 10,
    padding: 10,
    fontSize: 13,
    color: "#0F172A",
    minHeight: 60,
    textAlignVertical: "top",
    marginBottom: 16,
  },
  submitBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: THEME_PRIMARY,
    paddingVertical: 14,
    borderRadius: 12,
  },
  submitBtnDisabled: {
    opacity: 0.5,
  },
  submitBtnText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
});

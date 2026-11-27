import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Image,
  Alert,
} from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useMarketplaceStore } from "../store/marketplaceStore";
import { NewProductListing } from "../types";

interface SellerStudioModalProps {
  visible: boolean;
  onClose: () => void;
}

const THEME_PRIMARY = "#78350F";
const THEME_ACCENT = "#D97706";
const THEME_EMERALD = "#059669";

export const SellerStudioModal: React.FC<SellerStudioModalProps> = ({
  visible,
  onClose,
}) => {
  const sellerProfile = useMarketplaceStore((s) => s.sellerProfile);
  const sellerListings = useMarketplaceStore((s) => s.sellerListings);
  const sellerOrders = useMarketplaceStore((s) => s.sellerOrders);

  const toggleListingStock = useMarketplaceStore((s) => s.toggleListingStock);
  const markSellerOrderPacked = useMarketplaceStore(
    (s) => s.markSellerOrderPacked
  );
  const revealSellerPickupOtp = useMarketplaceStore(
    (s) => s.revealSellerPickupOtp
  );
  const requestSellerPayout = useMarketplaceStore((s) => s.requestSellerPayout);
  const createListing = useMarketplaceStore((s) => s.createListing);

  const [activeTab, setActiveTab] = useState<
    "listings" | "orders" | "earnings" | "create"
  >("listings");
  const [revealedOtps, setRevealedOtps] = useState<Record<string, string>>({});
  const [payoutInput, setPayoutInput] = useState("");
  const [payoutMessage, setPayoutMessage] = useState<string | null>(null);

  const [newName, setNewName] = useState("");
  const [newBanglaName, setNewBanglaName] = useState("");
  const [newPrice, setNewPrice] = useState("");
  const [newUnit, setNewUnit] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newGiCode, setNewGiCode] = useState("");

  const handleRevealOtp = (orderId: string) => {
    const otp = revealSellerPickupOtp(orderId);
    setRevealedOtps((prev) => ({ ...prev, [orderId]: otp }));
  };

  const handlePayoutSubmit = () => {
    const amt = parseInt(payoutInput, 10);
    if (isNaN(amt) || amt <= 0) return;
    const res = requestSellerPayout(amt);
    setPayoutMessage(res.message);
    if (res.success) {
      setPayoutInput("");
    }
  };

  const handleCreateListing = () => {
    if (!newName.trim() || !newBanglaName.trim() || !newPrice.trim()) {
      Alert.alert(
        "তথ্য অসম্পূর্ণ",
        "অনুগ্রহ করে পণ্যের নাম ও মূল্য পূরণ করুন।"
      );
      return;
    }

    const listing: NewProductListing = {
      name: newName.trim(),
      bangla_name: newBanglaName.trim(),
      region: sellerProfile.region,
      district: sellerProfile.district,
      category: "handicraft",
      price: parseInt(newPrice, 10) || 500,
      weight_or_unit: newUnit.trim() || "১ পিস",
      description: newDesc.trim() || "ঐতিহ্যবাহী বাংলাদেশি হস্তশিল্প।",
      gi_code: newGiCode.trim() ? newGiCode.trim() : undefined,
      seller_id: sellerProfile.id,
      seller_name: sellerProfile.banglaName,
      seller_phone: sellerProfile.contactPhone,
      stock_quantity: 15,
    };

    createListing(listing);
    Alert.alert("সফল!", "নতুন পণ্য সফলভাবে স্টুডিওতে তালিকাভুক্ত হয়েছে।");
    setNewName("");
    setNewBanglaName("");
    setNewPrice("");
    setNewUnit("");
    setNewDesc("");
    setNewGiCode("");
    setActiveTab("listings");
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View style={styles.titleRow}>
              <MaterialCommunityIcons
                name="storefront-outline"
                size={24}
                color={THEME_PRIMARY}
              />
              <View>
                <Text style={styles.title}>কারিগর সেলার স্টুডিও (Seller Hub)</Text>
                <Text style={styles.subtitle}>
                  {sellerProfile.banglaName} • {sellerProfile.cooperativeGuild}
                </Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={20} color="#64748B" />
            </TouchableOpacity>
          </View>

          <View style={styles.subTabs}>
            <TouchableOpacity
              style={[styles.subTab, activeTab === "listings" && styles.subTabActive]}
              onPress={() => setActiveTab("listings")}
            >
              <Text
                style={[
                  styles.subTabText,
                  activeTab === "listings" && styles.subTabTextActive,
                ]}
              >
                পণ্য ({sellerListings.length})
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.subTab, activeTab === "orders" && styles.subTabActive]}
              onPress={() => setActiveTab("orders")}
            >
              <Text
                style={[
                  styles.subTabText,
                  activeTab === "orders" && styles.subTabTextActive,
                ]}
              >
                অর্ডার ({sellerOrders.length})
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.subTab, activeTab === "earnings" && styles.subTabActive]}
              onPress={() => setActiveTab("earnings")}
            >
              <Text
                style={[
                  styles.subTabText,
                  activeTab === "earnings" && styles.subTabTextActive,
                ]}
              >
                তহবিল ও পেআউট
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.subTab, activeTab === "create" && styles.subTabActive]}
              onPress={() => setActiveTab("create")}
            >
              <Text
                style={[
                  styles.subTabText,
                  activeTab === "create" && styles.subTabTextActive,
                ]}
              >
                + নতুন তালিকা
              </Text>
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
            {activeTab === "listings" && (
              <View>
                {sellerListings.map((prod) => (
                  <View key={prod.id} style={styles.listingCard}>
                    <Image source={{ uri: prod.image_url }} style={styles.listingThumb} />
                    <View style={styles.listingInfo}>
                      <Text style={styles.listingName} numberOfLines={1}>
                        {prod.bangla_name}
                      </Text>
                      <Text style={styles.listingPrice}>
                        মূল্য: ৳{prod.price} • স্টক: {prod.stock_quantity}
                      </Text>
                      <View style={styles.stockStatusRow}>
                        <View
                          style={[
                            styles.stockDot,
                            { backgroundColor: prod.in_stock ? THEME_EMERALD : "#DC2626" },
                          ]}
                        />
                        <Text style={styles.stockStatusText}>
                          {prod.in_stock ? "লাইভ বিক্রিতে আছে" : "স্টক শেষ"}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.listingActions}>
                      <TouchableOpacity
                        style={[
                          styles.toggleStockBtn,
                          prod.in_stock && styles.toggleStockBtnActive,
                        ]}
                        onPress={() => toggleListingStock(prod.id)}
                      >
                        <Text style={styles.toggleStockBtnText}>
                          {prod.in_stock ? "বন্ধ করুন" : "চালু করুন"}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {activeTab === "orders" && (
              <View>
                {sellerOrders.length === 0 ? (
                  <Text style={styles.emptyText}>কোনো নতুন অর্ডার পাওয়া যায়নি।</Text>
                ) : (
                  sellerOrders.map((ord) => {
                    const otp = revealedOtps[ord.id];
                    const sellerPayoutTotal = ord.vendorSplits.reduce(
                      (sum, s) => sum + s.sellerPayoutBdt,
                      0
                    );
                    const leadItem = ord.items[0];
                    return (
                      <View key={ord.id} style={styles.orderCard}>
                        <View style={styles.orderCardHeader}>
                          <Text style={styles.orderNumber}>{ord.orderReference}</Text>
                          <View style={styles.statusPill}>
                            <Text style={styles.statusPillText}>
                              {ord.status === "ready_for_pickup"
                                ? "রাইডার পিকআপের অপেক্ষায়"
                                : "অর্ডার নিশ্চিত"}
                            </Text>
                          </View>
                        </View>

                        <Text style={styles.orderProdTitle}>
                          {leadItem?.banglaProductName || leadItem?.productName || "অর্ডার আইটেম"}
                        </Text>
                        <Text style={styles.orderCustomer}>
                          ক্রেতা: {ord.customerName} ({ord.customerPhone})
                        </Text>
                        <Text style={styles.orderAddress}>{ord.deliveryAddress}</Text>

                        <View style={styles.orderTotalRow}>
                          <Text style={styles.payoutShareText}>
                            আপনার প্রাপ্য অংশ: ৳{sellerPayoutTotal} (মোট: ৳{ord.totalBdt})
                          </Text>
                        </View>

                        <View style={styles.orderActionsRow}>
                          {ord.status !== "ready_for_pickup" && (
                            <TouchableOpacity
                              style={styles.packBtn}
                              onPress={() => markSellerOrderPacked(ord.id)}
                            >
                              <Ionicons name="cube-outline" size={14} color="#FFF" />
                              <Text style={styles.packBtnText}>প্যাকেজিং সম্পন্ন করুন</Text>
                            </TouchableOpacity>
                          )}

                          <TouchableOpacity
                            style={styles.otpBtn}
                            onPress={() => handleRevealOtp(ord.id)}
                          >
                            <Ionicons name="key-outline" size={14} color={THEME_PRIMARY} />
                            <Text style={styles.otpBtnText}>
                              {otp ? `পিকআপ OTP: ${otp}` : "রাইডার পিকআপ OTP দেখুন"}
                            </Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    );
                  })
                )}
              </View>
            )}

            {activeTab === "earnings" && (
              <View>
                <View style={styles.balanceCard}>
                  <Text style={styles.balanceLabel}>উত্তোলনযোগ্য ব্যালেন্স:</Text>
                  <Text style={styles.balanceVal}>
                    ৳{sellerProfile.availableBalanceBdt}
                  </Text>
                  <Text style={styles.pendingVal}>
                    এসক্রো সংরক্ষিত: ৳{sellerProfile.escrowBalanceBdt}
                  </Text>
                </View>

                <View style={styles.payoutForm}>
                  <Text style={styles.payoutTitle}>
                    {sellerProfile.payoutAccountMasked} একাউন্টে উত্তোলন:
                  </Text>
                  <TextInput
                    style={styles.payoutInput}
                    placeholder="টাকার পরিমাণ লিখুন (উদা: ৫০০০)"
                    value={payoutInput}
                    onChangeText={setPayoutInput}
                    keyboardType="numeric"
                    placeholderTextColor="#94A3B8"
                  />
                  <TouchableOpacity
                    style={styles.payoutBtn}
                    onPress={handlePayoutSubmit}
                  >
                    <Ionicons name="wallet-outline" size={16} color="#FFF" />
                    <Text style={styles.payoutBtnText}>উত্তোলন অনুরোধ পাঠান</Text>
                  </TouchableOpacity>
                  {payoutMessage && (
                    <Text style={styles.payoutMsgText}>{payoutMessage}</Text>
                  )}
                </View>
              </View>
            )}

            {activeTab === "create" && (
              <View style={styles.createForm}>
                <Text style={styles.formLabel}>পণ্যের বাংলা নাম:</Text>
                <TextInput
                  style={styles.formInput}
                  placeholder="যেমন: ঐতিহ্যবাহী জামদানি শাড়ি"
                  value={newBanglaName}
                  onChangeText={setNewBanglaName}
                  placeholderTextColor="#94A3B8"
                />

                <Text style={styles.formLabel}>ইংরেজি নাম (English Name):</Text>
                <TextInput
                  style={styles.formInput}
                  placeholder="e.g. Traditional Jamdani Handloom Saree"
                  value={newName}
                  onChangeText={setNewName}
                  placeholderTextColor="#94A3B8"
                />

                <Text style={styles.formLabel}>বিক্রয় মূল্য (টাকা):</Text>
                <TextInput
                  style={styles.formInput}
                  placeholder="উদা: ৩৫০০"
                  value={newPrice}
                  onChangeText={setNewPrice}
                  keyboardType="numeric"
                  placeholderTextColor="#94A3B8"
                />

                <Text style={styles.formLabel}>একক বা ওজন (Unit):</Text>
                <TextInput
                  style={styles.formInput}
                  placeholder="উদা: ১ কেজি জার অথবা ১২ হাত শাড়ি"
                  value={newUnit}
                  onChangeText={setNewUnit}
                  placeholderTextColor="#94A3B8"
                />

                <Text style={styles.formLabel}>জিআই সনদ কোড (যদি থাকে):</Text>
                <TextInput
                  style={styles.formInput}
                  placeholder="উদা: SJ-GI-01"
                  value={newGiCode}
                  onChangeText={setNewGiCode}
                  placeholderTextColor="#94A3B8"
                />

                <Text style={styles.formLabel}>পণ্যের বর্ণনা ও বৈশিষ্ট্য:</Text>
                <TextInput
                  style={[styles.formInput, { minHeight: 70, textAlignVertical: "top" }]}
                  placeholder="কারিগরির ইতিহাস ও উপকরণ..."
                  value={newDesc}
                  onChangeText={setNewDesc}
                  multiline
                  placeholderTextColor="#94A3B8"
                />

                <TouchableOpacity
                  style={styles.submitListingBtn}
                  onPress={handleCreateListing}
                >
                  <Ionicons name="cloud-upload-outline" size={16} color="#FFF" />
                  <Text style={styles.submitListingBtnText}>পণ্যটি প্রকাশ করুন</Text>
                </TouchableOpacity>
              </View>
            )}
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
  subTabs: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
    backgroundColor: "#F8FAFC",
  },
  subTab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
  },
  subTabActive: {
    borderBottomWidth: 2,
    borderBottomColor: THEME_PRIMARY,
  },
  subTabText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#64748B",
  },
  subTabTextActive: {
    color: THEME_PRIMARY,
    fontWeight: "700",
  },
  scroll: {
    padding: 16,
  },
  listingCard: {
    flexDirection: "row",
    backgroundColor: "#F8FAFC",
    padding: 10,
    borderRadius: 12,
    marginBottom: 10,
    gap: 10,
    alignItems: "center",
  },
  listingThumb: {
    width: 50,
    height: 50,
    borderRadius: 8,
  },
  listingInfo: {
    flex: 1,
  },
  listingName: {
    fontSize: 12,
    fontWeight: "700",
    color: "#1E293B",
  },
  listingPrice: {
    fontSize: 11,
    color: "#64748B",
    marginTop: 2,
  },
  stockStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 4,
  },
  stockDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  stockStatusText: {
    fontSize: 10,
    color: "#475569",
  },
  listingActions: {
    justifyContent: "center",
  },
  toggleStockBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: "#E2E8F0",
  },
  toggleStockBtnActive: {
    backgroundColor: "#FEF3C7",
  },
  toggleStockBtnText: {
    fontSize: 10,
    fontWeight: "700",
    color: THEME_PRIMARY,
  },
  orderCard: {
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  orderCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  orderNumber: {
    fontSize: 12,
    fontWeight: "800",
    color: THEME_PRIMARY,
  },
  statusPill: {
    backgroundColor: "#FEF3C7",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  statusPillText: {
    fontSize: 10,
    fontWeight: "700",
    color: THEME_ACCENT,
  },
  orderProdTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#1E293B",
  },
  orderCustomer: {
    fontSize: 11,
    color: "#475569",
    marginTop: 2,
  },
  orderAddress: {
    fontSize: 11,
    color: "#64748B",
    marginTop: 2,
  },
  orderTotalRow: {
    marginVertical: 6,
  },
  payoutShareText: {
    fontSize: 11,
    fontWeight: "700",
    color: THEME_EMERALD,
  },
  orderActionsRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 6,
  },
  packBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: THEME_PRIMARY,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  packBtnText: {
    color: "#FFF",
    fontSize: 10,
    fontWeight: "700",
  },
  otpBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#FEF3C7",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#FDE68A",
  },
  otpBtnText: {
    color: THEME_PRIMARY,
    fontSize: 10,
    fontWeight: "700",
  },
  balanceCard: {
    backgroundColor: "#FFFBEB",
    borderWidth: 1,
    borderColor: "#FDE68A",
    borderRadius: 14,
    padding: 16,
    alignItems: "center",
    marginBottom: 16,
  },
  balanceLabel: {
    fontSize: 12,
    color: "#78350F",
  },
  balanceVal: {
    fontSize: 28,
    fontWeight: "800",
    color: THEME_PRIMARY,
    marginVertical: 4,
  },
  pendingVal: {
    fontSize: 11,
    color: "#B45309",
  },
  payoutForm: {
    backgroundColor: "#F8FAFC",
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  payoutTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#1E293B",
    marginBottom: 8,
  },
  payoutInput: {
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 42,
    backgroundColor: "#FFF",
    fontSize: 14,
    marginBottom: 10,
  },
  payoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: THEME_EMERALD,
    paddingVertical: 10,
    borderRadius: 8,
  },
  payoutBtnText: {
    color: "#FFF",
    fontSize: 13,
    fontWeight: "700",
  },
  payoutMsgText: {
    fontSize: 11,
    color: THEME_EMERALD,
    marginTop: 8,
    fontWeight: "600",
  },
  createForm: {
    gap: 6,
  },
  formLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#334155",
    marginTop: 6,
  },
  formInput: {
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 8,
    paddingHorizontal: 10,
    height: 40,
    backgroundColor: "#FFF",
    fontSize: 13,
  },
  submitListingBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: THEME_PRIMARY,
    paddingVertical: 12,
    borderRadius: 10,
    marginTop: 16,
    marginBottom: 20,
  },
  submitListingBtnText: {
    color: "#FFF",
    fontSize: 13,
    fontWeight: "700",
  },
  emptyText: {
    fontSize: 12,
    color: "#94A3B8",
    textAlign: "center",
    marginVertical: 20,
  },
});

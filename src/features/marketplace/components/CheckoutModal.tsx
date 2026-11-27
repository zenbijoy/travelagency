import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
} from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useMarketplaceStore } from "../store/marketplaceStore";
import { DISTRICT_COORDINATES } from "../constants/catalog";
import { MarketplaceOrderRecord, MarketplacePaymentMethod } from "../types";

interface CheckoutModalProps {
  visible: boolean;
  onClose: () => void;
  onOrderSuccess: (order: MarketplaceOrderRecord) => void;
}

const THEME_PRIMARY = "#78350F";
const THEME_EMERALD = "#059669";

const DISTRICT_LIST = Object.keys(DISTRICT_COORDINATES).slice(0, 12);

export const CheckoutModal: React.FC<CheckoutModalProps> = ({
  visible,
  onClose,
  onOrderSuccess,
}) => {
  const pricingQuote = useMarketplaceStore((s) => s.pricingQuote);
  const deliveryTier = useMarketplaceStore((s) => s.deliveryTier);
  const placeCartOrder = useMarketplaceStore((s) => s.placeCartOrder);

  const [name, setName] = useState("Tanvir Ahmed");
  const [phone, setPhone] = useState("+8801712345678");
  const [address, setAddress] = useState("House 45, Road 7, Dhanmondi, Dhaka");
  const [district, setDistrict] = useState("Dhaka");
  const [hotelName, setHotelName] = useState("");
  const [hotelRoomNumber, setHotelRoomNumber] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<MarketplacePaymentMethod>("bkash");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handlePlaceOrder = () => {
    if (!name.trim() || !phone.trim() || !address.trim()) {
      Alert.alert(
        "তথ্য প্রয়োজন",
        "অনুগ্রহ করে নাম, ফোন নম্বর এবং সম্পূর্ণ ঠিকানা প্রদান করুন।"
      );
      return;
    }

    if (
      deliveryTier === "hotel_concierge" &&
      (!hotelName.trim() || !hotelRoomNumber.trim())
    ) {
      Alert.alert(
        "হোটেল তথ্য প্রয়োজন",
        "হোটেল কনসিয়ার্জ ড্রপ-অফের জন্য হোটেলের নাম ও রুম নম্বর লিখুন।"
      );
      return;
    }

    try {
      setIsSubmitting(true);
      const newOrder = placeCartOrder({
        recipientName: name.trim(),
        recipientPhone: phone.trim(),
        deliveryAddress: address.trim(),
        deliveryDistrict: district,
        paymentMethod,
        hotelName: hotelName.trim() || undefined,
        hotelRoomNumber: hotelRoomNumber.trim() || undefined,
      });

      setIsSubmitting(false);
      onOrderSuccess(newOrder);
    } catch (err: any) {
      setIsSubmitting(false);
      Alert.alert(
        "অর্ডার ব্যর্থ হয়েছে",
        err.message || "দয়া করে পুনরায় চেষ্টা করুন।"
      );
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View style={styles.titleRow}>
              <Ionicons name="shield-checkmark" size={22} color={THEME_EMERALD} />
              <Text style={styles.title}>নিরাপদ চেকআউট ও ডেলিভারি ডিসপ্যাচ</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={20} color="#64748B" />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
            <Text style={styles.sectionTitle}>প্রাপকের তথ্য:</Text>
            <Text style={styles.inputLabel}>পূর্ণ নাম:</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="আপনার নাম"
              placeholderTextColor="#94A3B8"
            />

            <Text style={styles.inputLabel}>যোগাযোগ ও ওটিপি নম্বর (মোবাইল):</Text>
            <TextInput
              style={styles.input}
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              placeholder="+8801XXXXXXXXX"
              placeholderTextColor="#94A3B8"
            />

            <Text style={styles.inputLabel}>ডেলিভারি জেলা:</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.districtsRow}>
              {DISTRICT_LIST.map((d) => (
                <TouchableOpacity
                  key={d}
                  style={[styles.districtChip, district === d && styles.districtChipActive]}
                  onPress={() => setDistrict(d)}
                >
                  <Text
                    style={[
                      styles.districtChipText,
                      district === d && styles.districtChipTextActive,
                    ]}
                  >
                    {d}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {deliveryTier === "hotel_concierge" && (
              <View style={styles.hotelFieldsBox}>
                <Text style={styles.inputLabel}>হোটেলের নাম:</Text>
                <TextInput
                  style={styles.input}
                  value={hotelName}
                  onChangeText={setHotelName}
                  placeholder="উদা: Sayeman Beach Resort"
                  placeholderTextColor="#94A3B8"
                />
                <Text style={styles.inputLabel}>রুম নম্বর:</Text>
                <TextInput
                  style={styles.input}
                  value={hotelRoomNumber}
                  onChangeText={setHotelRoomNumber}
                  placeholder="উদা: 405"
                  placeholderTextColor="#94A3B8"
                />
              </View>
            )}

            <Text style={styles.inputLabel}>সম্পূর্ণ ঠিকানা (বাসা/এলাকা):</Text>
            <TextInput
              style={[styles.input, styles.addressInput]}
              value={address}
              onChangeText={setAddress}
              placeholder="ফ্ল্যাট, বাড়ি নম্বর, রোড, এলাকা..."
              multiline
              placeholderTextColor="#94A3B8"
            />

            <Text style={styles.sectionTitle}>পেমেন্ট মেথড নির্বাচন করুন:</Text>
            <View style={styles.paymentMethodsGrid}>
              {[
                { id: "bkash", label: "bKash (বিকাশ)", icon: "cash-fast" },
                { id: "nagad", label: "Nagad (নগদ)", icon: "cellphone-message" },
                { id: "card", label: "কার্ড / নেট ব্যাংকিং", icon: "credit-card" },
                { id: "cod", label: "ক্যাশ অন ডেলিভারি (COD)", icon: "cash" },
              ].map((m) => {
                const isSelected = paymentMethod === m.id;
                return (
                  <TouchableOpacity
                    key={m.id}
                    style={[
                      styles.paymentMethodCard,
                      isSelected && styles.paymentMethodCardActive,
                    ]}
                    onPress={() =>
                      setPaymentMethod(m.id as MarketplacePaymentMethod)
                    }
                  >
                    <MaterialCommunityIcons
                      name={m.icon as any}
                      size={20}
                      color={isSelected ? THEME_PRIMARY : "#64748B"}
                    />
                    <Text
                      style={[
                        styles.paymentMethodLabel,
                        isSelected && styles.paymentMethodLabelActive,
                      ]}
                    >
                      {m.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.summaryBox}>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>ডেলিভারি ধরন:</Text>
                <Text style={styles.summaryVal}>
                  {deliveryTier === "shopno_express"
                    ? "ShopnoExpress সেম-ডে রাইডার"
                    : deliveryTier === "hotel_concierge"
                    ? "হোটেল রুম কনসিয়ার্জ ড্রপ-অফ"
                    : "আন্তঃজেলা কুরিয়ার"}
                </Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>মোট প্রদেয় টাকা:</Text>
                <Text style={styles.summaryTotalVal}>
                  ৳{pricingQuote.totalPayableBdt}
                </Text>
              </View>
            </View>

            <TouchableOpacity
              style={styles.confirmBtn}
              onPress={handlePlaceOrder}
              disabled={isSubmitting}
            >
              <Ionicons name="bag-check" size={18} color="#FFF" />
              <Text style={styles.confirmBtnText}>
                {isSubmitting
                  ? "অর্ডার প্রক্রিয়াধীন..."
                  : `অর্ডার নিশ্চিত করুন (৳${pricingQuote.totalPayableBdt})`}
              </Text>
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
  sectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#1E293B",
    marginBottom: 8,
    marginTop: 6,
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "#475569",
    marginTop: 6,
    marginBottom: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 42,
    backgroundColor: "#FFF",
    fontSize: 13,
    color: "#0F172A",
  },
  addressInput: {
    minHeight: 60,
    textAlignVertical: "top",
    paddingTop: 8,
  },
  hotelFieldsBox: {
    backgroundColor: "#FFFBEB",
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#FDE68A",
    marginVertical: 6,
  },
  districtsRow: {
    flexDirection: "row",
    marginBottom: 6,
  },
  districtChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: "#F1F5F9",
    marginRight: 6,
  },
  districtChipActive: {
    backgroundColor: THEME_PRIMARY,
  },
  districtChipText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#475569",
  },
  districtChipTextActive: {
    color: "#FFF",
    fontWeight: "700",
  },
  paymentMethodsGrid: {
    gap: 8,
    marginBottom: 16,
  },
  paymentMethodCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 10,
    padding: 12,
    backgroundColor: "#F8FAFC",
  },
  paymentMethodCardActive: {
    borderColor: THEME_PRIMARY,
    backgroundColor: "#FFFBEB",
  },
  paymentMethodLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#334155",
  },
  paymentMethodLabelActive: {
    color: THEME_PRIMARY,
    fontWeight: "700",
  },
  summaryBox: {
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
    gap: 6,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  summaryLabel: {
    fontSize: 12,
    color: "#64748B",
  },
  summaryVal: {
    fontSize: 12,
    fontWeight: "600",
    color: "#1E293B",
  },
  summaryTotalVal: {
    fontSize: 16,
    fontWeight: "800",
    color: THEME_PRIMARY,
  },
  confirmBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: THEME_PRIMARY,
    paddingVertical: 14,
    borderRadius: 12,
    marginBottom: 20,
  },
  confirmBtnText: {
    color: "#FFF",
    fontSize: 14,
    fontWeight: "700",
  },
});

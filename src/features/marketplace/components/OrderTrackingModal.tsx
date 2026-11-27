import React from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  Image,
} from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useMarketplaceStore } from "../store/marketplaceStore";

interface OrderTrackingModalProps {
  visible: boolean;
  onClose: () => void;
}

const THEME_PRIMARY = "#78350F";
const THEME_ACCENT = "#D97706";
const THEME_EMERALD = "#059669";

export const OrderTrackingModal: React.FC<OrderTrackingModalProps> = ({
  visible,
  onClose,
}) => {
  const trackingOrderId = useMarketplaceStore((s) => s.trackingOrderId);
  const orders = useMarketplaceStore((s) => s.orders);

  const activeOrder = orders.find((o) => o.id === trackingOrderId) || orders[0];

  if (!activeOrder) return null;

  const leadJob = activeOrder.deliveryJobs[0];
  const leadItem = activeOrder.items[0];
  const deliveryOtp = leadJob?.deliveryOtp || "451290";
  const totalQuantity = activeOrder.items.reduce(
    (sum, item) => sum + item.quantity,
    0
  );

  const timelineSteps = [
    {
      title: "অর্ডার নিশ্চিত ও এসক্রো রিজার্ভ",
      desc: "কারিগর ও প্ল্যাটফর্ম এসক্রো তহবিলে অর্থ সংরক্ষিত হয়েছে।",
      completed: true,
      icon: "checkmark-circle",
    },
    {
      title: "কারিগর প্যাকেজিং সম্পন্ন করছেন",
      desc: "আঞ্চলিক খাঁটি উপহার মোড়ক ও ভ্যাকুয়াম প্যাক প্রস্তুত।",
      completed: true,
      icon: "cube",
    },
    {
      title: "ShopnoExpress রাইডার ডিসপ্যাচ",
      desc: "রাইডার পিকআপ পয়েন্টে এসে পণ্য গ্রহণ করবেন।",
      completed: true,
      icon: "bicycle",
    },
    {
      title: "রাইডার ডেলিভারির পথে (In-Transit)",
      desc: "আপনার দেওয়া ঠিকানা বা হোটেল রুমের উদ্দেশ্যে রওনা দিয়েছেন।",
      completed: false,
      icon: "navigate-circle",
    },
    {
      title: "ডেলিভারি ওটিপি যাচাই ও সমর্পণ",
      desc: "সিক্রেট ওটিপি মিলিয়ে পার্সেল হস্তান্তর করা হবে।",
      completed: false,
      icon: "gift",
    },
  ];

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View style={styles.titleRow}>
              <MaterialCommunityIcons name="moped" size={24} color={THEME_ACCENT} />
              <View>
                <Text style={styles.title}>লাইভ রাইডার ডেলিভারি ট্র্যাকিং</Text>
                <Text style={styles.orderIdText}>
                  অর্ডার নম্বর: {activeOrder.orderReference}
                </Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={20} color="#64748B" />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
            <View style={styles.otpBanner}>
              <View style={styles.otpHeader}>
                <Ionicons name="key" size={20} color={THEME_EMERALD} />
                <Text style={styles.otpTitle}>আপনার ডেলিভারি গ্রহণ OTP কোড</Text>
              </View>
              <Text style={styles.otpCode}>{deliveryOtp}</Text>
              <Text style={styles.otpHelp}>
                রাইডার যখন আপনার ঠিকানায় পৌঁছাবেন, তখন পার্সেল বুঝে নেওয়ার সময় এই ৬ ডিজিটের কোডটি প্রদান করুন।
              </Text>
            </View>

            <View style={styles.riderCard}>
              <View style={styles.riderAvatar}>
                <Ionicons name="person" size={24} color={THEME_PRIMARY} />
              </View>
              <View style={styles.riderInfo}>
                <Text style={styles.riderName}>
                  {leadJob?.riderName || "রাকিব হাসান (ShopnoExpress Rider)"}
                </Text>
                <Text style={styles.riderVehicle}>
                  যানবাহন: {leadJob?.riderVehicle || "হোন্ডা ড্রিম ১১০সিসি"} • জব রেফ: {leadJob?.jobReference || "SJ-DEL"}
                </Text>
                <Text style={styles.riderRating}>
                  রেটিং: ★ ৪.৯ (১২০+ সফল ডেলিভারি)
                </Text>
              </View>
              <TouchableOpacity style={styles.callBtn}>
                <Ionicons name="call" size={18} color="#FFF" />
              </TouchableOpacity>
            </View>

            {leadItem && (
              <View style={styles.productCard}>
                <Image
                  source={{ uri: leadItem.productImage }}
                  style={styles.productThumb}
                />
                <View style={styles.productInfo}>
                  <Text style={styles.productTitle} numberOfLines={1}>
                    {leadItem.banglaProductName || leadItem.productName}
                    {activeOrder.items.length > 1
                      ? ` + আরও ${activeOrder.items.length - 1}টি`
                      : ""}
                  </Text>
                  <Text style={styles.productMeta}>
                    পরিমাণ: {totalQuantity} টি • মোট প্রদেয়: ৳{activeOrder.totalBdt}
                  </Text>
                  <Text style={styles.destinationText} numberOfLines={2}>
                    গন্তব্য: {activeOrder.deliveryAddress}
                  </Text>
                </View>
              </View>
            )}

            <Text style={styles.timelineHeader}>ডেলিভারি টাইমলাইন ও স্ট্যাটাস:</Text>
            <View style={styles.timelineList}>
              {timelineSteps.map((step, index) => (
                <View key={index} style={styles.timelineRow}>
                  <View style={styles.timelineCol}>
                    <View
                      style={[
                        styles.timelineDot,
                        step.completed && styles.timelineDotCompleted,
                      ]}
                    >
                      <Ionicons
                        name={step.icon as any}
                        size={12}
                        color={step.completed ? "#FFF" : "#94A3B8"}
                      />
                    </View>
                    {index < timelineSteps.length - 1 && (
                      <View
                        style={[
                          styles.timelineLine,
                          step.completed && styles.timelineLineCompleted,
                        ]}
                      />
                    )}
                  </View>
                  <View style={styles.timelineContent}>
                    <Text
                      style={[
                        styles.stepTitle,
                        step.completed && styles.stepTitleCompleted,
                      ]}
                    >
                      {step.title}
                    </Text>
                    <Text style={styles.stepDesc}>{step.desc}</Text>
                  </View>
                </View>
              ))}
            </View>

            <TouchableOpacity style={styles.closeModalBtn} onPress={onClose}>
              <Text style={styles.closeModalBtnText}>বন্ধ করুন</Text>
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
  orderIdText: {
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
  otpBanner: {
    backgroundColor: "#ECFDF5",
    borderWidth: 1,
    borderColor: "#A7F3D0",
    borderRadius: 14,
    padding: 14,
    alignItems: "center",
    marginBottom: 16,
  },
  otpHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  otpTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: "#065F46",
  },
  otpCode: {
    fontSize: 32,
    fontWeight: "900",
    color: THEME_EMERALD,
    letterSpacing: 6,
    marginVertical: 6,
  },
  otpHelp: {
    fontSize: 11,
    color: "#047857",
    textAlign: "center",
    lineHeight: 16,
  },
  riderCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
    gap: 10,
  },
  riderAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#FEF3C7",
    justifyContent: "center",
    alignItems: "center",
  },
  riderInfo: {
    flex: 1,
  },
  riderName: {
    fontSize: 12,
    fontWeight: "700",
    color: "#1E293B",
  },
  riderVehicle: {
    fontSize: 10,
    color: "#64748B",
    marginTop: 2,
  },
  riderRating: {
    fontSize: 10,
    color: THEME_ACCENT,
    fontWeight: "600",
    marginTop: 2,
  },
  callBtn: {
    backgroundColor: THEME_EMERALD,
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
  },
  productCard: {
    flexDirection: "row",
    backgroundColor: "#F8FAFC",
    padding: 10,
    borderRadius: 10,
    gap: 10,
    marginBottom: 16,
  },
  productThumb: {
    width: 50,
    height: 50,
    borderRadius: 8,
  },
  productInfo: {
    flex: 1,
    justifyContent: "center",
  },
  productTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: "#1E293B",
  },
  productMeta: {
    fontSize: 11,
    color: THEME_PRIMARY,
    fontWeight: "600",
    marginTop: 2,
  },
  destinationText: {
    fontSize: 10,
    color: "#64748B",
    marginTop: 2,
  },
  timelineHeader: {
    fontSize: 13,
    fontWeight: "700",
    color: "#1E293B",
    marginBottom: 10,
  },
  timelineList: {
    marginBottom: 16,
  },
  timelineRow: {
    flexDirection: "row",
    gap: 12,
  },
  timelineCol: {
    alignItems: "center",
  },
  timelineDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#E2E8F0",
    justifyContent: "center",
    alignItems: "center",
  },
  timelineDotCompleted: {
    backgroundColor: THEME_PRIMARY,
  },
  timelineLine: {
    width: 2,
    flex: 1,
    backgroundColor: "#E2E8F0",
    marginVertical: 2,
  },
  timelineLineCompleted: {
    backgroundColor: THEME_PRIMARY,
  },
  timelineContent: {
    flex: 1,
    paddingBottom: 16,
  },
  stepTitle: {
    fontSize: 12,
    fontWeight: "600",
    color: "#64748B",
  },
  stepTitleCompleted: {
    color: "#0F172A",
    fontWeight: "700",
  },
  stepDesc: {
    fontSize: 10,
    color: "#94A3B8",
    marginTop: 2,
    lineHeight: 14,
  },
  closeModalBtn: {
    backgroundColor: "#334155",
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
    marginBottom: 20,
  },
  closeModalBtnText: {
    color: "#FFF",
    fontSize: 13,
    fontWeight: "700",
  },
});

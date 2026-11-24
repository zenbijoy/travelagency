import React from "react";
import { View, Text, StyleSheet, ScrollView, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";

interface Props {
  visible: boolean;
  onClose: () => void;
  tripTitle?: string;
  destination?: string;
  dates?: string;
}

export const InCallItinerarySheet: React.FC<Props> = ({
  visible,
  onClose,
  tripTitle = "সাজেক ভ্যালি ও খাগড়াছড়ি এক্সপ্লোরার",
  destination = "সাজেক, বান্দরবান ও খাগড়াছড়ি",
  dates = "৩ রাত, ৪ দিন",
}) => {
  if (!visible) return null;

  const itineraryDays = [
    {
      day: 1,
      title: "দীঘিনালা থেকে সাজেক হেলিপ্যাড যাত্রা",
      time: "সকাল ০৮:৩০",
      items: ["চাঁদের গাড়ি এন্ট্রি ও এসকর্ট পাস", "রুইলুই পাড়া কটেজ চেক-ইন", "সানসেট ভিউ - কংলাক পাহাড়"],
    },
    {
      day: 2,
      title: "কংলাক চূড়া ট্রেকিং ও মেঘের রাজ্যে সকাল",
      time: "ভোর ০৫:৪৫",
      items: ["সূর্যোদয় উপভোগ", "স্থানীয় আদিবাসী ব্রেকফাস্ট", "আলুটিলা গুহা ও রিসাং ঝর্ণা"],
    },
    {
      day: 3,
      title: "খাগড়াছড়ি শহর ও ঝুলন্ত সেতু ভ্রমণ",
      time: "সকাল ০৯:০০",
      items: ["জেলা পরিষদ পার্ক", "ঐতিহ্যবাহী পাহাড়ি মধ্যাহ্নভোজ", "ঢাকা ফেরার নৈশ বাস"],
    },
  ];

  return (
    <View style={styles.sheetOverlay}>
      <View style={styles.sheetContent}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerTitleBox}>
            <Ionicons name="map" size={18} color="#38BDF8" />
            <Text style={styles.headerTitle} numberOfLines={1}>
              {tripTitle}
            </Text>
          </View>
          <Pressable style={styles.closeBtn} onPress={onClose} hitSlop={8}>
            <Ionicons name="close" size={20} color="#94A3B8" />
          </Pressable>
        </View>

        {/* Subheader info */}
        <View style={styles.metaRow}>
          <View style={styles.metaItem}>
            <Ionicons name="location-outline" size={12} color="#94A3B8" />
            <Text style={styles.metaText}>{destination}</Text>
          </View>
          <View style={styles.metaItem}>
            <Ionicons name="calendar-outline" size={12} color="#94A3B8" />
            <Text style={styles.metaText}>{dates}</Text>
          </View>
        </View>

        {/* Days List */}
        <ScrollView style={styles.scrollArea} showsVerticalScrollIndicator={false}>
          {itineraryDays.map((d) => (
            <View key={d.day} style={styles.dayCard}>
              <View style={styles.dayHeader}>
                <View style={styles.dayPill}>
                  <Text style={styles.dayPillText}>দিন {d.day}</Text>
                </View>
                <Text style={styles.dayTime}>{d.time}</Text>
              </View>
              <Text style={styles.dayTitleText}>{d.title}</Text>
              <View style={styles.itemsList}>
                {d.items.map((item, idx) => (
                  <View key={idx} style={styles.itineraryBulletRow}>
                    <Ionicons name="checkmark-circle-outline" size={14} color="#10B981" />
                    <Text style={styles.itineraryBulletText}>{item}</Text>
                  </View>
                ))}
              </View>
            </View>
          ))}
        </ScrollView>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  sheetOverlay: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 120,
    maxHeight: 380,
    backgroundColor: "rgba(15, 23, 42, 0.96)",
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: "rgba(56, 189, 248, 0.4)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 16,
    zIndex: 100,
  },
  sheetContent: {
    padding: 16,
    maxHeight: 380,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  headerTitleBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  headerTitle: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(51, 65, 85, 0.6)",
    alignItems: "center",
    justifyContent: "center",
  },
  metaRow: {
    flexDirection: "row",
    gap: 16,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.1)",
    marginBottom: 10,
  },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  metaText: {
    color: "#94A3B8",
    fontSize: 11,
    fontWeight: "500",
  },
  scrollArea: {
    maxHeight: 260,
  },
  dayCard: {
    backgroundColor: "rgba(30, 41, 59, 0.7)",
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
  },
  dayHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  dayPill: {
    backgroundColor: "rgba(56, 189, 248, 0.2)",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  dayPillText: {
    color: "#38BDF8",
    fontSize: 10,
    fontWeight: "800",
  },
  dayTime: {
    color: "#94A3B8",
    fontSize: 10,
    fontWeight: "600",
  },
  dayTitleText: {
    color: "#F8FAFC",
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 6,
  },
  itemsList: {
    gap: 4,
  },
  itineraryBulletRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  itineraryBulletText: {
    color: "#CBD5E1",
    fontSize: 11,
    flex: 1,
  },
});

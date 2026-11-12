import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";

import { useTheme } from "../../theme";
import { useLanguage } from "../../context/LanguageContext";
import { useResponsive } from "../../hooks/useResponsive";

export interface DesktopBookingWidgetProps {
  initialDestination?: string;
  onSearch?: (destination: string) => void;
}

export const DesktopBookingWidget: React.FC<DesktopBookingWidgetProps> = ({
  initialDestination = "",
  onSearch,
}) => {
  const { isDesktop } = useResponsive();
  const { theme, isDark } = useTheme();
  const { isBengali } = useLanguage();

  const [destination, setDestination] = useState(initialDestination);
  const [selectedDates, setSelectedDates] = useState(
    isBengali ? "১৫ নভে – ১৮ নভে (৩ রাত)" : "Nov 15 – Nov 18 (3 nights)"
  );
  const [guestsText, setGuestsText] = useState(
    isBengali ? "২ জন প্রাপ্তবয়স্ক, ১ রুম" : "2 Adults, 1 Room"
  );
  const [activeTab, setActiveTab] = useState<"stays" | "flights" | "bus">("stays");

  // Only render on desktop / laptop viewports
  if (!isDesktop) {
    return null;
  }

  const handleExecute = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (onSearch) {
      onSearch(destination);
    } else {
      router.push({
        pathname: activeTab === "stays" ? "/screens/search-stays" : activeTab === "flights" ? "/screens/flights" : "/screens/bus-launch",
        params: { q: destination },
      } as any);
    }
  };

  return (
    <View style={styles.widgetWrapper}>
      {/* Category Tabs: Stays | Flights | Bus */}
      <View style={styles.tabsRow}>
        <Pressable
          style={[styles.tabBtn, activeTab === "stays" && styles.tabBtnActive]}
          onPress={() => setActiveTab("stays")}
        >
          <Ionicons
            name="bed-outline"
            size={16}
            color={activeTab === "stays" ? "#FFFFFF" : "rgba(255, 255, 255, 0.75)"}
            style={{ marginRight: 6 }}
          />
          <Text style={[styles.tabBtnText, activeTab === "stays" && styles.tabBtnTextActive]}>
            {isBengali ? "হোটেল ও রিসোর্ট" : "Hotels & Stays"}
          </Text>
        </Pressable>

        <Pressable
          style={[styles.tabBtn, activeTab === "flights" && styles.tabBtnActive]}
          onPress={() => setActiveTab("flights")}
        >
          <Ionicons
            name="airplane-outline"
            size={16}
            color={activeTab === "flights" ? "#FFFFFF" : "rgba(255, 255, 255, 0.75)"}
            style={{ marginRight: 6 }}
          />
          <Text style={[styles.tabBtnText, activeTab === "flights" && styles.tabBtnTextActive]}>
            {isBengali ? "ফ্লাইট" : "Flights"}
          </Text>
        </Pressable>

        <Pressable
          style={[styles.tabBtn, activeTab === "bus" && styles.tabBtnActive]}
          onPress={() => setActiveTab("bus")}
        >
          <Ionicons
            name="boat-outline"
            size={16}
            color={activeTab === "bus" ? "#FFFFFF" : "rgba(255, 255, 255, 0.75)"}
            style={{ marginRight: 6 }}
          />
          <Text style={[styles.tabBtnText, activeTab === "bus" && styles.tabBtnTextActive]}>
            {isBengali ? "বাস ও লঞ্চ" : "Bus & Launch"}
          </Text>
        </Pressable>
      </View>

      {/* Main Horizontal Booking Engine Bar */}
      <View
        style={[
          styles.bookingBarCard,
          {
            backgroundColor: isDark ? "#121A2D" : "#FFFFFF",
            borderColor: isDark ? "rgba(255, 255, 255, 0.12)" : "rgba(0, 0, 0, 0.08)",
          },
        ]}
      >
        {/* Segment 1: Where to? */}
        <View style={styles.segment}>
          <View style={styles.segmentIconCircle}>
            <Ionicons name="location" size={17} color="#0055F2" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.segmentLabel, { color: isDark ? "#94A3B8" : "#64748B" }]}>
              {isBengali ? "কোথায় যাবেন?" : "Where to?"}
            </Text>
            <TextInput
              style={[styles.segmentInput, { color: isDark ? "#FFFFFF" : "#0F172A" }]}
              placeholder={isBengali ? "কক্সবাজার, সাজেক, সিলেট..." : "Cox's Bazar, Sajek, Sylhet..."}
              placeholderTextColor={isDark ? "#64748B" : "#94A3B8"}
              value={destination}
              onChangeText={setDestination}
              onSubmitEditing={handleExecute}
            />
          </View>
        </View>

        <View style={[styles.segmentDivider, { backgroundColor: isDark ? "rgba(255,255,255,0.1)" : "#E2E8F0" }]} />

        {/* Segment 2: Check-in / Check-out */}
        <Pressable style={styles.segment} onPress={handleExecute}>
          <View style={styles.segmentIconCircle}>
            <Ionicons name="calendar" size={17} color="#E5A93C" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.segmentLabel, { color: isDark ? "#94A3B8" : "#64748B" }]}>
              {isBengali ? "তারিখ (চেক-ইন – চেক-আউট)" : "Check-in – Check-out"}
            </Text>
            <Text style={[styles.segmentValueText, { color: isDark ? "#FFFFFF" : "#0F172A" }]}>
              {selectedDates}
            </Text>
          </View>
        </Pressable>

        <View style={[styles.segmentDivider, { backgroundColor: isDark ? "rgba(255,255,255,0.1)" : "#E2E8F0" }]} />

        {/* Segment 3: Guests & Rooms */}
        <Pressable style={styles.segment} onPress={handleExecute}>
          <View style={styles.segmentIconCircle}>
            <Ionicons name="people" size={17} color="#10B981" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.segmentLabel, { color: isDark ? "#94A3B8" : "#64748B" }]}>
              {isBengali ? "অতিথি ও রুম সংখ্যা" : "Guests & Rooms"}
            </Text>
            <Text style={[styles.segmentValueText, { color: isDark ? "#FFFFFF" : "#0F172A" }]}>
              {guestsText}
            </Text>
          </View>
        </Pressable>

        {/* Segment 4: CTA Button */}
        <Pressable style={styles.searchButton} onPress={handleExecute}>
          <Ionicons name="search" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
          <Text style={styles.searchButtonText}>
            {isBengali ? "খুঁজুন" : "Search"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  widgetWrapper: {
    width: "100%",
    maxWidth: 1040,
    alignSelf: "center",
    marginTop: 22,
    zIndex: 40,
  },
  tabsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
    paddingHorizontal: 8,
  },
  tabBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: "rgba(0, 0, 0, 0.3)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.15)",
  },
  tabBtnActive: {
    backgroundColor: "rgba(0, 85, 242, 0.85)",
    borderColor: "#60A5FA",
  },
  tabBtnText: {
    fontSize: 12,
    fontWeight: "600",
    color: "rgba(255, 255, 255, 0.75)",
  },
  tabBtnTextActive: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
  bookingBarCard: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 24,
    borderWidth: 1,
    paddingVertical: 8,
    paddingLeft: 18,
    paddingRight: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 8,
  },
  segment: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  segmentIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(0, 85, 242, 0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  segmentLabel: {
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  segmentInput: {
    fontSize: 14,
    fontWeight: "700",
    marginTop: 2,
    padding: 0,
    height: 22,
  },
  segmentValueText: {
    fontSize: 13,
    fontWeight: "700",
    marginTop: 2,
  },
  segmentDivider: {
    width: 1,
    height: 38,
    marginHorizontal: 4,
  },
  searchButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0055F2",
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 18,
    shadowColor: "#0055F2",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 4,
    marginLeft: 6,
  },
  searchButtonText: {
    fontSize: 15,
    fontWeight: "800",
    color: "#FFFFFF",
    letterSpacing: 0.3,
  },
});

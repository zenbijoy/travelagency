import React from "react";
import { View, Text, StyleSheet, Pressable, Platform } from "react-native";
import { Ionicons, FontAwesome5, MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";

import { useTheme } from "../../theme";
import { useLanguage } from "../../context/LanguageContext";
import { useResponsive } from "../../hooks/useResponsive";

export const WebFooter: React.FC = () => {
  const { isDesktop } = useResponsive();
  const { theme, isDark } = useTheme();
  const { isBengali } = useLanguage();

  // Only render on desktop / laptop viewports
  if (!isDesktop) {
    return null;
  }

  const navigateTo = (route: string) => {
    router.push(route as any);
  };

  return (
    <View
      style={[
        styles.footerWrapper,
        {
          backgroundColor: isDark ? "#070B14" : "#0F172A",
          borderTopColor: isDark ? "rgba(255, 255, 255, 0.08)" : "rgba(255, 255, 255, 0.1)",
        },
      ]}
    >
      <View style={styles.footerContainer}>
        {/* TOP ROW: Brand and 4 Columns */}
        <View style={styles.topColumnsGrid}>
          {/* Col 1: Brand & About */}
          <View style={styles.brandCol}>
            <View style={styles.brandTitleRow}>
              <View style={styles.brandIconCircle}>
                <Ionicons name="paper-plane" size={16} color="#0055F2" style={{ transform: [{ rotate: "-20deg" }] }} />
              </View>
              <Text style={styles.brandName}>ShopnoJatra</Text>
            </View>
            <Text style={styles.brandTagline}>
              {isBengali
                ? "বাংলাদেশের শীর্ষস্থানীয় স্মার্ট ট্রাভেল ও ট্যুরিজম ইকোসিস্টেম। নিরাপদ যাত্রা, আরামদায়ক হোটেল এবং অনন্য ভ্রমণ অভিজ্ঞতা।"
                : "Bangladesh's premier AI-powered smart travel ecosystem. Seamless bookings, verified stays, and memorable journeys."}
            </Text>

            <View style={styles.supportBadge}>
              <Ionicons name="headset" size={16} color="#E5A93C" />
              <View>
                <Text style={styles.supportLabel}>{isBengali ? "২৪/৭ কাস্টমার সাপোর্ট" : "24/7 Helpline"}</Text>
                <Text style={styles.supportPhone}>+880 9612-746766</Text>
              </View>
            </View>
          </View>

          {/* Col 2: Services */}
          <View style={styles.linksCol}>
            <Text style={styles.colHeading}>{isBengali ? "আমাদের সেবাসমূহ" : "Services"}</Text>
            <Pressable onPress={() => navigateTo("/screens/search-stays")} style={styles.linkItem}>
              <Text style={styles.linkText}>{isBengali ? "হোটেল ও রিসোর্ট" : "Hotels & Stays"}</Text>
            </Pressable>
            <Pressable onPress={() => navigateTo("/screens/flights")} style={styles.linkItem}>
              <Text style={styles.linkText}>{isBengali ? "ফ্লাইট টিকিট" : "Flight Booking"}</Text>
            </Pressable>
            <Pressable onPress={() => navigateTo("/screens/bus-launch")} style={styles.linkItem}>
              <Text style={styles.linkText}>{isBengali ? "বাস ও লঞ্চ" : "Bus & Launch"}</Text>
            </Pressable>
            <Pressable onPress={() => navigateTo("/screens/tour-guides")} style={styles.linkItem}>
              <Text style={styles.linkText}>{isBengali ? "ট্যুর গাইড" : "Tour Guides"}</Text>
            </Pressable>
            <Pressable onPress={() => navigateTo("/screens/travel-match")} style={styles.linkItem}>
              <Text style={styles.linkText}>{isBengali ? "ট্রাভেল বাডি ম্যাচ" : "Travel Buddy Match"}</Text>
            </Pressable>
          </View>

          {/* Col 3: Popular Destinations */}
          <View style={styles.linksCol}>
            <Text style={styles.colHeading}>{isBengali ? "জনপ্রিয় গন্তব্য" : "Top Destinations"}</Text>
            <Pressable onPress={() => navigateTo("/screens/search?q=CoxsBazar")} style={styles.linkItem}>
              <Text style={styles.linkText}>{isBengali ? "কক্সবাজার সৈকত" : "Cox's Bazar Beach"}</Text>
            </Pressable>
            <Pressable onPress={() => navigateTo("/screens/search?q=Sajek")} style={styles.linkItem}>
              <Text style={styles.linkText}>{isBengali ? "সাজেক ভ্যালি" : "Sajek Valley"}</Text>
            </Pressable>
            <Pressable onPress={() => navigateTo("/screens/search?q=Sreemangal")} style={styles.linkItem}>
              <Text style={styles.linkText}>{isBengali ? "শ্রীমঙ্গল চা বাগান" : "Sreemangal Tea Gardens"}</Text>
            </Pressable>
            <Pressable onPress={() => navigateTo("/screens/search?q=Sundarbans")} style={styles.linkItem}>
              <Text style={styles.linkText}>{isBengali ? "সুন্দরবন ম্যানগ্রোভ" : "Sundarbans Eco Tour"}</Text>
            </Pressable>
            <Pressable onPress={() => navigateTo("/screens/search?q=SaintMartin")} style={styles.linkItem}>
              <Text style={styles.linkText}>{isBengali ? "সেন্ট মার্টিন দ্বীপ" : "Saint Martin's Island"}</Text>
            </Pressable>
          </View>

          {/* Col 4: Corporate & Community */}
          <View style={styles.linksCol}>
            <Text style={styles.colHeading}>{isBengali ? "কর্পোরেট ও এজেন্সি" : "Company & Agency"}</Text>
            <Pressable onPress={() => navigateTo("/agency")} style={styles.linkItem}>
              <Text style={styles.linkText}>{isBengali ? "B2B এজেন্সি পোর্টাল" : "B2B Agency Portal"}</Text>
            </Pressable>
            <Pressable onPress={() => navigateTo("/(tabs)/community")} style={styles.linkItem}>
              <Text style={styles.linkText}>{isBengali ? "ট্রাভেলার কমিউনিটি" : "Traveler Community"}</Text>
            </Pressable>
            <Pressable onPress={() => navigateTo("/screens/customer-support")} style={styles.linkItem}>
              <Text style={styles.linkText}>{isBengali ? "সহায়তা কেন্দ্র" : "Support Center"}</Text>
            </Pressable>
            <Pressable onPress={() => navigateTo("/screens/emergency")} style={styles.linkItem}>
              <Text style={[styles.linkText, { color: "#F87171" }]}>
                {isBengali ? "জরুরি হেল্পলাইন" : "Emergency SOS"}
              </Text>
            </Pressable>
          </View>
        </View>

        {/* MIDDLE ROW: Payment & Security Trust Badges */}
        <View style={styles.trustRow}>
          <Text style={styles.trustHeading}>
            {isBengali ? "নিরাপদ পেমেন্ট পার্টনারস:" : "Authorized & Secured Payment Partners:"}
          </Text>
          <View style={styles.paymentBadgesRow}>
            <View style={styles.badgePill}><Text style={styles.badgePillText}>bKash</Text></View>
            <View style={styles.badgePill}><Text style={styles.badgePillText}>Nagad</Text></View>
            <View style={styles.badgePill}><Text style={styles.badgePillText}>Upay</Text></View>
            <View style={styles.badgePill}><Text style={styles.badgePillText}>Visa</Text></View>
            <View style={styles.badgePill}><Text style={styles.badgePillText}>Mastercard</Text></View>
            <View style={styles.badgePill}><Text style={styles.badgePillText}>SSLCommerz</Text></View>
          </View>
        </View>

        {/* BOTTOM ROW: Copyright & Disclaimers */}
        <View style={styles.bottomBar}>
          <Text style={styles.copyrightText}>
            © {new Date().getFullYear()} ShopnoJatra (স্বপ্নযাত্রা) Technologies Ltd. All rights reserved.
          </Text>
          <View style={styles.legalLinksRow}>
            <Text style={styles.legalLink}>{isBengali ? "গোপনীয়তা নীতি" : "Privacy Policy"}</Text>
            <Text style={styles.legalDot}>•</Text>
            <Text style={styles.legalLink}>{isBengali ? "ব্যবহারের শর্তাবলী" : "Terms of Service"}</Text>
            <Text style={styles.legalDot}>•</Text>
            <Text style={styles.legalLink}>{isBengali ? "রিফান্ড পলিসি" : "Refund Policy"}</Text>
          </View>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  footerWrapper: {
    width: "100%",
    paddingTop: 56,
    paddingBottom: 28,
    borderTopWidth: 1,
    marginTop: 48,
  },
  footerContainer: {
    width: "100%",
    maxWidth: 1360,
    alignSelf: "center",
    paddingHorizontal: 24,
  },
  topColumnsGrid: {
    flexDirection: "row",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 32,
    marginBottom: 40,
  },
  brandCol: {
    flex: 2,
    minWidth: 260,
    maxWidth: 360,
  },
  brandTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 12,
  },
  brandIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#EFF6FF",
    alignItems: "center",
    justifyContent: "center",
  },
  brandName: {
    fontSize: 20,
    fontWeight: "800",
    color: "#FFFFFF",
    letterSpacing: -0.3,
  },
  brandTagline: {
    fontSize: 13,
    color: "#94A3B8",
    lineHeight: 20,
    marginBottom: 18,
  },
  supportBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  supportLabel: {
    fontSize: 11,
    color: "#94A3B8",
  },
  supportPhone: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  linksCol: {
    flex: 1,
    minWidth: 160,
  },
  colHeading: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FFFFFF",
    marginBottom: 16,
    letterSpacing: 0.2,
  },
  linkItem: {
    paddingVertical: 6,
  },
  linkText: {
    fontSize: 13,
    color: "#94A3B8",
    transitionDuration: "150ms",
  } as any,
  trustRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 16,
    paddingVertical: 20,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    marginBottom: 24,
  },
  trustHeading: {
    fontSize: 12,
    fontWeight: "600",
    color: "#94A3B8",
  },
  paymentBadgesRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  badgePill: {
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
  },
  badgePillText: {
    color: "#E2E8F0",
    fontSize: 11,
    fontWeight: "700",
  },
  bottomBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 12,
  },
  copyrightText: {
    fontSize: 12,
    color: "#64748B",
  },
  legalLinksRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  legalLink: {
    fontSize: 12,
    color: "#94A3B8",
  },
  legalDot: {
    color: "#64748B",
    fontSize: 12,
  },
});

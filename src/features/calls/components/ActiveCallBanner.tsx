import React from "react";
import { View, Text, StyleSheet, Pressable, Image } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { useCallStore } from "../store/callStore";
import { callAudioEngine } from "../services/callAudioEngine";

export const ActiveCallBanner: React.FC = () => {
  const insets = useSafeAreaInsets();
  const { activeCall, setMinimized, endCall } = useCallStore();

  if (!activeCall || !activeCall.isMinimized) {
    return null;
  }

  const isConnected = activeCall.status === "connected";
  const isVideo = activeCall.type === "video";

  const formatDuration = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins < 10 ? "0" : ""}${mins}:${secs < 10 ? "0" : ""}${secs}`;
  };

  const handleReturn = () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {}
    setMinimized(false);
    router.push({
      pathname: "/screens/call",
      params: {
        callId: activeCall.callId,
        type: activeCall.type,
      },
    } as any);
  };

  const handleEnd = () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    } catch {}
    callAudioEngine.playDisconnectTone();
    endCall();
  };

  const getRoleBadgeLabel = () => {
    if (activeCall.participant.roleLabelBn) {
      return activeCall.participant.roleLabelBn;
    }
    switch (activeCall.participant.role) {
      case "tour_guide":
        return "ট্যুর গাইড";
      case "hotel_front_desk":
        return "হোটেল রিসেপশন";
      case "travel_agent":
        return "ট্রাভেল এজেন্সি";
      case "emergency_support":
        return "জরুরি সাপোর্ট";
      default:
        return "সহযাত্রী";
    }
  };

  return (
    <View style={[styles.wrapper, { top: Math.max(insets.top, 12) + 6 }]}>
      <Pressable style={styles.pillContainer} onPress={handleReturn}>
        {/* Pulsing Connected Indicator & Avatar */}
        <View style={styles.avatarBox}>
          {activeCall.participant.avatarUrl ? (
            <Image
              source={{ uri: activeCall.participant.avatarUrl }}
              style={styles.avatarImg}
            />
          ) : (
            <View style={styles.avatarFallback}>
              <Text style={styles.avatarInitial}>
                {activeCall.participant.name.slice(0, 1)}
              </Text>
            </View>
          )}
          <View
            style={[
              styles.pulseDot,
              { backgroundColor: isConnected ? "#10B981" : "#F59E0B" },
            ]}
          />
        </View>

        {/* Call Info */}
        <View style={styles.infoCol}>
          <View style={styles.nameRow}>
            <Text style={styles.nameText} numberOfLines={1}>
              {activeCall.participant.name}
            </Text>
            <View style={styles.roleTag}>
              <Text style={styles.roleTagText}>{getRoleBadgeLabel()}</Text>
            </View>
          </View>
          <View style={styles.statusRow}>
            <Ionicons
              name={isVideo ? "videocam" : "call"}
              size={12}
              color={isConnected ? "#34D399" : "#FBBF24"}
            />
            <Text style={styles.durationText}>
              {isConnected
                ? formatDuration(activeCall.durationSeconds)
                : "সংযোগ হচ্ছে..."}
            </Text>
            {activeCall.isMuted && (
              <View style={styles.mutedPill}>
                <Ionicons name="mic-off" size={10} color="#EF4444" />
                <Text style={styles.mutedText}>মিউট</Text>
              </View>
            )}
          </View>
        </View>

        {/* Action Controls */}
        <View style={styles.actionsRow}>
          <Pressable style={styles.hangupBtn} onPress={handleEnd} hitSlop={8}>
            <Ionicons
              name="call"
              size={14}
              color="#FFFFFF"
              style={{ transform: [{ rotate: "135deg" }] }}
            />
          </Pressable>
        </View>
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    position: "absolute",
    left: 16,
    right: 16,
    zIndex: 9999,
    alignItems: "center",
  },
  pillContainer: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    maxWidth: 420,
    backgroundColor: "rgba(15, 23, 42, 0.94)",
    borderRadius: 30,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1.5,
    borderColor: "rgba(56, 189, 248, 0.4)",
    shadowColor: "#0284C7",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 12,
    gap: 10,
  },
  avatarBox: {
    position: "relative",
  },
  avatarImg: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: "#38BDF8",
  },
  avatarFallback: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#0284C7",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitial: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
  pulseDot: {
    position: "absolute",
    bottom: -1,
    right: -1,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: "#0F172A",
  },
  infoCol: {
    flex: 1,
    justifyContent: "center",
    gap: 2,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  nameText: {
    color: "#F8FAFC",
    fontSize: 13,
    fontWeight: "700",
    maxWidth: 140,
  },
  roleTag: {
    backgroundColor: "rgba(56, 189, 248, 0.18)",
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 6,
  },
  roleTagText: {
    color: "#38BDF8",
    fontSize: 9,
    fontWeight: "700",
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  durationText: {
    color: "#94A3B8",
    fontSize: 11,
    fontWeight: "600",
  },
  mutedPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    backgroundColor: "rgba(239, 68, 68, 0.2)",
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
  },
  mutedText: {
    color: "#EF4444",
    fontSize: 9,
    fontWeight: "700",
  },
  actionsRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  hangupBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#EF4444",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#EF4444",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 4,
  },
});

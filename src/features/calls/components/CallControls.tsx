import React from "react";
import { View, StyleSheet, Pressable, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

interface Props {
  isMuted: boolean;
  isVideoEnabled: boolean;
  isSpeakerOn: boolean;
  isFrontCamera: boolean;
  showItineraryButton?: boolean;
  isItineraryOpen?: boolean;
  unreadChatCount?: number;
  onToggleMute: () => void;
  onToggleVideo: () => void;
  onToggleSpeaker: () => void;
  onToggleCameraFacing: () => void;
  onToggleItinerary?: () => void;
  onToggleChat?: () => void;
  onEndCall: () => void;
}

export const CallControls: React.FC<Props> = ({
  isMuted,
  isVideoEnabled,
  isSpeakerOn,
  showItineraryButton = true,
  isItineraryOpen = false,
  unreadChatCount = 0,
  onToggleMute,
  onToggleVideo,
  onToggleSpeaker,
  onToggleCameraFacing,
  onToggleItinerary,
  onToggleChat,
  onEndCall,
}) => {
  const handlePress = (action: () => void, hapticStyle: Haptics.ImpactFeedbackStyle = Haptics.ImpactFeedbackStyle.Light) => {
    try {
      Haptics.impactAsync(hapticStyle);
    } catch {}
    action();
  };

  return (
    <View style={styles.container}>
      {/* Top Secondary Action Bar (Itinerary & Chat) */}
      <View style={styles.secondaryRow}>
        {showItineraryButton && onToggleItinerary && (
          <Pressable
            style={[styles.secondaryButton, isItineraryOpen && styles.secondaryButtonActive]}
            onPress={() => handlePress(onToggleItinerary, Haptics.ImpactFeedbackStyle.Medium)}
          >
            <Ionicons
              name={isItineraryOpen ? "map" : "map-outline"}
              size={18}
              color={isItineraryOpen ? "#38BDF8" : "#E2E8F0"}
            />
            <Text style={[styles.secondaryBtnText, isItineraryOpen && styles.secondaryBtnTextActive]}>
              আইটিনারারি
            </Text>
          </Pressable>
        )}

        {onToggleChat && (
          <Pressable
            style={styles.secondaryButton}
            onPress={() => handlePress(onToggleChat, Haptics.ImpactFeedbackStyle.Light)}
          >
            <Ionicons name="chatbubble-ellipses-outline" size={18} color="#E2E8F0" />
            <Text style={styles.secondaryBtnText}>মেসেজ</Text>
            {unreadChatCount > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{unreadChatCount}</Text>
              </View>
            )}
          </Pressable>
        )}
      </View>

      {/* Primary Floating Action Bar */}
      <View style={styles.primaryBar}>
        {/* Mute Mic */}
        <Pressable
          style={[styles.circleButton, isMuted && styles.circleButtonMuted]}
          onPress={() => handlePress(onToggleMute, Haptics.ImpactFeedbackStyle.Medium)}
        >
          <Ionicons
            name={isMuted ? "mic-off" : "mic"}
            size={22}
            color={isMuted ? "#EF4444" : "#FFFFFF"}
          />
          <Text style={styles.buttonLabel}>{isMuted ? "মিউট" : "মাইক"}</Text>
        </Pressable>

        {/* Video Toggle */}
        <Pressable
          style={[styles.circleButton, !isVideoEnabled && styles.circleButtonInactive]}
          onPress={() => handlePress(onToggleVideo, Haptics.ImpactFeedbackStyle.Medium)}
        >
          <Ionicons
            name={isVideoEnabled ? "videocam" : "videocam-off"}
            size={22}
            color={isVideoEnabled ? "#FFFFFF" : "#94A3B8"}
          />
          <Text style={styles.buttonLabel}>{isVideoEnabled ? "ভিডিও" : "বন্ধ"}</Text>
        </Pressable>

        {/* Camera Flip (Available if video enabled) */}
        {isVideoEnabled && (
          <Pressable
            style={styles.circleButton}
            onPress={() => handlePress(onToggleCameraFacing, Haptics.ImpactFeedbackStyle.Light)}
          >
            <Ionicons name="camera-reverse-outline" size={22} color="#FFFFFF" />
            <Text style={styles.buttonLabel}>ফ্লিপ</Text>
          </Pressable>
        )}

        {/* Speaker / Earpiece Toggle */}
        <Pressable
          style={[styles.circleButton, isSpeakerOn && styles.circleButtonSpeaker]}
          onPress={() => handlePress(onToggleSpeaker, Haptics.ImpactFeedbackStyle.Light)}
        >
          <Ionicons
            name={isSpeakerOn ? "volume-high" : "volume-medium"}
            size={22}
            color={isSpeakerOn ? "#38BDF8" : "#FFFFFF"}
          />
          <Text style={styles.buttonLabel}>{isSpeakerOn ? "স্পিকার" : "ইয়ারপিস"}</Text>
        </Pressable>

        {/* End Call Hangup */}
        <Pressable
          style={styles.hangupButton}
          onPress={() => handlePress(onEndCall, Haptics.ImpactFeedbackStyle.Heavy)}
        >
          <Ionicons
            name="call"
            size={24}
            color="#FFFFFF"
            style={{ transform: [{ rotate: "135deg" }] }}
          />
          <Text style={[styles.buttonLabel, { color: "#FFFFFF" }]}>কাটুন</Text>
        </Pressable>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: "100%",
    paddingHorizontal: 16,
    paddingBottom: 24,
    gap: 12,
  },
  secondaryRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 12,
  },
  secondaryButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(30, 41, 59, 0.85)",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
  },
  secondaryButtonActive: {
    backgroundColor: "rgba(56, 189, 248, 0.2)",
    borderColor: "#38BDF8",
  },
  secondaryBtnText: {
    color: "#E2E8F0",
    fontSize: 12,
    fontWeight: "600",
  },
  secondaryBtnTextActive: {
    color: "#38BDF8",
  },
  badge: {
    backgroundColor: "#EF4444",
    borderRadius: 9,
    paddingHorizontal: 5,
    paddingVertical: 1,
    marginLeft: 2,
  },
  badgeText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "700",
  },
  primaryBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-evenly",
    backgroundColor: "rgba(15, 23, 42, 0.92)",
    borderRadius: 40,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.14)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 10,
  },
  circleButton: {
    alignItems: "center",
    justifyContent: "center",
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "rgba(51, 65, 85, 0.7)",
  },
  circleButtonMuted: {
    backgroundColor: "rgba(239, 68, 68, 0.25)",
    borderWidth: 1.5,
    borderColor: "#EF4444",
  },
  circleButtonInactive: {
    backgroundColor: "rgba(51, 65, 85, 0.35)",
  },
  circleButtonSpeaker: {
    backgroundColor: "rgba(56, 189, 248, 0.2)",
    borderWidth: 1.5,
    borderColor: "#38BDF8",
  },
  hangupButton: {
    alignItems: "center",
    justifyContent: "center",
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#EF4444",
    shadowColor: "#EF4444",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 6,
  },
  buttonLabel: {
    color: "#94A3B8",
    fontSize: 9,
    fontWeight: "600",
    marginTop: 2,
  },
});

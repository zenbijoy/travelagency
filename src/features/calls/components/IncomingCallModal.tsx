import React, { useEffect, useRef, useState } from "react";
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Pressable,
  Image,
  Animated,
  Dimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { useCallStore } from "../store/callStore";
import { callAudioEngine } from "../services/callAudioEngine";
import { QuickDeclineReply } from "../types";

const QUICK_REPLIES: QuickDeclineReply[] = [
  { id: "1", textBn: "পথে আছি, ৫ মিনিটে কল ব্যাক করছি", textEn: "On the way, calling back in 5 mins" },
  { id: "2", textBn: "হোটেল লবিতে পৌঁছে জানাচ্ছি", textEn: "Will reach hotel lobby and notify" },
  { id: "3", textBn: "এখন নেটওয়ার্ক দুর্বল, মেসেজ করুন", textEn: "Network is weak, please text me" },
  { id: "4", textBn: "পরে কথা বলব", textEn: "Will speak later" },
];

export const IncomingCallModal: React.FC = () => {
  const { incomingCall, setIncomingCall, startCall } = useCallStore();
  const [isSilenced, setIsSilenced] = useState(false);
  const [showQuickSheet, setShowQuickSheet] = useState(false);

  // Concentric ring animations
  const ring1 = useRef(new Animated.Value(1)).current;
  const ring2 = useRef(new Animated.Value(1)).current;
  const ring3 = useRef(new Animated.Value(1)).current;
  const buttonPulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!incomingCall) return;

    setIsSilenced(false);
    setShowQuickSheet(false);
    callAudioEngine.startIncomingRingtone();

    // Pulse loops
    const createLoop = (anim: Animated.Value, delay: number, toValue: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(anim, {
            toValue,
            duration: 1700,
            useNativeDriver: true,
          }),
          Animated.timing(anim, {
            toValue: 1,
            duration: 0,
            useNativeDriver: true,
          }),
        ])
      );

    const l1 = createLoop(ring1, 0, 1.5);
    const l2 = createLoop(ring2, 350, 1.85);
    const l3 = createLoop(ring3, 700, 2.2);

    const btnLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(buttonPulse, { toValue: 1.1, duration: 750, useNativeDriver: true }),
        Animated.timing(buttonPulse, { toValue: 1, duration: 750, useNativeDriver: true }),
      ])
    );

    l1.start();
    l2.start();
    l3.start();
    btnLoop.start();

    return () => {
      l1.stop();
      l2.stop();
      l3.stop();
      btnLoop.stop();
      callAudioEngine.stopIncomingRingtone();
    };
  }, [incomingCall]);

  if (!incomingCall) return null;

  const { caller, type, callId } = incomingCall;
  const isVideo = type === "video";

  const handleSilence = () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
    setIsSilenced(true);
    callAudioEngine.stopIncomingRingtone();
  };

  const handleAnswer = () => {
    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {}
    callAudioEngine.stopIncomingRingtone();
    callAudioEngine.playConnectedChime();

    // Start in store and route
    startCall({
      callId,
      role: "callee",
      participant: caller,
      type,
    });
    setIncomingCall(null);

    router.push({
      pathname: "/screens/call",
      params: {
        callId,
        type,
        role: "callee",
      },
    } as any);
  };

  const handleDecline = (reply?: QuickDeclineReply) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    } catch {}
    callAudioEngine.stopIncomingRingtone();
    callAudioEngine.playDisconnectTone();
    setIncomingCall(null);
  };

  const getRoleLabel = () => {
    if (caller.roleLabelBn) return caller.roleLabelBn;
    switch (caller.role) {
      case "tour_guide":
        return "ভেরিফাইড ট্যুর গাইড";
      case "hotel_front_desk":
        return "হোটেল ফ্রন্ট ডেস্ক";
      case "travel_agent":
        return "ট্রাভেল কনসালটেন্ট";
      case "emergency_support":
        return "২৪/৭ জরুরি হেল্পলাইন";
      default:
        return "সহযাত্রী";
    }
  };

  return (
    <Modal visible={!!incomingCall} transparent animationType="fade" statusBarTranslucent>
      <View style={styles.backdrop}>
        {/* Top Info */}
        <View style={styles.topContainer}>
          <View style={styles.callTypePill}>
            <Ionicons
              name={isVideo ? "videocam" : "call"}
              size={14}
              color="#38BDF8"
            />
            <Text style={styles.callTypePillText}>
              ইনকামিং {isVideo ? "ভিডিও" : "অডিও"} কল...
            </Text>
          </View>
        </View>

        {/* Center Concentric Pulse Rings & Caller Avatar */}
        <View style={styles.centerContainer}>
          <View style={styles.avatarWrapper}>
            {/* Pulse Ring 1 */}
            <Animated.View
              style={[
                styles.pulseRing,
                {
                  transform: [{ scale: ring1 }],
                  opacity: ring1.interpolate({
                    inputRange: [1, 1.5],
                    outputRange: [0.6, 0],
                  }),
                },
              ]}
            />
            {/* Pulse Ring 2 */}
            <Animated.View
              style={[
                styles.pulseRing,
                {
                  transform: [{ scale: ring2 }],
                  opacity: ring2.interpolate({
                    inputRange: [1, 1.85],
                    outputRange: [0.4, 0],
                  }),
                },
              ]}
            />
            {/* Pulse Ring 3 */}
            <Animated.View
              style={[
                styles.pulseRing,
                {
                  transform: [{ scale: ring3 }],
                  opacity: ring3.interpolate({
                    inputRange: [1, 2.2],
                    outputRange: [0.25, 0],
                  }),
                },
              ]}
            />

            {caller.avatarUrl ? (
              <Image source={{ uri: caller.avatarUrl }} style={styles.avatarImg} />
            ) : (
              <View style={[styles.avatarImg, styles.avatarFallback]}>
                <Text style={styles.avatarFallbackText}>
                  {caller.name.slice(0, 2).toUpperCase()}
                </Text>
              </View>
            )}

            {caller.verified && (
              <View style={styles.verifiedBadge}>
                <Ionicons name="checkmark-circle" size={20} color="#10B981" />
              </View>
            )}
          </View>

          <Text style={styles.callerName}>{caller.name}</Text>

          <View style={styles.roleBadge}>
            <Ionicons
              name={
                caller.role === "tour_guide"
                  ? "compass"
                  : caller.role === "hotel_front_desk"
                  ? "business"
                  : caller.role === "emergency_support"
                  ? "medical"
                  : "briefcase"
              }
              size={13}
              color="#38BDF8"
            />
            <Text style={styles.roleText}>{getRoleLabel()}</Text>
          </View>

          {caller.location && (
            <View style={styles.locationRow}>
              <Ionicons name="location-sharp" size={13} color="#94A3B8" />
              <Text style={styles.locationText}>{caller.location}</Text>
            </View>
          )}
        </View>

        {/* Quick Message Bottom Sheet or Standard Action Row */}
        {showQuickSheet ? (
          <View style={styles.quickSheet}>
            <View style={styles.quickSheetHeader}>
              <Text style={styles.quickSheetTitle}>কল কেটে মেসেজ পাঠান</Text>
              <Pressable onPress={() => setShowQuickSheet(false)}>
                <Ionicons name="close" size={20} color="#94A3B8" />
              </Pressable>
            </View>
            <View style={styles.quickRepliesList}>
              {QUICK_REPLIES.map((reply) => (
                <Pressable
                  key={reply.id}
                  style={styles.quickReplyItem}
                  onPress={() => handleDecline(reply)}
                >
                  <Text style={styles.quickReplyTextBn}>{reply.textBn}</Text>
                  <Text style={styles.quickReplyTextEn}>{reply.textEn}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : (
          <View style={styles.bottomActionsContainer}>
            {/* Silence ringtone toggle */}
            {!isSilenced && (
              <Pressable style={styles.silenceBtn} onPress={handleSilence}>
                <Ionicons name="volume-mute-outline" size={16} color="#94A3B8" />
                <Text style={styles.silenceBtnText}>রিংটোন মিউট করুন</Text>
              </Pressable>
            )}

            <View style={styles.mainButtonsRow}>
              {/* Decline Button */}
              <View style={styles.btnCol}>
                <Pressable style={styles.declineBtn} onPress={() => handleDecline()}>
                  <Ionicons
                    name="call"
                    size={28}
                    color="#FFFFFF"
                    style={{ transform: [{ rotate: "135deg" }] }}
                  />
                </Pressable>
                <Text style={styles.btnLabel}>কাটুন</Text>
              </View>

              {/* Quick Message Button */}
              <View style={styles.btnCol}>
                <Pressable
                  style={styles.msgBtn}
                  onPress={() => setShowQuickSheet(true)}
                >
                  <Ionicons name="chatbubble-ellipses" size={24} color="#38BDF8" />
                </Pressable>
                <Text style={styles.btnLabel}>মেসেজ</Text>
              </View>

              {/* Answer Button with Animated Glowing Pulse */}
              <View style={styles.btnCol}>
                <Animated.View style={{ transform: [{ scale: buttonPulse }] }}>
                  <Pressable style={styles.answerBtn} onPress={handleAnswer}>
                    <Ionicons
                      name={isVideo ? "videocam" : "call"}
                      size={28}
                      color="#FFFFFF"
                    />
                  </Pressable>
                </Animated.View>
                <Text style={[styles.btnLabel, { color: "#34D399" }]}>ধরুন</Text>
              </View>
            </View>
          </View>
        )}
      </View>
    </Modal>
  );
};

const { width } = Dimensions.get("window");

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(10, 15, 30, 0.96)",
    justifyContent: "space-between",
    paddingVertical: 56,
    paddingHorizontal: 24,
  },
  topContainer: {
    alignItems: "center",
  },
  callTypePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(56, 189, 248, 0.15)",
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(56, 189, 248, 0.3)",
  },
  callTypePillText: {
    color: "#38BDF8",
    fontSize: 13,
    fontWeight: "700",
  },
  centerContainer: {
    alignItems: "center",
  },
  avatarWrapper: {
    position: "relative",
    width: 140,
    height: 140,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
  },
  pulseRing: {
    position: "absolute",
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 2,
    borderColor: "#38BDF8",
    backgroundColor: "rgba(56, 189, 248, 0.08)",
  },
  avatarImg: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 3,
    borderColor: "#FFFFFF",
  },
  avatarFallback: {
    backgroundColor: "#0284C7",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarFallbackText: {
    color: "#FFFFFF",
    fontSize: 36,
    fontWeight: "800",
  },
  verifiedBadge: {
    position: "absolute",
    bottom: 8,
    right: 8,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
  },
  callerName: {
    color: "#FFFFFF",
    fontSize: 24,
    fontWeight: "800",
    textAlign: "center",
    marginBottom: 6,
  },
  roleBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(30, 41, 59, 0.8)",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    marginBottom: 6,
  },
  roleText: {
    color: "#93C5FD",
    fontSize: 12,
    fontWeight: "700",
  },
  locationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  locationText: {
    color: "#94A3B8",
    fontSize: 12,
    fontWeight: "500",
  },
  bottomActionsContainer: {
    gap: 20,
  },
  silenceBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    alignSelf: "center",
    backgroundColor: "rgba(30, 41, 59, 0.6)",
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
  },
  silenceBtnText: {
    color: "#94A3B8",
    fontSize: 12,
    fontWeight: "600",
  },
  mainButtonsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    paddingHorizontal: 12,
  },
  btnCol: {
    alignItems: "center",
    gap: 8,
  },
  declineBtn: {
    width: 66,
    height: 66,
    borderRadius: 33,
    backgroundColor: "#EF4444",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#EF4444",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 8,
  },
  msgBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "rgba(30, 41, 59, 0.9)",
    borderWidth: 1.5,
    borderColor: "rgba(56, 189, 248, 0.4)",
    alignItems: "center",
    justifyContent: "center",
  },
  answerBtn: {
    width: 66,
    height: 66,
    borderRadius: 33,
    backgroundColor: "#10B981",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#10B981",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.6,
    shadowRadius: 12,
    elevation: 10,
  },
  btnLabel: {
    color: "#94A3B8",
    fontSize: 12,
    fontWeight: "700",
  },
  quickSheet: {
    backgroundColor: "rgba(15, 23, 42, 0.96)",
    borderRadius: 24,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.15)",
    gap: 12,
  },
  quickSheetHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  quickSheetTitle: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
  quickRepliesList: {
    gap: 8,
  },
  quickReplyItem: {
    backgroundColor: "rgba(30, 41, 59, 0.8)",
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
  },
  quickReplyTextBn: {
    color: "#F8FAFC",
    fontSize: 13,
    fontWeight: "600",
  },
  quickReplyTextEn: {
    color: "#94A3B8",
    fontSize: 11,
    marginTop: 2,
  },
});

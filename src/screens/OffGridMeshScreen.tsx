/**
 * Off-Grid P2P Mesh Communication & Travel Safety Screen - Shopno Jatra
 * Forensic-Grade Zero-Internet BLE/Wi-Fi Direct Trail Companion:
 * 1. Concentric Proximity Radar with NaN-safe mathematical positioning.
 * 2. Store-and-Forward Decentralized Peer Chat with tactical chips & delivery hops.
 * 3. Slide-to-Activate Emergency SOS Beacon + Glove-Friendly Quick Fallback.
 * 4. Dedicated Peer Directional Compass Bearing Pointer (for finding lost hikers).
 * 5. Offline Trail Breadcrumb Pins & Campsite Rendezvous tracking.
 * 6. Keyboard-safe modal forms and cross-platform haptic failovers.
 */

import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Modal,
  Alert,
  Dimensions,
  Animated,
  Platform,
  Share,
  PanResponder,
  KeyboardAvoidingView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons, Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";

import { useOffGridMeshStore, MeshActiveTab } from "../store/offGridMeshStore";
import {
  MeshNode,
  MeshMessage,
  SosEmergencyType,
  MeshPowerMode,
  TrailCheckpoint,
} from "../types/offGridMesh";
import { useTheme } from "../context/ThemeContext";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

// Professional Design Tokens
const PALETTE = {
  primary: "#E5A93C", // Shopno Jatra Gold
  primaryDark: "#C48A22",
  navy: "#0F172A",
  slateBg: "#F8FAFC",
  cardLight: "#FFFFFF",
  cardDark: "#1E293B",
  emerald: "#10B981", // Active & Healthy signal
  amber: "#F59E0B",
  danger: "#EF4444",
  borderLight: "#E2E8F0",
  borderDark: "#334155",
  textMuted: "#64748B",
};

export default function OffGridMeshScreen() {
  const { isDark } = useTheme();
  const {
    networkState,
    messages,
    checkpoints,
    activeTab,
    selectedPeer,
    currentLocation,
    compassHeading,
    isSendingMessage,
    initialize,
    setActiveTab,
    setSelectedPeer,
    setPowerMode,
    sendMessage,
    triggerSos,
    cancelSos,
    addCheckpoint,
    joinNetwork,
    syncCloudNow,
    updateLocationAndHeading,
    cleanup,
  } = useOffGridMeshStore();

  const [inputText, setInputText] = useState("");
  const [isUrgentMsg, setIsUrgentMsg] = useState(false);
  const [showNetworkModal, setShowNetworkModal] = useState(false);
  const [networkInput, setNetworkInput] = useState(networkState.networkId);
  const [nameInput, setNameInput] = useState(networkState.localNodeName);
  const [showAddPinModal, setShowAddPinModal] = useState(false);
  const [pinTitle, setPinTitle] = useState("");
  const [pinType, setPinType] = useState<TrailCheckpoint["type"]>("campsite");
  const [pinDesc, setPinDesc] = useState("");

  // SOS Slider state
  const [sosType, setSosType] = useState<SosEmergencyType>("medical");
  const [sosNotes, setSosNotes] = useState("");
  const sliderAnim = useRef(new Animated.Value(0)).current;
  const maxSlideWidth = Math.max(200, SCREEN_WIDTH - 96);

  // Animations
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const sweepRotation = useRef(new Animated.Value(0)).current;

  // Safe Haptic feedback helper
  const triggerHaptic = (style: Haptics.ImpactFeedbackStyle = Haptics.ImpactFeedbackStyle.Light) => {
    if (Platform.OS !== "web") {
      try {
        Haptics.impactAsync(style).catch(() => {});
      } catch {}
    }
  };

  const triggerNotificationHaptic = (type: Haptics.NotificationFeedbackType = Haptics.NotificationFeedbackType.Success) => {
    if (Platform.OS !== "web") {
      try {
        Haptics.notificationAsync(type).catch(() => {});
      } catch {}
    }
  };

  useEffect(() => {
    initialize();

    if (process.env.NODE_ENV === "test") {
      return () => {
        cleanup();
      };
    }

    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.15,
          duration: 1800,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1800,
          useNativeDriver: true,
        }),
      ])
    );
    pulseLoop.start();

    const sweepLoop = Animated.loop(
      Animated.timing(sweepRotation, {
        toValue: 1,
        duration: 4500,
        useNativeDriver: true,
      })
    );
    sweepLoop.start();

    return () => {
      pulseLoop.stop();
      sweepLoop.stop();
      cleanup();
    };
  }, []);

  // Slide-to-Activate SOS PanResponder with safe threshold
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderMove: (_, gestureState) => {
          if (gestureState.dx > 0 && gestureState.dx <= maxSlideWidth) {
            sliderAnim.setValue(gestureState.dx);
          }
        },
        onPanResponderRelease: (_, gestureState) => {
          if (gestureState.dx >= maxSlideWidth - 30) {
            triggerNotificationHaptic(Haptics.NotificationFeedbackType.Error);
            triggerSos(sosType, sosNotes);
            Animated.timing(sliderAnim, {
              toValue: maxSlideWidth,
              duration: 150,
              useNativeDriver: false,
            }).start();
          } else {
            Animated.spring(sliderAnim, {
              toValue: 0,
              useNativeDriver: false,
            }).start();
          }
        },
      }),
    [maxSlideWidth, sosType, sosNotes]
  );

  const handleSend = async (textToSend?: string) => {
    const text = textToSend || inputText;
    if (!text.trim()) return;
    setInputText("");
    await sendMessage(text, isUrgentMsg);
    setIsUrgentMsg(false);
  };

  const handleShareNetwork = async () => {
    try {
      await Share.share({
        message: `Join our Shopno Jatra Off-Grid Trail Mesh Network: "${networkState.networkId}". Zero cellular internet needed for group tracking and P2P communication.`,
      });
    } catch {}
  };

  const handleSaveNetwork = async () => {
    if (networkInput.trim()) {
      await joinNetwork(networkInput.trim(), nameInput.trim() || "My Device");
      setShowNetworkModal(false);
      triggerNotificationHaptic(Haptics.NotificationFeedbackType.Success);
    }
  };

  const handleCreatePin = async () => {
    if (!pinTitle.trim()) {
      Alert.alert("Title Required", "Please provide a name for this checkpoint.");
      return;
    }
    await addCheckpoint(pinTitle.trim(), pinType, pinDesc.trim() || undefined);
    setPinTitle("");
    setPinDesc("");
    setShowAddPinModal(false);
    triggerNotificationHaptic(Haptics.NotificationFeedbackType.Success);
  };

  const handleManualSosConfirmation = () => {
    Alert.alert(
      "CONFIRM DISTRESS BEACON",
      `Broadcast ${sosType.toUpperCase()} emergency beacon to all devices across the trail?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "BROADCAST SOS",
          style: "destructive",
          onPress: () => {
            triggerNotificationHaptic(Haptics.NotificationFeedbackType.Error);
            triggerSos(sosType, sosNotes);
          },
        },
      ]
    );
  };

  const isSosActive = !!networkState.activeSosBeacon;
  const isThemeDark = isDark;
  const bg = isThemeDark ? "#090D16" : PALETTE.slateBg;
  const cardBg = isThemeDark ? PALETTE.cardDark : PALETTE.cardLight;
  const borderColor = isThemeDark ? PALETTE.borderDark : PALETTE.borderLight;
  const textColor = isThemeDark ? "#FFFFFF" : PALETTE.navy;

  const spin = sweepRotation.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: bg }]} edges={["top"]}>
      {/* ── TOP HEADER ── */}
      <View style={[styles.header, { borderBottomColor: borderColor, backgroundColor: cardBg }]}>
        <View style={styles.headerLeft}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="arrow-back" size={22} color={textColor} />
          </TouchableOpacity>
          <View>
            <View style={styles.networkBadgeRow}>
              <View style={styles.pulseDot} />
              <Text style={[styles.headerTitle, { color: textColor }]}>
                {networkState.networkId}
              </Text>
              <TouchableOpacity onPress={() => setShowNetworkModal(true)} style={styles.editNetBtn}>
                <Feather name="settings" size={14} color={PALETTE.textMuted} />
              </TouchableOpacity>
            </View>
            <Text style={styles.headerSubtitle}>
              {networkState.connectedNodes.length} Peers Online • Off-Grid BLE Radio
            </Text>
          </View>
        </View>

        <View style={styles.headerRight}>
          <TouchableOpacity
            style={[styles.powerModePill, { borderColor }]}
            onPress={() => {
              const next: MeshPowerMode =
                networkState.powerMode === "eco"
                  ? "balanced"
                  : networkState.powerMode === "balanced"
                  ? "eco"
                  : "balanced";
              setPowerMode(next);
              triggerHaptic(Haptics.ImpactFeedbackStyle.Light);
            }}
          >
            <MaterialCommunityIcons
              name={networkState.powerMode === "eco" ? "leaf" : "battery-charging-60"}
              size={14}
              color={networkState.powerMode === "eco" ? PALETTE.emerald : PALETTE.primary}
            />
            <Text style={[styles.powerModeText, { color: textColor }]}>
              {networkState.powerMode.toUpperCase()}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionIconBtn, { borderColor }]}
            onPress={handleShareNetwork}
          >
            <Ionicons name="share-social-outline" size={17} color={textColor} />
          </TouchableOpacity>
        </View>
      </View>

      {/* ── SOS ACTIVE BANNER (IF DISTRESS BEACON ACTIVE) ── */}
      {isSosActive && (
        <View style={styles.sosAlertBanner}>
          <View style={styles.sosBannerContent}>
            <Ionicons name="warning" size={22} color="#FFFFFF" />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={styles.sosBannerTitle}>
                DISTRESS BEACON BROADCASTING ({networkState.activeSosBeacon?.emergencyType.toUpperCase()})
              </Text>
              <Text style={styles.sosBannerSubtitle}>
                Relayed across {networkState.activeSosBeacon?.relayCount || 0} local devices.
                Cloud dispatch standing by.
              </Text>
            </View>
          </View>
          <TouchableOpacity style={styles.sosCancelButton} onPress={cancelSos}>
            <Text style={styles.sosCancelText}>Cancel SOS</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── SEGMENTED NAVIGATION TABS ── */}
      <View style={[styles.tabsWrapper, { backgroundColor: cardBg, borderBottomColor: borderColor }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsScroll}>
          <TouchableOpacity
            style={[
              styles.tabPill,
              activeTab === "radar" && [styles.tabPillActive, { backgroundColor: PALETTE.primary }],
            ]}
            onPress={() => {
              setActiveTab("radar");
              triggerHaptic(Haptics.ImpactFeedbackStyle.Light);
            }}
          >
            <Ionicons
              name="radio"
              size={15}
              color={activeTab === "radar" ? "#FFFFFF" : PALETTE.textMuted}
            />
            <Text style={[styles.tabText, activeTab === "radar" && styles.tabTextActive]}>
              রাডার (Radar)
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.tabPill,
              activeTab === "chat" && [styles.tabPillActive, { backgroundColor: PALETTE.primary }],
            ]}
            onPress={() => {
              setActiveTab("chat");
              triggerHaptic(Haptics.ImpactFeedbackStyle.Light);
            }}
          >
            <Ionicons
              name="chatbubbles-outline"
              size={15}
              color={activeTab === "chat" ? "#FFFFFF" : PALETTE.textMuted}
            />
            <Text style={[styles.tabText, activeTab === "chat" && styles.tabTextActive]}>
              মেস বার্তা (Chat)
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.tabPill,
              activeTab === "sos" && [styles.tabPillActive, { backgroundColor: PALETTE.danger }],
            ]}
            onPress={() => {
              setActiveTab("sos");
              triggerHaptic(Haptics.ImpactFeedbackStyle.Light);
            }}
          >
            <Ionicons
              name="shield-checkmark"
              size={15}
              color={activeTab === "sos" ? "#FFFFFF" : PALETTE.danger}
            />
            <Text
              style={[
                styles.tabText,
                { color: activeTab === "sos" ? "#FFFFFF" : PALETTE.danger },
                activeTab === "sos" && styles.tabTextActive,
              ]}
            >
              এসওএস (SOS)
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.tabPill,
              activeTab === "trail" && [styles.tabPillActive, { backgroundColor: PALETTE.primary }],
            ]}
            onPress={() => {
              setActiveTab("trail");
              triggerHaptic(Haptics.ImpactFeedbackStyle.Light);
            }}
          >
            <Ionicons
              name="location-outline"
              size={15}
              color={activeTab === "trail" ? "#FFFFFF" : PALETTE.textMuted}
            />
            <Text style={[styles.tabText, activeTab === "trail" && styles.tabTextActive]}>
              ট্রেইল পিন (Trail Pins)
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* ── TAB CONTENT ── */}
      <View style={styles.tabContentContainer}>
        {/* ──────────────── TAB 1: RADAR & PEERS ──────────────── */}
        {activeTab === "radar" && (
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContainer}
          >
            {/* Visual Concentric Radar Canvas with Defensive NaN Guards */}
            <View style={[styles.radarCard, { backgroundColor: cardBg, borderColor }]}>
              <View style={styles.radarHeader}>
                <View>
                  <Text style={[styles.cardTitle, { color: textColor }]}>
                    Local Proximity Radar
                  </Text>
                  <Text style={styles.cardSubtitle}>
                    Relative positioning calculated via BLE radio path loss
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.refreshLocBtn}
                  onPress={updateLocationAndHeading}
                >
                  <Ionicons name="refresh" size={16} color={PALETTE.primary} />
                </TouchableOpacity>
              </View>

              <View style={styles.radarVisualContainer}>
                {/* Concentric distance rings */}
                <Animated.View
                  style={[
                    styles.radarOuterRing,
                    { transform: [{ scale: pulseAnim }], borderColor: isDark ? "#334155" : "#E2E8F0" },
                  ]}
                />
                <View
                  style={[
                    styles.radarMidRing,
                    { borderColor: isDark ? "#334155" : "#CBD5E1" },
                  ]}
                />
                <View
                  style={[
                    styles.radarInnerRing,
                    { borderColor: isDark ? "#475569" : "#94A3B8" },
                  ]}
                />

                {/* Rotating radar sweep ray */}
                <Animated.View
                  style={[
                    styles.radarSweepRay,
                    { transform: [{ rotate: spin }] },
                  ]}
                />

                {/* Center node: Self */}
                <View style={styles.radarCenterNode}>
                  <Ionicons name="navigate" size={16} color="#FFFFFF" />
                </View>

                {/* Peer Node Indicators plotted on radar safely with NaN defense */}
                {networkState.connectedNodes.map((peer) => {
                  const maxDistance = 75;
                  const safeDistance = Number.isFinite(peer.estimatedDistanceMeters)
                    ? peer.estimatedDistanceMeters
                    : 15;
                  const distFraction = Math.max(0.1, Math.min(safeDistance / maxDistance, 0.9));
                  const radius = distFraction * 110;
                  const safeBearing = Number.isFinite(peer.compassBearingDegrees)
                    ? peer.compassBearingDegrees
                    : 0;
                  const rad = (safeBearing - 90) * (Math.PI / 180);
                  const x = Number.isFinite(radius * Math.cos(rad))
                    ? Math.round(radius * Math.cos(rad))
                    : 0;
                  const y = Number.isFinite(radius * Math.sin(rad))
                    ? Math.round(radius * Math.sin(rad))
                    : 0;

                  return (
                    <TouchableOpacity
                      key={peer.id}
                      style={[
                        styles.radarPeerDot,
                        {
                          transform: [{ translateX: x }, { translateY: y }],
                          backgroundColor:
                            peer.role === "guide"
                              ? PALETTE.primary
                              : peer.role === "medic"
                              ? PALETTE.emerald
                              : "#3B82F6",
                        },
                      ]}
                      onPress={() => {
                        setSelectedPeer(peer);
                        triggerHaptic(Haptics.ImpactFeedbackStyle.Light);
                      }}
                    >
                      <Text style={styles.radarPeerDotLabel}>
                        {peer.peerName ? peer.peerName.charAt(0) : "P"}
                      </Text>
                    </TouchableOpacity>
                  );
                })}

                {/* Range Labels */}
                <Text style={styles.rangeLabelInner}>10m</Text>
                <Text style={styles.rangeLabelMid}>30m</Text>
                <Text style={styles.rangeLabelOuter}>70m</Text>
              </View>

              {/* Radar Footer stats */}
              <View style={[styles.radarFooter, { borderTopColor: borderColor }]}>
                <View style={styles.radarStatItem}>
                  <Text style={styles.statNumber}>{networkState.connectedNodes.length}</Text>
                  <Text style={styles.statLabel}>Active Nodes</Text>
                </View>
                <View style={styles.radarStatItem}>
                  <Text style={styles.statNumber}>
                    {networkState.connectedNodes[0]?.estimatedDistanceMeters || 6.5}m
                  </Text>
                  <Text style={styles.statLabel}>Closest Peer</Text>
                </View>
                <View style={styles.radarStatItem}>
                  <Text style={styles.statNumber}>
                    {networkState.cloudSyncPendingCount > 0 ? "Pending" : "Armed"}
                  </Text>
                  <Text style={styles.statLabel}>Cloud Relay</Text>
                </View>
              </View>
            </View>

            {/* Selected Peer Direction Finder HUD */}
            {selectedPeer && (
              <View style={[styles.directionHudCard, { backgroundColor: cardBg, borderColor: PALETTE.primary }]}>
                <View style={styles.hudHeader}>
                  <Ionicons name="compass" size={20} color={PALETTE.primary} />
                  <Text style={[styles.hudTitle, { color: textColor }]}>
                    Tracking: {selectedPeer.peerName}
                  </Text>
                  <TouchableOpacity onPress={() => setSelectedPeer(null)}>
                    <Ionicons name="close" size={18} color={PALETTE.textMuted} />
                  </TouchableOpacity>
                </View>
                <View style={styles.hudBody}>
                  <View style={styles.hudCompassCircle}>
                    <Ionicons
                      name="navigate"
                      size={28}
                      color={PALETTE.primary}
                      style={{
                        transform: [
                          { rotate: `${(selectedPeer.compassBearingDegrees || 0) - compassHeading}deg` },
                        ],
                      }}
                    />
                  </View>
                  <View style={{ flex: 1, marginLeft: 14 }}>
                    <Text style={styles.hudDistanceText}>
                      Distance: <Text style={{ color: PALETTE.primary, fontWeight: "800" }}>{selectedPeer.estimatedDistanceMeters}m</Text>
                    </Text>
                    <Text style={styles.hudBearingText}>
                      Bearing {selectedPeer.compassBearingDegrees}° • Battery {selectedPeer.batteryLevel}%
                    </Text>
                    <Text style={styles.hudAdviceText}>
                      Walk straight ahead along the trail while keeping heading arrow aligned.
                    </Text>
                  </View>
                </View>
              </View>
            )}

            {/* Peer List Cards */}
            <Text style={[styles.sectionHeading, { color: textColor }]}>
              Connected Group Members
            </Text>

            {networkState.connectedNodes.map((peer) => {
              const isLead = peer.role === "guide";
              const isMedic = peer.role === "medic";
              const isSelected = selectedPeer?.id === peer.id;

              return (
                <TouchableOpacity
                  key={peer.id}
                  style={[
                    styles.peerCard,
                    { backgroundColor: cardBg, borderColor },
                    isSelected && { borderColor: PALETTE.primary, borderWidth: 1.5 },
                  ]}
                  onPress={() => setSelectedPeer(isSelected ? null : peer)}
                >
                  <View style={styles.peerAvatarWrapper}>
                    <View
                      style={[
                        styles.peerAvatar,
                        {
                          backgroundColor: isLead
                            ? "rgba(229, 169, 60, 0.15)"
                            : isMedic
                            ? "rgba(16, 185, 129, 0.15)"
                            : "rgba(59, 130, 246, 0.15)",
                        },
                      ]}
                    >
                      <Ionicons
                        name={isLead ? "compass" : isMedic ? "medkit" : "person"}
                        size={20}
                        color={isLead ? PALETTE.primary : isMedic ? PALETTE.emerald : "#3B82F6"}
                      />
                    </View>
                    <View
                      style={[
                        styles.peerStatusBadge,
                        { backgroundColor: peer.status === "active" ? PALETTE.emerald : PALETTE.amber },
                      ]}
                    />
                  </View>

                  <View style={styles.peerMainInfo}>
                    <View style={styles.peerNameRow}>
                      <Text style={[styles.peerName, { color: textColor }]} numberOfLines={1}>
                        {peer.peerName}
                      </Text>
                      {isLead && <Text style={styles.roleTagGuide}>GUIDE</Text>}
                      {isMedic && <Text style={styles.roleTagMedic}>MEDIC</Text>}
                    </View>
                    <Text style={styles.peerCoordsText}>
                      {peer.coordinates?.locationName || "On Trail"} • Bearing {peer.compassBearingDegrees}°
                    </Text>
                  </View>

                  <View style={styles.peerStatsRight}>
                    <View style={styles.distanceBadge}>
                      <Ionicons name="footsteps-outline" size={13} color={PALETTE.primary} />
                      <Text style={styles.distanceText}>{peer.estimatedDistanceMeters}m</Text>
                    </View>
                    <View style={styles.batteryRow}>
                      <Ionicons
                        name={peer.batteryLevel > 30 ? "battery-half" : "battery-dead"}
                        size={12}
                        color={peer.batteryLevel > 30 ? PALETTE.textMuted : PALETTE.danger}
                      />
                      <Text style={styles.batteryText}>{peer.batteryLevel}%</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}

        {/* ──────────────── TAB 2: MESH CHAT ──────────────── */}
        {activeTab === "chat" && (
          <KeyboardAvoidingView
            style={styles.chatWrapper}
            behavior={Platform.OS === "ios" ? "padding" : undefined}
          >
            {/* Quick Tactical Preset Chips */}
            <View style={[styles.tacticalChipsContainer, { backgroundColor: cardBg, borderBottomColor: borderColor }]}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tacticalScroll}>
                {[
                  "✅ I'm safe & on track",
                  "⏳ Wait for me at trail fork",
                  "💧 Found fresh water stream",
                  "⚠️ Steep rocks / slow pace",
                  "⛺ Reached basecamp",
                ].map((chipText, i) => (
                  <TouchableOpacity
                    key={i}
                    style={[styles.tacticalChip, { borderColor }]}
                    onPress={() => handleSend(chipText)}
                  >
                    <Text style={[styles.tacticalChipText, { color: textColor }]}>
                      {chipText}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            {/* Message Feed */}
            <ScrollView
              style={styles.messageFeed}
              contentContainerStyle={{ padding: 16, paddingBottom: 20 }}
              showsVerticalScrollIndicator={false}
            >
              {messages.map((msg) => {
                const isSelf = msg.senderId === networkState.localNodeId;
                const isUrgent = msg.isUrgent;

                return (
                  <View
                    key={msg.id}
                    style={[
                      styles.messageRow,
                      isSelf ? styles.messageRowSelf : styles.messageRowPeer,
                    ]}
                  >
                    <View
                      style={[
                        styles.messageBubble,
                        isSelf
                          ? [styles.bubbleSelf, { backgroundColor: PALETTE.primary }]
                          : [styles.bubblePeer, { backgroundColor: cardBg, borderColor }],
                        isUrgent && styles.bubbleUrgent,
                      ]}
                    >
                      <View style={styles.msgHeaderRow}>
                        <Text
                          style={[
                            styles.msgSenderName,
                            { color: isSelf ? "#FFFFFF" : isUrgent ? PALETTE.danger : PALETTE.primary },
                          ]}
                        >
                          {isSelf ? "You" : msg.senderName}
                        </Text>
                        <Text style={[styles.msgTime, { color: isSelf ? "rgba(255,255,255,0.7)" : PALETTE.textMuted }]}>
                          {new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </Text>
                      </View>

                      <Text
                        style={[
                          styles.msgText,
                          { color: isSelf ? "#FFFFFF" : textColor },
                          isUrgent && styles.msgTextUrgent,
                        ]}
                      >
                        {msg.text}
                      </Text>

                      <View style={styles.msgFooterRow}>
                        <Text
                          style={[
                            styles.msgHops,
                            { color: isSelf ? "rgba(255,255,255,0.7)" : PALETTE.textMuted },
                          ]}
                        >
                          {msg.hops <= 1 ? "Direct (1 hop)" : `Relayed (${msg.hops} hops)`}
                        </Text>
                        <Ionicons
                          name="checkmark-done"
                          size={13}
                          color={isSelf ? "rgba(255,255,255,0.9)" : PALETTE.emerald}
                        />
                      </View>
                    </View>
                  </View>
                );
              })}
            </ScrollView>

            {/* Input Bar */}
            <View style={[styles.inputBar, { backgroundColor: cardBg, borderTopColor: borderColor }]}>
              <TouchableOpacity
                style={[
                  styles.urgentToggleBtn,
                  isUrgentMsg && { backgroundColor: "rgba(239, 68, 68, 0.15)", borderColor: PALETTE.danger },
                ]}
                onPress={() => {
                  setIsUrgentMsg(!isUrgentMsg);
                  triggerHaptic(Haptics.ImpactFeedbackStyle.Light);
                }}
              >
                <Ionicons
                  name="alert-circle"
                  size={20}
                  color={isUrgentMsg ? PALETTE.danger : PALETTE.textMuted}
                />
              </TouchableOpacity>

              <TextInput
                style={[styles.chatInput, { color: textColor, borderColor }]}
                placeholder={isUrgentMsg ? "High priority alert..." : "Off-grid message..."}
                placeholderTextColor={PALETTE.textMuted}
                value={inputText}
                onChangeText={setInputText}
                onSubmitEditing={() => handleSend()}
              />

              <TouchableOpacity
                style={[styles.sendButton, { backgroundColor: isUrgentMsg ? PALETTE.danger : PALETTE.primary }]}
                onPress={() => handleSend()}
                disabled={isSendingMessage}
              >
                <Ionicons name="arrow-up" size={20} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        )}

        {/* ──────────────── TAB 3: EMERGENCY SOS ──────────────── */}
        {activeTab === "sos" && (
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContainer}
          >
            <View style={[styles.sosCard, { backgroundColor: cardBg, borderColor }]}>
              <View style={styles.sosCardHeader}>
                <View style={styles.sosIconCircle}>
                  <MaterialCommunityIcons name="shield-alert" size={32} color={PALETTE.danger} />
                </View>
                <View style={{ flex: 1, marginLeft: 14 }}>
                  <Text style={[styles.sosMainTitle, { color: textColor }]}>
                    Offline Distress Beacon
                  </Text>
                  <Text style={styles.sosMainSubtitle}>
                    Multi-hop broadcast via all nearby phones. Reaches emergency responders when ANY node connects.
                  </Text>
                </View>
              </View>

              {/* Emergency Type Selector */}
              <Text style={[styles.fieldLabel, { color: textColor }]}>
                Select Emergency Category:
              </Text>
              <View style={styles.typeGrid}>
                {[
                  { id: "medical", label: "Medical / Illness", icon: "medkit" },
                  { id: "injury", label: "Fracture / Fall", icon: "body" },
                  { id: "lost", label: "Lost Trail / Separated", icon: "compass" },
                  { id: "wildlife", label: "Animal / Snake", icon: "paw" },
                  { id: "weather", label: "Severe Storm / Flash Flood", icon: "thunderstorm" },
                ].map((item) => (
                  <TouchableOpacity
                    key={item.id}
                    style={[
                      styles.typePill,
                      { borderColor },
                      sosType === item.id && {
                        backgroundColor: "rgba(239, 68, 68, 0.12)",
                        borderColor: PALETTE.danger,
                      },
                    ]}
                    onPress={() => {
                      setSosType(item.id as SosEmergencyType);
                      triggerHaptic(Haptics.ImpactFeedbackStyle.Light);
                    }}
                  >
                    <Ionicons
                      name={item.icon as any}
                      size={15}
                      color={sosType === item.id ? PALETTE.danger : PALETTE.textMuted}
                    />
                    <Text
                      style={[
                        styles.typePillText,
                        { color: sosType === item.id ? PALETTE.danger : textColor },
                      ]}
                    >
                      {item.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Optional Medical Notes */}
              <Text style={[styles.fieldLabel, { color: textColor, marginTop: 14 }]}>
                Medical / Situation Notes (Optional):
              </Text>
              <TextInput
                style={[styles.notesInput, { color: textColor, borderColor }]}
                placeholder="e.g. Blood type O+, twisted left ankle, unable to descend ridge..."
                placeholderTextColor={PALETTE.textMuted}
                value={sosNotes}
                onChangeText={setSosNotes}
                multiline
                numberOfLines={3}
              />

              {/* Primary Slide to Activate Bar */}
              <View style={styles.sliderContainer}>
                <View style={styles.sliderTrack}>
                  <Text style={styles.sliderTrackText}>SLIDE TO BROADCAST SOS ➔</Text>
                  <Animated.View
                    {...panResponder.panHandlers}
                    style={[
                      styles.sliderThumb,
                      {
                        transform: [{ translateX: sliderAnim }],
                      },
                    ]}
                  >
                    <Ionicons name="alert" size={24} color="#FFFFFF" />
                  </Animated.View>
                </View>
              </View>

              {/* Glove-friendly Fallback Tap Button */}
              <TouchableOpacity
                style={styles.gloveFallbackBtn}
                onPress={handleManualSosConfirmation}
              >
                <Ionicons name="hand-right-outline" size={15} color={PALETTE.danger} />
                <Text style={styles.gloveFallbackText}>
                  Cold hands or gloves? Tap to confirm SOS broadcast
                </Text>
              </TouchableOpacity>

              <Text style={styles.sliderDisclaimer}>
                ⚠️ Only activate in real life-threatening emergencies. This beacon alerts all group guides and nearby hikers.
              </Text>
            </View>

            {/* Cloud Relay Sync Status */}
            <View style={[styles.relaySyncCard, { backgroundColor: cardBg, borderColor }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.relayTitle, { color: textColor }]}>
                  Automatic Cloud Relay
                </Text>
                <Text style={styles.relaySubtitle}>
                  Pending Beacons: {networkState.cloudSyncPendingCount}. If any phone touches cellular data, it automatically notifies 999 Police and tourist helplines.
                </Text>
              </View>
              <TouchableOpacity style={styles.syncNowBtn} onPress={syncCloudNow}>
                <Text style={styles.syncNowText}>Test Sync</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        )}

        {/* ──────────────── TAB 4: TRAIL PINS ──────────────── */}
        {activeTab === "trail" && (
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContainer}
          >
            <View style={styles.trailHeaderRow}>
              <View>
                <Text style={[styles.sectionHeading, { color: textColor, marginBottom: 2 }]}>
                  Offline Trail Checkpoints
                </Text>
                <Text style={styles.cardSubtitle}>
                  GPS rendezvous points & water sources saved locally
                </Text>
              </View>
              <TouchableOpacity
                style={styles.addPinBtn}
                onPress={() => setShowAddPinModal(true)}
              >
                <Ionicons name="add" size={18} color="#FFFFFF" />
                <Text style={styles.addPinText}>Drop Pin</Text>
              </TouchableOpacity>
            </View>

            {checkpoints.map((cp) => {
              const iconMap = {
                campsite: "bed-outline",
                water_source: "water-outline",
                shelter: "home-outline",
                danger_zone: "warning-outline",
                rendezvous: "flag-outline",
              };

              return (
                <View
                  key={cp.id}
                  style={[styles.checkpointCard, { backgroundColor: cardBg, borderColor }]}
                >
                  <View
                    style={[
                      styles.cpIconCircle,
                      {
                        backgroundColor:
                          cp.type === "campsite"
                            ? "rgba(229, 169, 60, 0.15)"
                            : cp.type === "water_source"
                            ? "rgba(59, 130, 246, 0.15)"
                            : cp.type === "danger_zone"
                            ? "rgba(239, 68, 68, 0.15)"
                            : "rgba(16, 185, 129, 0.15)",
                      },
                    ]}
                  >
                    <Ionicons
                      name={iconMap[cp.type] as any}
                      size={20}
                      color={
                        cp.type === "campsite"
                          ? PALETTE.primary
                          : cp.type === "water_source"
                          ? "#3B82F6"
                          : cp.type === "danger_zone"
                          ? PALETTE.danger
                          : PALETTE.emerald
                      }
                    />
                  </View>

                  <View style={styles.cpMainInfo}>
                    <Text style={[styles.cpTitle, { color: textColor }]}>
                      {cp.title}
                    </Text>
                    {cp.description ? (
                      <Text style={styles.cpDescText} numberOfLines={2}>
                        {cp.description}
                      </Text>
                    ) : null}
                    <Text style={styles.cpCoordsText}>
                      Lat: {cp.coordinates.latitude.toFixed(4)}, Lon: {cp.coordinates.longitude.toFixed(4)} • by {cp.createdBy}
                    </Text>
                  </View>

                  {cp.distanceFromCurrentMeters !== undefined && (
                    <View style={styles.cpBearingBox}>
                      <Ionicons
                        name="navigate-outline"
                        size={15}
                        color={PALETTE.primary}
                        style={{
                          transform: [
                            { rotate: `${(cp.bearingFromCurrentDegrees || 0) - compassHeading}deg` },
                          ],
                        }}
                      />
                      <Text style={styles.cpDistText}>
                        {cp.distanceFromCurrentMeters > 1000
                          ? `${(cp.distanceFromCurrentMeters / 1000).toFixed(1)}km`
                          : `${cp.distanceFromCurrentMeters}m`}
                      </Text>
                    </View>
                  )}
                </View>
              );
            })}
          </ScrollView>
        )}
      </View>

      {/* ── MODAL: JOIN OR RENAME MESH NETWORK ── */}
      <Modal visible={showNetworkModal} transparent animationType="slide">
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={[styles.modalBox, { backgroundColor: cardBg }]}>
            <Text style={[styles.modalTitle, { color: textColor }]}>Mesh Network Settings</Text>
            <Text style={styles.modalSubtitle}>
              Ensure all members in your group have the exact same Network ID to communicate peer-to-peer.
            </Text>

            <Text style={[styles.modalFieldLabel, { color: textColor }]}>Network Group ID:</Text>
            <TextInput
              style={[styles.modalInput, { color: textColor, borderColor }]}
              value={networkInput}
              onChangeText={setNetworkInput}
              placeholder="e.g. SAJEK-EXPEDITION-2026"
              placeholderTextColor={PALETTE.textMuted}
              autoCapitalize="characters"
            />

            <Text style={[styles.modalFieldLabel, { color: textColor, marginTop: 12 }]}>
              Your Display Name:
            </Text>
            <TextInput
              style={[styles.modalInput, { color: textColor, borderColor }]}
              value={nameInput}
              onChangeText={setNameInput}
              placeholder="e.g. Tanvir (Traveler)"
              placeholderTextColor={PALETTE.textMuted}
            />

            <View style={styles.modalActionRow}>
              <TouchableOpacity
                style={[styles.modalCancelBtn, { borderColor }]}
                onPress={() => setShowNetworkModal(false)}
              >
                <Text style={[styles.modalCancelText, { color: textColor }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSubmitBtn, { backgroundColor: PALETTE.primary }]}
                onPress={handleSaveNetwork}
              >
                <Text style={styles.modalSubmitText}>Save & Join</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── MODAL: DROP OFFLINE TRAIL CHECKPOINT PIN ── */}
      <Modal visible={showAddPinModal} transparent animationType="slide">
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={[styles.modalBox, { backgroundColor: cardBg }]}>
            <Text style={[styles.modalTitle, { color: textColor }]}>Drop Trail Checkpoint</Text>
            <Text style={styles.modalSubtitle}>
              Saves current GPS coordinates and broadcasts waypoint to all connected group members.
            </Text>

            <Text style={[styles.modalFieldLabel, { color: textColor }]}>Checkpoint Name:</Text>
            <TextInput
              style={[styles.modalInput, { color: textColor, borderColor }]}
              value={pinTitle}
              onChangeText={setPinTitle}
              placeholder="e.g. Stream Water Source, Campsite 2"
              placeholderTextColor={PALETTE.textMuted}
            />

            <Text style={[styles.modalFieldLabel, { color: textColor, marginTop: 12 }]}>Category:</Text>
            <View style={styles.pinTypeSelector}>
              {(["campsite", "water_source", "shelter", "danger_zone", "rendezvous"] as const).map((t) => (
                <TouchableOpacity
                  key={t}
                  style={[
                    styles.pinTypePill,
                    { borderColor },
                    pinType === t && { backgroundColor: PALETTE.primary, borderColor: PALETTE.primary },
                  ]}
                  onPress={() => setPinType(t)}
                >
                  <Text style={[styles.pinTypePillText, pinType === t && { color: "#FFFFFF" }]}>
                    {t.replace("_", " ").toUpperCase()}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[styles.modalFieldLabel, { color: textColor, marginTop: 12 }]}>
              Notes / Warnings:
            </Text>
            <TextInput
              style={[styles.modalInput, { color: textColor, borderColor }]}
              value={pinDesc}
              onChangeText={setPinDesc}
              placeholder="e.g. Boil water 5 min before drinking"
              placeholderTextColor={PALETTE.textMuted}
            />

            <View style={styles.modalActionRow}>
              <TouchableOpacity
                style={[styles.modalCancelBtn, { borderColor }]}
                onPress={() => setShowAddPinModal(false)}
              >
                <Text style={[styles.modalCancelText, { color: textColor }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSubmitBtn, { backgroundColor: PALETTE.primary }]}
                onPress={handleCreatePin}
              >
                <Text style={styles.modalSubmitText}>Save Pin</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
  },
  backButton: {
    marginRight: 12,
  },
  networkBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  pulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: PALETTE.emerald,
    marginRight: 6,
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  editNetBtn: {
    marginLeft: 6,
    padding: 2,
  },
  headerSubtitle: {
    fontSize: 11,
    color: PALETTE.textMuted,
    marginTop: 1,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  powerModePill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 14,
    borderWidth: 1,
    gap: 4,
  },
  powerModeText: {
    fontSize: 10,
    fontWeight: "700",
  },
  actionIconBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  sosAlertBanner: {
    backgroundColor: PALETTE.danger,
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sosBannerContent: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  sosBannerTitle: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.4,
  },
  sosBannerSubtitle: {
    color: "rgba(255,255,255,0.9)",
    fontSize: 10.5,
    marginTop: 1,
  },
  sosCancelButton: {
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    marginLeft: 10,
  },
  sosCancelText: {
    color: PALETTE.danger,
    fontWeight: "700",
    fontSize: 11,
  },
  tabsWrapper: {
    borderBottomWidth: 1,
  },
  tabsScroll: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  tabPill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: "transparent",
    gap: 6,
  },
  tabPillActive: {
    elevation: 2,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  tabText: {
    fontSize: 12.5,
    fontWeight: "600",
    color: PALETTE.textMuted,
  },
  tabTextActive: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
  tabContentContainer: {
    flex: 1,
  },
  scrollContainer: {
    padding: 16,
    paddingBottom: 40,
  },
  radarCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
    overflow: "hidden",
  },
  radarHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 10,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: "700",
  },
  cardSubtitle: {
    fontSize: 11,
    color: PALETTE.textMuted,
    marginTop: 2,
  },
  refreshLocBtn: {
    padding: 4,
  },
  radarVisualContainer: {
    height: 250,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    marginVertical: 10,
  },
  radarOuterRing: {
    position: "absolute",
    width: 220,
    height: 220,
    borderRadius: 110,
    borderWidth: 1,
    borderStyle: "dashed",
  },
  radarMidRing: {
    position: "absolute",
    width: 150,
    height: 150,
    borderRadius: 75,
    borderWidth: 1,
  },
  radarInnerRing: {
    position: "absolute",
    width: 75,
    height: 75,
    borderRadius: 37.5,
    borderWidth: 1,
  },
  radarSweepRay: {
    position: "absolute",
    width: 220,
    height: 2,
    backgroundColor: "rgba(229, 169, 60, 0.3)",
  },
  radarCenterNode: {
    position: "absolute",
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: PALETTE.primary,
    alignItems: "center",
    justifyContent: "center",
    elevation: 4,
    zIndex: 10,
  },
  radarPeerDot: {
    position: "absolute",
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    elevation: 3,
    zIndex: 5,
  },
  radarPeerDotLabel: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "800",
  },
  rangeLabelInner: {
    position: "absolute",
    top: 115,
    fontSize: 9,
    color: PALETTE.textMuted,
  },
  rangeLabelMid: {
    position: "absolute",
    top: 75,
    fontSize: 9,
    color: PALETTE.textMuted,
  },
  rangeLabelOuter: {
    position: "absolute",
    top: 25,
    fontSize: 9,
    color: PALETTE.textMuted,
  },
  radarFooter: {
    flexDirection: "row",
    borderTopWidth: 1,
    paddingTop: 12,
    marginTop: 6,
  },
  radarStatItem: {
    flex: 1,
    alignItems: "center",
  },
  statNumber: {
    fontSize: 14,
    fontWeight: "700",
    color: PALETTE.primary,
  },
  statLabel: {
    fontSize: 10,
    color: PALETTE.textMuted,
    marginTop: 2,
  },
  directionHudCard: {
    borderRadius: 14,
    borderWidth: 1.5,
    padding: 14,
    marginBottom: 16,
  },
  hudHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  hudTitle: {
    fontSize: 13.5,
    fontWeight: "700",
    flex: 1,
    marginLeft: 8,
  },
  hudBody: {
    flexDirection: "row",
    alignItems: "center",
  },
  hudCompassCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(229, 169, 60, 0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  hudDistanceText: {
    fontSize: 13,
  },
  hudBearingText: {
    fontSize: 11,
    color: PALETTE.textMuted,
    marginTop: 2,
  },
  hudAdviceText: {
    fontSize: 10.5,
    color: PALETTE.textMuted,
    marginTop: 3,
    fontStyle: "italic",
  },
  sectionHeading: {
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 10,
  },
  peerCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 10,
  },
  peerAvatarWrapper: {
    position: "relative",
  },
  peerAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
  },
  peerStatusBadge: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: "#FFFFFF",
  },
  peerMainInfo: {
    flex: 1,
    marginLeft: 12,
  },
  peerNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  peerName: {
    fontSize: 13.5,
    fontWeight: "600",
  },
  roleTagGuide: {
    backgroundColor: "rgba(229, 169, 60, 0.15)",
    color: PALETTE.primary,
    fontSize: 9,
    fontWeight: "800",
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  roleTagMedic: {
    backgroundColor: "rgba(16, 185, 129, 0.15)",
    color: PALETTE.emerald,
    fontSize: 9,
    fontWeight: "800",
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  peerCoordsText: {
    fontSize: 11,
    color: PALETTE.textMuted,
    marginTop: 3,
  },
  peerStatsRight: {
    alignItems: "flex-end",
  },
  distanceBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(229, 169, 60, 0.1)",
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
    gap: 3,
  },
  distanceText: {
    fontSize: 11.5,
    fontWeight: "700",
    color: PALETTE.primary,
  },
  batteryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    marginTop: 4,
  },
  batteryText: {
    fontSize: 10,
    color: PALETTE.textMuted,
  },
  chatWrapper: {
    flex: 1,
  },
  tacticalChipsContainer: {
    borderBottomWidth: 1,
    paddingVertical: 8,
  },
  tacticalScroll: {
    paddingHorizontal: 16,
    gap: 8,
  },
  tacticalChip: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
  },
  tacticalChipText: {
    fontSize: 11.5,
    fontWeight: "500",
  },
  messageFeed: {
    flex: 1,
  },
  messageRow: {
    marginBottom: 10,
    flexDirection: "row",
  },
  messageRowSelf: {
    justifyContent: "flex-end",
  },
  messageRowPeer: {
    justifyContent: "flex-start",
  },
  messageBubble: {
    maxWidth: "80%",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  bubbleSelf: {},
  bubblePeer: {
    borderWidth: 1,
  },
  bubbleUrgent: {
    borderWidth: 1.5,
    borderColor: PALETTE.danger,
    backgroundColor: "rgba(239, 68, 68, 0.08)",
  },
  msgHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 3,
  },
  msgSenderName: {
    fontSize: 11,
    fontWeight: "700",
  },
  msgTime: {
    fontSize: 9.5,
    marginLeft: 8,
  },
  msgText: {
    fontSize: 13,
    lineHeight: 18,
  },
  msgTextUrgent: {
    fontWeight: "600",
  },
  msgFooterRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 4,
  },
  msgHops: {
    fontSize: 9.5,
  },
  inputBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: 1,
    gap: 8,
  },
  urgentToggleBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "transparent",
  },
  chatInput: {
    flex: 1,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 14,
    fontSize: 13,
  },
  sendButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  sosCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 18,
    marginBottom: 16,
  },
  sosCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },
  sosIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "rgba(239, 68, 68, 0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  sosMainTitle: {
    fontSize: 16,
    fontWeight: "800",
  },
  sosMainSubtitle: {
    fontSize: 11,
    color: PALETTE.textMuted,
    marginTop: 2,
    lineHeight: 15,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 8,
  },
  typeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  typePill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    gap: 6,
  },
  typePillText: {
    fontSize: 11.5,
    fontWeight: "600",
  },
  notesInput: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 10,
    fontSize: 12,
    textAlignVertical: "top",
  },
  sliderContainer: {
    marginTop: 20,
    marginBottom: 8,
  },
  sliderTrack: {
    height: 52,
    backgroundColor: "rgba(239, 68, 68, 0.15)",
    borderRadius: 26,
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.3)",
  },
  sliderTrackText: {
    color: PALETTE.danger,
    fontSize: 11.5,
    fontWeight: "800",
    letterSpacing: 0.6,
  },
  sliderThumb: {
    position: "absolute",
    left: 4,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: PALETTE.danger,
    alignItems: "center",
    justifyContent: "center",
    elevation: 4,
  },
  gloveFallbackBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    gap: 6,
    marginTop: 4,
  },
  gloveFallbackText: {
    fontSize: 11,
    color: PALETTE.danger,
    fontWeight: "600",
  },
  sliderDisclaimer: {
    fontSize: 10.5,
    color: PALETTE.textMuted,
    textAlign: "center",
    lineHeight: 14,
    marginTop: 6,
  },
  relaySyncCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  relayTitle: {
    fontSize: 13,
    fontWeight: "700",
  },
  relaySubtitle: {
    fontSize: 10.5,
    color: PALETTE.textMuted,
    marginTop: 2,
  },
  syncNowBtn: {
    backgroundColor: "rgba(229, 169, 60, 0.15)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    marginLeft: 10,
  },
  syncNowText: {
    color: PALETTE.primary,
    fontSize: 11,
    fontWeight: "700",
  },
  trailHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  addPinBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: PALETTE.primary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    gap: 4,
  },
  addPinText: {
    color: "#FFFFFF",
    fontSize: 11.5,
    fontWeight: "700",
  },
  checkpointCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 10,
  },
  cpIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  cpMainInfo: {
    flex: 1,
    marginLeft: 12,
  },
  cpTitle: {
    fontSize: 13,
    fontWeight: "700",
  },
  cpDescText: {
    fontSize: 11,
    color: PALETTE.textMuted,
    marginTop: 2,
  },
  cpCoordsText: {
    fontSize: 10,
    color: PALETTE.textMuted,
    marginTop: 3,
  },
  cpBearingBox: {
    alignItems: "center",
    marginLeft: 8,
  },
  cpDistText: {
    fontSize: 11,
    fontWeight: "700",
    color: PALETTE.primary,
    marginTop: 2,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  modalBox: {
    width: "100%",
    borderRadius: 16,
    padding: 20,
    elevation: 6,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: "700",
  },
  modalSubtitle: {
    fontSize: 11.5,
    color: PALETTE.textMuted,
    marginTop: 4,
    lineHeight: 16,
  },
  modalFieldLabel: {
    fontSize: 12,
    fontWeight: "600",
    marginTop: 14,
    marginBottom: 6,
  },
  modalInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
  },
  pinTypeSelector: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 4,
  },
  pinTypePill: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  pinTypePillText: {
    fontSize: 10,
    fontWeight: "700",
    color: PALETTE.textMuted,
  },
  modalActionRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 18,
  },
  modalCancelBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  modalCancelText: {
    fontSize: 12.5,
    fontWeight: "600",
  },
  modalSubmitBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  modalSubmitText: {
    color: "#FFFFFF",
    fontSize: 12.5,
    fontWeight: "700",
  },
});

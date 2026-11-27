import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  Alert,
  StyleSheet,
  Linking,
  Share,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRiderStore } from "@/store/riderStore";
import { RIDER_COLORS, RiderSectionCard } from "@/features/rider/components/RiderDesignSystem";

export const RiderSafetyView: React.FC = () => {
  const safetySession = useRiderStore((s) => s.safetySession);
  const currentLocation = useRiderStore((s) => s.currentLocation);
  const triggerSOS = useRiderStore((s) => s.triggerSOS);
  const startNightSafetyTimer = useRiderStore((s) => s.startNightSafetyTimer);
  const confirmSafetyCheckIn = useRiderStore((s) => s.confirmSafetyCheckIn);
  const stopNightSafetyTimer = useRiderStore((s) => s.stopNightSafetyTimer);

  const [contactName, setContactName] = useState(
    safetySession.trustedContactName || "Emergency Contact"
  );
  const [contactPhone, setContactPhone] = useState(
    safetySession.trustedContactPhone || "01711000000"
  );
  const [countdownLabel, setCountdownLabel] = useState("--:--");
  const [alerting, setAlerting] = useState(false);

  useEffect(() => {
    const updateClock = () => {
      if (!safetySession.active || !safetySession.nextCheckInAt) {
        setCountdownLabel("Inactive");
        return;
      }
      const diffSec = Math.max(
        0,
        Math.floor((safetySession.nextCheckInAt - Date.now()) / 1000)
      );
      const mins = Math.floor(diffSec / 60);
      const secs = diffSec % 60;
      setCountdownLabel(
        `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`
      );
    };
    updateClock();
    const id = setInterval(updateClock, 1000);
    return () => clearInterval(id);
  }, [safetySession.active, safetySession.nextCheckInAt]);

  const handleTriggerSOS = () => {
    Alert.alert(
      "CONFIRM EMERGENCY SOS",
      "Transmit live GPS coordinates, plate details, and safety beacon link to Bangladesh 999 Safety Network & your trusted contact?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "DISPATCH SOS NOW",
          style: "destructive",
          onPress: async () => {
            setAlerting(true);
            const res = await triggerSOS("Rider triggered SOS via Safety Shield");
            setAlerting(false);
            Alert.alert(
              res.success ? "SOS Dispatched" : "SOS Queued Offline",
              `Live safety beacon URL: ${res.shareLink}`
            );
          },
        },
      ]
    );
  };

  const handleStartTimer = (intervalMinutes: number) => {
    const cleanPhone = contactPhone.trim();
    if (cleanPhone.length < 11) {
      Alert.alert("Trusted Phone Needed", "Enter an 11-digit trusted phone number first.");
      return;
    }
    startNightSafetyTimer(
      intervalMinutes,
      contactName.trim() || "Family Contact",
      cleanPhone
    );
    Alert.alert(
      "Night Check-In Armed",
      `Safety check-in timer set for every ${intervalMinutes} minutes.`
    );
  };

  const handleShareLiveBeacon = async () => {
    const shareUrl =
      safetySession.liveShareUrl ||
      `https://shopnojatra.com/safety/live?lat=${currentLocation.latitude.toFixed(
        5
      )}&lng=${currentLocation.longitude.toFixed(5)}`;
    try {
      await Share.share({
        message: `ShopnoJatra Rider Live Safety Tracking Link: ${shareUrl}`,
      });
    } catch {
      Alert.alert("Live Beacon URL", shareUrl);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* 1-Tap SOS Card */}
        <View style={styles.sosCard}>
          <Ionicons name="warning" size={38} color="#FFFFFF" />
          <Text style={styles.sosHeader}>RIDER SAFETY SHIELD</Text>
          <Text style={styles.sosDescription}>
            1-Tap encrypted SOS dispatches your live GPS telemetry to Bangladesh 999 Emergency Services, ShopnoJatra Trust & Safety, and your emergency contact.
          </Text>

          <Pressable
            style={[styles.bigSosButton, { opacity: alerting ? 0.6 : 1 }]}
            onPress={handleTriggerSOS}
            disabled={alerting}
          >
            <Ionicons name="shield-half" size={22} color="#FFFFFF" />
            <Text style={styles.bigSosButtonText}>
              {alerting ? "TRANSMITTING SOS..." : "1-TAP EMERGENCY SOS"}
            </Text>
          </Pressable>

          {safetySession.liveShareUrl && (
            <Pressable style={styles.beaconBtn} onPress={handleShareLiveBeacon}>
              <Ionicons name="share-social-outline" size={16} color={RIDER_COLORS.gold} />
              <Text style={styles.beaconBtnText}>Share Active Live GPS Beacon</Text>
            </Pressable>
          )}
        </View>

        {/* Night Safety Check-In Timer */}
        <RiderSectionCard style={styles.sectionGap}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Night Safety Check-In Timer</Text>
            <View
              style={[
                styles.statusBadge,
                {
                  backgroundColor: safetySession.active
                    ? "rgba(245, 158, 11, 0.18)"
                    : "rgba(100, 116, 139, 0.18)",
                },
              ]}
            >
              <Text
                style={[
                  styles.statusBadgeText,
                  {
                    color: safetySession.active
                      ? RIDER_COLORS.amber
                      : RIDER_COLORS.textSecondary,
                  },
                ]}
              >
                {safetySession.active ? `DUE IN ${countdownLabel}` : "STANDBY"}
              </Text>
            </View>
          </View>

          {safetySession.active ? (
            <View style={styles.activeTimerBox}>
              <Text style={styles.timerHint}>
                Monitoring {safetySession.trustedContactName} ({safetySession.trustedContactPhone}) every {safetySession.intervalMinutes} mins.
              </Text>
              <View style={styles.timerBtnRow}>
                <Pressable style={styles.checkInBtn} onPress={confirmSafetyCheckIn}>
                  <Ionicons name="checkmark-circle" size={16} color="#FFFFFF" />
                  <Text style={styles.checkInBtnText}>I&apos;m Safe (Reset Timer)</Text>
                </Pressable>
                <Pressable style={styles.stopTimerBtn} onPress={stopNightSafetyTimer}>
                  <Text style={styles.stopTimerText}>Stop</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <View>
              <Text style={styles.timerHint}>
                Start an automated check-in loop during late-night shifts or highway trips:
              </Text>
              <View style={styles.intervalRow}>
                {[15, 30, 60].map((mins) => (
                  <Pressable
                    key={mins}
                    style={styles.intervalPill}
                    onPress={() => handleStartTimer(mins)}
                  >
                    <Text style={styles.intervalText}>Every {mins}m</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}
        </RiderSectionCard>

        {/* Trusted Contact Setup */}
        <RiderSectionCard style={styles.sectionGap}>
          <Text style={styles.sectionTitle}>Trusted Emergency Contact</Text>
          <Text style={styles.inputLabel}>Contact Name</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g., Karim Rahman (Brother)"
            placeholderTextColor={RIDER_COLORS.textMuted}
            value={contactName}
            onChangeText={setContactName}
          />
          <Text style={styles.inputLabel}>Bangladesh Mobile Number</Text>
          <TextInput
            style={styles.input}
            placeholder="017XXXXXXXX"
            placeholderTextColor={RIDER_COLORS.textMuted}
            keyboardType="phone-pad"
            value={contactPhone}
            onChangeText={setContactPhone}
          />
          <Pressable style={styles.shareNowBtn} onPress={handleShareLiveBeacon}>
            <Ionicons name="location-outline" size={16} color={RIDER_COLORS.info} />
            <Text style={styles.shareNowText}>Send Live Tracking Link to Contact</Text>
          </Pressable>
        </RiderSectionCard>

        {/* Direct Bangladesh Emergency Helplines */}
        <RiderSectionCard style={styles.sectionGap}>
          <Text style={styles.sectionTitle}>Bangladesh Emergency Helplines</Text>
          {[
            { label: "National Emergency Service", num: "999" },
            { label: "Bangladesh Tourist Police", num: "1322" },
            { label: "Fire Service & Civil Defence", num: "16163" },
          ].map((line) => (
            <Pressable
              key={line.num}
              style={styles.helplineRow}
              onPress={() => Linking.openURL(`tel:${line.num}`).catch(() => {})}
            >
              <View>
                <Text style={styles.helplineLabel}>{line.label}</Text>
                <Text style={styles.helplineNum}>Dial {line.num}</Text>
              </View>
              <Ionicons name="call" size={18} color={RIDER_COLORS.emerald} />
            </Pressable>
          ))}
        </RiderSectionCard>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: RIDER_COLORS.bg,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 36,
  },
  sectionGap: {
    marginBottom: 14,
  },
  sosCard: {
    backgroundColor: "rgba(239, 68, 68, 0.16)",
    borderWidth: 2,
    borderColor: RIDER_COLORS.danger,
    borderRadius: 16,
    padding: 18,
    alignItems: "center",
    marginBottom: 14,
  },
  sosHeader: {
    fontSize: 18,
    fontWeight: "900",
    color: "#FFFFFF",
    marginTop: 8,
  },
  sosDescription: {
    fontSize: 12,
    color: "#E2E8F0",
    textAlign: "center",
    marginVertical: 10,
    lineHeight: 18,
  },
  bigSosButton: {
    backgroundColor: RIDER_COLORS.danger,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    width: "100%",
  },
  bigSosButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "900",
  },
  beaconBtn: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  beaconBtnText: {
    color: RIDER_COLORS.gold,
    fontSize: 12,
    fontWeight: "700",
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: RIDER_COLORS.textPrimary,
    marginBottom: 8,
  },
  statusBadge: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: "800",
  },
  activeTimerBox: {
    backgroundColor: "rgba(245, 158, 11, 0.1)",
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: RIDER_COLORS.amber,
  },
  timerHint: {
    fontSize: 12,
    color: RIDER_COLORS.textSecondary,
    marginBottom: 10,
    lineHeight: 17,
  },
  timerBtnRow: {
    flexDirection: "row",
    gap: 8,
  },
  checkInBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: RIDER_COLORS.emerald,
    paddingVertical: 10,
    borderRadius: 8,
  },
  checkInBtnText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "800",
  },
  stopTimerBtn: {
    paddingHorizontal: 14,
    justifyContent: "center",
    backgroundColor: RIDER_COLORS.surfaceDeep,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: RIDER_COLORS.border,
  },
  stopTimerText: {
    color: RIDER_COLORS.textSecondary,
    fontSize: 12,
    fontWeight: "700",
  },
  intervalRow: {
    flexDirection: "row",
    gap: 8,
  },
  intervalPill: {
    flex: 1,
    backgroundColor: RIDER_COLORS.surfaceDeep,
    borderWidth: 1,
    borderColor: RIDER_COLORS.border,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: "center",
  },
  intervalText: {
    fontSize: 12,
    fontWeight: "700",
    color: RIDER_COLORS.textPrimary,
  },
  inputLabel: {
    fontSize: 12,
    color: RIDER_COLORS.textSecondary,
    marginBottom: 5,
  },
  input: {
    backgroundColor: RIDER_COLORS.surfaceDeep,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: RIDER_COLORS.border,
    color: RIDER_COLORS.textPrimary,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    marginBottom: 10,
  },
  shareNowBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "rgba(59, 130, 246, 0.16)",
    borderWidth: 1,
    borderColor: RIDER_COLORS.info,
    borderRadius: 8,
    paddingVertical: 10,
  },
  shareNowText: {
    color: "#93C5FD",
    fontSize: 12,
    fontWeight: "800",
  },
  helplineRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: RIDER_COLORS.border,
  },
  helplineLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: RIDER_COLORS.textPrimary,
  },
  helplineNum: {
    fontSize: 11,
    color: RIDER_COLORS.emerald,
    marginTop: 2,
  },
});

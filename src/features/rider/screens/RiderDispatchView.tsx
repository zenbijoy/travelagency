import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TextInput,
  Pressable,
  Alert,
  Modal,
  StyleSheet,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRiderStore } from "@/store/riderStore";
import { DispatchRadarCard } from "@/features/rider/components/DispatchRadarCard";
import { RiderMapHUD } from "@/features/rider/components/RiderMapHUD";
import { RIDER_COLORS, RiderSectionCard } from "@/features/rider/components/RiderDesignSystem";
import { formatPaisaBDT } from "@/features/rider/calculators";
import { DemandHotspotZone, OfflineMapPackStatus, RideRequest } from "@/features/rider/types";

export const RiderDispatchView: React.FC = () => {
  const dutyStatus = useRiderStore((s) => s.dutyStatus);
  const activeVehicleMode = useRiderStore((s) => s.activeVehicleMode);
  const openRideRequests = useRiderStore((s) => s.openRideRequests);
  const activeRideTrip = useRiderStore((s) => s.activeRideTrip);
  const currentLocation = useRiderStore((s) => s.currentLocation);
  const demandHotspots = useRiderStore((s) => s.demandHotspots);
  const offlineMapPacks = useRiderStore((s) => s.offlineMapPacks);
  const etaMinutes = useRiderStore((s) => s.etaMinutes);
  const tripDistanceKm = useRiderStore((s) => s.tripDistanceKm);

  const toggleDutyStatus = useRiderStore((s) => s.toggleDutyStatus);
  const refreshDispatchRadar = useRiderStore((s) => s.refreshDispatchRadar);
  const claimRideRequest = useRiderStore((s) => s.claimRideRequest);
  const declineRideRequest = useRiderStore((s) => s.declineRideRequest);
  const verifyTripOtp = useRiderStore((s) => s.verifyTripOtp);
  const completeActiveRideTrip = useRiderStore((s) => s.completeActiveRideTrip);
  const downloadOfflinePack = useRiderStore((s) => s.downloadOfflinePack);
  const recordGpsTelemetry = useRiderStore((s) => s.recordGpsTelemetry);
  const triggerSOS = useRiderStore((s) => s.triggerSOS);

  const [refreshing, setRefreshing] = useState(false);
  const [otpModalVisible, setOtpModalVisible] = useState(false);
  const [otpInput, setOtpInput] = useState("");
  const [completeModalVisible, setCompleteModalVisible] = useState(false);
  const [tipInputBdt, setTipInputBdt] = useState("0");
  const [busy, setBusy] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await refreshDispatchRadar();
    setRefreshing(false);
  };

  const handleAcceptRequest = async (req: RideRequest) => {
    setBusy(true);
    try {
      const trip = await claimRideRequest(req);
      const otpHintText = trip.start_otp_preview
        ? ` Demo passenger OTP: ${trip.start_otp_preview}`
        : "";
      Alert.alert(
        "Dispatch Accepted",
        `Head to ${req.pickup_address}. Enter passenger OTP at pickup.${otpHintText}`
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Could not claim ride request.";
      Alert.alert("Claim Failed", msg);
    } finally {
      setBusy(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!activeRideTrip) return;
    if (otpInput.trim().length < 4) {
      Alert.alert("Invalid OTP", "Enter the 4-6 digit passenger start OTP.");
      return;
    }
    setBusy(true);
    try {
      const result = await verifyTripOtp(
        activeRideTrip.id,
        otpInput.trim(),
        "ride_start",
        activeRideTrip.start_otp_preview
      );
      if (result.verified) {
        setOtpModalVisible(false);
        setOtpInput("");
        Alert.alert("Trip Started", "OTP verified. Turn-by-turn navigation is active.");
      } else {
        Alert.alert("OTP Mismatch", result.message);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to verify OTP.";
      Alert.alert("OTP Error", msg);
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmCompletion = async () => {
    if (!activeRideTrip) return;
    setBusy(true);
    try {
      const tipBdt = parseFloat(tipInputBdt) || 0;
      const tipPaisa = Math.max(0, Math.round(tipBdt * 100));
      await completeActiveRideTrip(tipPaisa);
      setCompleteModalVisible(false);
      setTipInputBdt("0");
      Alert.alert("Trip Settled", "Fare and net profit credited to your ledger.");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Settlement error.";
      Alert.alert("Error", msg);
    } finally {
      setBusy(false);
    }
  };

  const handleSelectHotspot = async (zone: DemandHotspotZone) => {
    const res = await recordGpsTelemetry({
      latitude: zone.latitude,
      longitude: zone.longitude,
      speedKmh: 28,
      heading: 45,
      accuracyMeters: 8,
    });
    if (res.accepted) {
      Alert.alert(
        zone.name,
        `${zone.activeRequests} active requests • ${zone.surgeMultiplier.toFixed(2)}x Fair Surge (${zone.peakWindow})`
      );
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={RIDER_COLORS.emerald}
          />
        }
      >
        {/* Active Trip Banner & Lifecycle */}
        {activeRideTrip && (
          <View style={styles.activeTripCard}>
            <View style={styles.activeHeader}>
              <View>
                <Text style={styles.activeBadgeText}>
                  ACTIVE RIDE • {activeRideTrip.status.toUpperCase()}
                </Text>
                <Text style={styles.activeSubText}>
                  {activeRideTrip.passenger_rating ? `Passenger ★ ${activeRideTrip.passenger_rating}` : "Verified Passenger"}
                </Text>
              </View>
              <Text style={styles.activeFareText}>
                {formatPaisaBDT(activeRideTrip.gross_fare_paisa)}
              </Text>
            </View>

            <View style={styles.routeBox}>
              <View style={styles.routePoint}>
                <Ionicons name="radio-button-on" size={14} color={RIDER_COLORS.emerald} />
                <Text style={styles.routeAddress} numberOfLines={1}>
                  {activeRideTrip.request?.pickup_address || "Pickup Point"}
                </Text>
              </View>
              <View style={styles.routeDivider} />
              <View style={styles.routePoint}>
                <Ionicons name="location" size={14} color={RIDER_COLORS.danger} />
                <Text style={styles.routeAddress} numberOfLines={1}>
                  {activeRideTrip.request?.dropoff_address || "Destination"}
                </Text>
              </View>
            </View>

            {activeRideTrip.start_otp_preview && !activeRideTrip.otp_verified && (
              <Text style={styles.otpHintLabel}>
                Passenger OTP Preview (Testing/Support): {activeRideTrip.start_otp_preview}
              </Text>
            )}

            <View style={styles.tripActionsRow}>
              {!activeRideTrip.otp_verified ? (
                <Pressable
                  style={[styles.primaryActionBtn, { backgroundColor: RIDER_COLORS.emerald }]}
                  onPress={() => setOtpModalVisible(true)}
                >
                  <Ionicons name="key-outline" size={18} color="#FFFFFF" />
                  <Text style={styles.actionBtnText}>Enter Start OTP</Text>
                </Pressable>
              ) : (
                <Pressable
                  style={[styles.primaryActionBtn, { backgroundColor: RIDER_COLORS.info }]}
                  onPress={() => setCompleteModalVisible(true)}
                >
                  <Ionicons name="checkmark-done-circle" size={18} color="#FFFFFF" />
                  <Text style={styles.actionBtnText}>Complete & Settle Trip</Text>
                </Pressable>
              )}

              <Pressable
                style={styles.sosMiniBtn}
                onPress={async () => {
                  const res = await triggerSOS("SOS pressed during active ride");
                  Alert.alert("SOS Sent", `Emergency link shared: ${res.shareLink}`);
                }}
              >
                <Ionicons name="warning" size={18} color="#FFFFFF" />
              </Pressable>
            </View>
          </View>
        )}

        {/* Interactive Spatial Map + Turn HUD */}
        <View style={styles.mapWrap}>
          <RiderMapHUD
            riderLocation={currentLocation}
            pickup={
              activeRideTrip?.request
                ? {
                    lat: activeRideTrip.request.pickup_lat,
                    lng: activeRideTrip.request.pickup_lng,
                    label: activeRideTrip.request.pickup_address,
                  }
                : null
            }
            dropoff={
              activeRideTrip?.request
                ? {
                    lat: activeRideTrip.request.dropoff_lat,
                    lng: activeRideTrip.request.dropoff_lng,
                    label: activeRideTrip.request.dropoff_address,
                  }
                : null
            }
            vehicleMode={activeVehicleMode}
            hotspots={demandHotspots}
            offlinePacks={offlineMapPacks}
            etaMinutes={etaMinutes}
            distanceKm={tripDistanceKm}
            height={270}
            onSelectHotspot={handleSelectHotspot}
          />
        </View>

        {/* Live Dispatch Radar */}
        <RiderSectionCard style={styles.sectionGap}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>
              Live Dispatch Radar ({openRideRequests.length})
            </Text>
            <Pressable
              style={[
                styles.dutyChip,
                {
                  backgroundColor:
                    dutyStatus === "offline"
                      ? "rgba(239, 68, 68, 0.16)"
                      : "rgba(16, 185, 129, 0.16)",
                },
              ]}
              onPress={toggleDutyStatus}
            >
              <Text
                style={[
                  styles.dutyChipText,
                  {
                    color:
                      dutyStatus === "offline" ? "#FCA5A5" : RIDER_COLORS.emerald,
                  },
                ]}
              >
                {dutyStatus === "offline" ? "GO ONLINE" : "RADAR LIVE"}
              </Text>
            </Pressable>
          </View>

          {dutyStatus === "offline" ? (
            <View style={styles.emptyBox}>
              <Ionicons name="power" size={32} color={RIDER_COLORS.textMuted} />
              <Text style={styles.emptyTitle}>Radar is Offline</Text>
              <Text style={styles.emptySub}>
                Tap GO ONLINE above to receive incoming passenger ride dispatches.
              </Text>
            </View>
          ) : openRideRequests.length === 0 ? (
            <View style={styles.emptyBox}>
              <Ionicons name="radio" size={32} color={RIDER_COLORS.emerald} />
              <Text style={styles.emptyTitle}>Scanning Nearby Corridors...</Text>
              <Text style={styles.emptySub}>
                Pull down to refresh or reposition toward a demand zone below.
              </Text>
            </View>
          ) : (
            openRideRequests.map((req: RideRequest) => (
              <DispatchRadarCard
                key={req.id}
                request={req}
                onAccept={handleAcceptRequest}
                onDecline={declineRideRequest}
                busy={busy}
              />
            ))
          )}
        </RiderSectionCard>

        {/* Offline Regional Map Packs */}
        <RiderSectionCard style={styles.sectionGap}>
          <Text style={styles.sectionTitle}>Offline Map Cache Packs</Text>
          <Text style={styles.packSubtitle}>
            Keep Dhaka, Chattogram, Cox&apos;s Bazar & Sylhet routing working even in low-network zones.
          </Text>
          {offlineMapPacks.map((pack: OfflineMapPackStatus) => (
            <View key={pack.id} style={styles.packRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.packName}>
                  {pack.name} ({pack.sizeMb} MB)
                </Text>
                <Text style={styles.packMeta}>
                  {pack.region} • v{pack.version} •{" "}
                  {pack.status === "cached" ? "Cached Offline" : `${pack.progressPct}%`}
                </Text>
              </View>
              <Pressable
                style={[
                  styles.packBtn,
                  pack.status === "cached" && styles.packBtnCached,
                ]}
                onPress={() => downloadOfflinePack(pack.id)}
              >
                <Ionicons
                  name={pack.status === "cached" ? "checkmark-circle" : "cloud-download-outline"}
                  size={15}
                  color={pack.status === "cached" ? RIDER_COLORS.emerald : "#FFFFFF"}
                />
                <Text
                  style={[
                    styles.packBtnText,
                    pack.status === "cached" && { color: RIDER_COLORS.emerald },
                  ]}
                >
                  {pack.status === "cached" ? "Ready" : "Cache"}
                </Text>
              </Pressable>
            </View>
          ))}
        </RiderSectionCard>
      </ScrollView>

      {/* Passenger OTP Verification Modal */}
      <Modal visible={otpModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Verify Passenger Start OTP</Text>
              <Pressable onPress={() => setOtpModalVisible(false)}>
                <Ionicons name="close" size={20} color={RIDER_COLORS.textSecondary} />
              </Pressable>
            </View>
            <Text style={styles.modalSub}>
              Enter the 4 to 6 digit security PIN displayed on the passenger&apos;s phone to start billing.
            </Text>
            <TextInput
              style={styles.otpInput}
              placeholder="0000"
              placeholderTextColor={RIDER_COLORS.textMuted}
              keyboardType="number-pad"
              maxLength={6}
              value={otpInput}
              onChangeText={setOtpInput}
              autoFocus
            />
            <Pressable
              style={[styles.modalSubmitBtn, { opacity: busy ? 0.6 : 1 }]}
              onPress={handleVerifyOtp}
              disabled={busy}
            >
              <Text style={styles.modalSubmitText}>
                {busy ? "Verifying..." : "Verify OTP & Begin Trip"}
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Complete & Settle Modal */}
      <Modal visible={completeModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Complete & Settle Trip</Text>
              <Pressable onPress={() => setCompleteModalVisible(false)}>
                <Ionicons name="close" size={20} color={RIDER_COLORS.textSecondary} />
              </Pressable>
            </View>
            <Text style={styles.modalSub}>
              Record any passenger cash/digital tip before posting the double-entry settlement.
            </Text>
            <Text style={styles.inputLabel}>Optional Tip (BDT)</Text>
            <TextInput
              style={styles.settleInput}
              placeholder="0"
              placeholderTextColor={RIDER_COLORS.textMuted}
              keyboardType="numeric"
              value={tipInputBdt}
              onChangeText={setTipInputBdt}
            />
            <Pressable
              style={[
                styles.modalSubmitBtn,
                { backgroundColor: RIDER_COLORS.info, opacity: busy ? 0.6 : 1 },
              ]}
              onPress={handleConfirmCompletion}
              disabled={busy}
            >
              <Text style={styles.modalSubmitText}>
                {busy ? "Finalizing..." : "Finalize Settlement"}
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
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
  mapWrap: {
    marginBottom: 14,
  },
  activeTripCard: {
    backgroundColor: RIDER_COLORS.surface,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: RIDER_COLORS.emerald,
    marginBottom: 14,
  },
  activeHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  activeBadgeText: {
    fontSize: 12,
    fontWeight: "800",
    color: RIDER_COLORS.emerald,
    letterSpacing: 0.5,
  },
  activeSubText: {
    fontSize: 11,
    color: RIDER_COLORS.textSecondary,
    marginTop: 2,
  },
  activeFareText: {
    fontSize: 18,
    fontWeight: "900",
    color: RIDER_COLORS.textPrimary,
  },
  routeBox: {
    backgroundColor: RIDER_COLORS.surfaceDeep,
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
  },
  routePoint: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  routeDivider: {
    height: 12,
    width: 1,
    backgroundColor: RIDER_COLORS.border,
    marginLeft: 6,
    marginVertical: 2,
  },
  routeAddress: {
    fontSize: 12,
    color: RIDER_COLORS.textPrimary,
    flex: 1,
  },
  otpHintLabel: {
    fontSize: 11,
    color: RIDER_COLORS.gold,
    fontWeight: "700",
    marginBottom: 8,
  },
  tripActionsRow: {
    flexDirection: "row",
    gap: 8,
  },
  primaryActionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: 10,
  },
  actionBtnText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "800",
  },
  sosMiniBtn: {
    width: 46,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: RIDER_COLORS.danger,
    borderRadius: 10,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: RIDER_COLORS.textPrimary,
  },
  dutyChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  dutyChipText: {
    fontSize: 11,
    fontWeight: "800",
  },
  emptyBox: {
    alignItems: "center",
    paddingVertical: 24,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: RIDER_COLORS.textPrimary,
    marginTop: 8,
  },
  emptySub: {
    fontSize: 12,
    color: RIDER_COLORS.textSecondary,
    textAlign: "center",
    marginTop: 4,
  },
  packSubtitle: {
    fontSize: 12,
    color: RIDER_COLORS.textSecondary,
    marginTop: 4,
    marginBottom: 10,
  },
  packRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: RIDER_COLORS.border,
  },
  packName: {
    fontSize: 13,
    fontWeight: "700",
    color: RIDER_COLORS.textPrimary,
  },
  packMeta: {
    fontSize: 11,
    color: RIDER_COLORS.textSecondary,
    marginTop: 2,
  },
  packBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: RIDER_COLORS.info,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  packBtnCached: {
    backgroundColor: "rgba(16, 185, 129, 0.15)",
  },
  packBtnText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "800",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.75)",
    justifyContent: "center",
    padding: 20,
  },
  modalContent: {
    backgroundColor: RIDER_COLORS.surface,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: RIDER_COLORS.border,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: RIDER_COLORS.textPrimary,
  },
  modalSub: {
    fontSize: 12,
    color: RIDER_COLORS.textSecondary,
    marginBottom: 14,
    lineHeight: 18,
  },
  otpInput: {
    backgroundColor: RIDER_COLORS.surfaceDeep,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: RIDER_COLORS.border,
    color: RIDER_COLORS.emerald,
    fontSize: 28,
    fontWeight: "800",
    textAlign: "center",
    letterSpacing: 10,
    paddingVertical: 12,
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 12,
    color: RIDER_COLORS.textSecondary,
    marginBottom: 6,
  },
  settleInput: {
    backgroundColor: RIDER_COLORS.surfaceDeep,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: RIDER_COLORS.border,
    color: RIDER_COLORS.textPrimary,
    fontSize: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 14,
  },
  modalSubmitBtn: {
    backgroundColor: RIDER_COLORS.emerald,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
  },
  modalSubmitText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
  },
});

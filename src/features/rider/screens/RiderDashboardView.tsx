import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  RefreshControl,
  StyleSheet,
  Alert,
  Modal,
  TextInput,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRiderStore } from "@/store/riderStore";
import {
  DutySwitchPill,
  KycBrtaBadge,
  VehicleModeSelector,
  DailyGoalRing,
  RiderSectionCard,
  RIDER_COLORS,
} from "@/features/rider/components/RiderDesignSystem";
import { RiderMapHUD } from "@/features/rider/components/RiderMapHUD";
import { formatPaisaBDT } from "@/features/rider/calculators";
import { VehicleMode } from "@/features/rider/types";

export type RiderPortalTab =
  | "index"
  | "dispatch"
  | "deliveries"
  | "earnings"
  | "safety"
  | "vehicle";

interface RiderDashboardViewProps {
  onNavigateTab?: (tab: RiderPortalTab) => void;
}

export const RiderDashboardView: React.FC<RiderDashboardViewProps> = ({
  onNavigateTab,
}) => {
  const [refreshing, setRefreshing] = useState(false);
  const [goalModalVisible, setGoalModalVisible] = useState(false);
  const [goalInputBdt, setGoalInputBdt] = useState("1800");

  const profile = useRiderStore((s) => s.profile);
  const vehicles = useRiderStore((s) => s.vehicles);
  const dutyStatus = useRiderStore((s) => s.dutyStatus);
  const activeVehicleMode = useRiderStore((s) => s.activeVehicleMode);
  const activeVehicle =
    vehicles.find((v) => v.vehicle_mode === activeVehicleMode) || vehicles[0] || null;
  const profitSummary = useRiderStore((s) => s.profitSummary);
  const activeRideTrip = useRiderStore((s) => s.activeRideTrip);
  const activeDeliveryJob = useRiderStore((s) => s.activeDeliveryJob);
  const openRideRequests = useRiderStore((s) => s.openRideRequests);
  const deliveryJobs = useRiderStore((s) => s.deliveryJobs);
  const currentLocation = useRiderStore((s) => s.currentLocation);
  const demandHotspots = useRiderStore((s) => s.demandHotspots);
  const offlineMapPacks = useRiderStore((s) => s.offlineMapPacks);
  const safetySession = useRiderStore((s) => s.safetySession);
  const etaMinutes = useRiderStore((s) => s.etaMinutes);
  const tripDistanceKm = useRiderStore((s) => s.tripDistanceKm);
  const isHydrated = useRiderStore((s) => s.isHydrated);

  const bootstrapRiderPortal = useRiderStore((s) => s.bootstrapRiderPortal);
  const toggleDutyStatus = useRiderStore((s) => s.toggleDutyStatus);
  const setVehicleMode = useRiderStore((s) => s.setVehicleMode);
  const setDailyGoalPaisa = useRiderStore((s) => s.setDailyGoalPaisa);
  const triggerSOS = useRiderStore((s) => s.triggerSOS);
  const refreshDispatchRadar = useRiderStore((s) => s.refreshDispatchRadar);

  useEffect(() => {
    if (!isHydrated) {
      bootstrapRiderPortal().catch(() => {});
    }
  }, [isHydrated, bootstrapRiderPortal]);

  const onRefresh = async () => {
    setRefreshing(true);
    await refreshDispatchRadar();
    setRefreshing(false);
  };

  const handleQuickSos = () => {
    Alert.alert(
      "EMERGENCY SOS",
      "Broadcast live GPS coordinates to Bangladesh 999 Safety Network & your trusted contact?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "BROADCAST SOS",
          style: "destructive",
          onPress: async () => {
            const res = await triggerSOS("Rider triggered SOS from Duty Dashboard");
            Alert.alert("SOS Dispatched", `Live tracking link shared: ${res.shareLink}`);
          },
        },
      ]
    );
  };

  const handleSaveGoal = async () => {
    const parsed = parseFloat(goalInputBdt);
    if (isNaN(parsed) || parsed < 300) {
      Alert.alert("Invalid Goal", "Please set a daily goal of at least ৳300.");
      return;
    }
    await setDailyGoalPaisa(Math.round(parsed * 100));
    setGoalModalVisible(false);
  };

  const goalLabel = formatPaisaBDT(profitSummary.dailyGoalPaisa || 180000);
  const currentLabel = formatPaisaBDT(profitSummary.todayNetPaisa || profitSummary.netTakeHomePaisa);

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
        {/* Header */}
        <View style={styles.headerRow}>
          <View style={{ flex: 1, marginRight: 12 }}>
            <Text style={styles.brandTitle}>ShopnoJatra Rider</Text>
            <Text style={styles.pilotSubtitle} numberOfLines={1}>
              {profile?.full_name || "Dhaka Mobility Partner"} •{" "}
              {activeVehicle?.plate_number || "BRTA Fleet"}
            </Text>
          </View>
          <Pressable
            style={styles.sosButton}
            onPress={handleQuickSos}
            accessibilityLabel="Emergency SOS button"
          >
            <Ionicons name="shield-half" size={16} color="#FFFFFF" />
            <Text style={styles.sosText}>SOS</Text>
          </Pressable>
        </View>

        {/* Duty & KYC Card */}
        <RiderSectionCard style={styles.sectionGap}>
          <View style={styles.dutyTop}>
            <DutySwitchPill dutyStatus={dutyStatus} onToggle={toggleDutyStatus} />
            <View style={styles.ratingBadge}>
              <Ionicons name="star" size={13} color={RIDER_COLORS.gold} />
              <Text style={styles.ratingText}>
                {(profile?.rating ?? 4.9).toFixed(2)}
              </Text>
            </View>
          </View>

          <View style={styles.kycWrap}>
            <KycBrtaBadge
              kycStatus={profile?.kyc_status || "verified"}
              brtaVerified={profile?.brta_verified ?? true}
            />
          </View>

          <View style={styles.vehicleSelectorWrap}>
            <Text style={styles.sectionSmallLabel}>ACTIVE VEHICLE MODE</Text>
            <VehicleModeSelector
              activeMode={activeVehicleMode}
              onSelect={(mode: VehicleMode) => setVehicleMode(mode)}
            />
          </View>
        </RiderSectionCard>

        {/* Active Trip or Active Parcel Banner */}
        {activeRideTrip && (
          <Pressable
            style={styles.activeBanner}
            onPress={() => onNavigateTab?.("dispatch")}
          >
            <Ionicons name="navigate-circle" size={26} color={RIDER_COLORS.emerald} />
            <View style={{ flex: 1 }}>
              <Text style={styles.activeBannerTitle}>
                ACTIVE RIDE ({activeRideTrip.status.toUpperCase()})
              </Text>
              <Text style={styles.activeBannerSub} numberOfLines={1}>
                {activeRideTrip.request?.dropoff_address || "Passenger Ride In Progress"}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={RIDER_COLORS.textSecondary} />
          </Pressable>
        )}

        {activeDeliveryJob && (
          <Pressable
            style={[styles.activeBanner, { borderColor: RIDER_COLORS.amber }]}
            onPress={() => onNavigateTab?.("deliveries")}
          >
            <Ionicons name="cube" size={24} color={RIDER_COLORS.amber} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.activeBannerTitle, { color: RIDER_COLORS.amber }]}>
                ACTIVE PARCEL ({activeDeliveryJob.job_reference})
              </Text>
              <Text style={styles.activeBannerSub} numberOfLines={1}>
                Drop: {activeDeliveryJob.dropoff_address}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={RIDER_COLORS.textSecondary} />
          </Pressable>
        )}

        {/* Map & Turn HUD Preview */}
        <View style={styles.sectionGap}>
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
            height={220}
          />
        </View>

        {/* Daily Goal Ring & Profit Snapshot */}
        <RiderSectionCard style={styles.sectionGap}>
          <View style={styles.goalHeaderRow}>
            <Text style={styles.cardTitle}>Today's Net Profit & Shift Goal</Text>
            <Pressable
              onPress={() => {
                setGoalInputBdt(String(Math.round((profitSummary.dailyGoalPaisa || 180000) / 100)));
                setGoalModalVisible(true);
              }}
            >
              <Text style={styles.editGoalLink}>Edit Goal</Text>
            </Pressable>
          </View>

          <View style={styles.goalBody}>
            <DailyGoalRing
              progressPct={profitSummary.dailyProgressPct}
              currentLabel={currentLabel}
              goalLabel={goalLabel}
              size={104}
            />
            <View style={styles.goalStatsCol}>
              <View style={styles.statRow}>
                <Text style={styles.statLabel}>Gross Fares:</Text>
                <Text style={styles.statValue}>
                  {formatPaisaBDT(profitSummary.grossEarningsPaisa)}
                </Text>
              </View>
              <View style={styles.statRow}>
                <Text style={styles.statLabel}>Fuel Estimate:</Text>
                <Text style={[styles.statValue, { color: RIDER_COLORS.amber }]}>
                  -{formatPaisaBDT(profitSummary.estimatedFuelCostPaisa)}
                </Text>
              </View>
              <View style={styles.statRow}>
                <Text style={styles.statLabel}>Completed:</Text>
                <Text style={styles.statValue}>
                  {profitSummary.tripCount} rides • {profitSummary.deliveryCount} parcels
                </Text>
              </View>
              <Pressable
                style={styles.quickCashoutBtn}
                onPress={() => onNavigateTab?.("earnings")}
              >
                <Ionicons name="wallet-outline" size={14} color={RIDER_COLORS.emerald} />
                <Text style={styles.quickCashoutText}>
                  Wallet: {formatPaisaBDT(profitSummary.availableForCashoutPaisa)} →
                </Text>
              </Pressable>
            </View>
          </View>
        </RiderSectionCard>

        {/* Quick Portal Modules Grid */}
        <View style={styles.actionGrid}>
          <Pressable
            style={styles.actionCard}
            onPress={() => onNavigateTab?.("dispatch")}
          >
            <View style={[styles.actionIconBox, { backgroundColor: "rgba(16, 185, 129, 0.15)" }]}>
              <Ionicons name="radio-outline" size={22} color={RIDER_COLORS.emerald} />
            </View>
            <Text style={styles.actionTitle}>Dispatch Radar</Text>
            <Text style={styles.actionCount}>{openRideRequests.length} incoming pings</Text>
          </Pressable>

          <Pressable
            style={styles.actionCard}
            onPress={() => onNavigateTab?.("deliveries")}
          >
            <View style={[styles.actionIconBox, { backgroundColor: "rgba(245, 158, 11, 0.15)" }]}>
              <Ionicons name="cube-outline" size={22} color={RIDER_COLORS.amber} />
            </View>
            <Text style={styles.actionTitle}>Local Parcels</Text>
            <Text style={styles.actionCount}>{deliveryJobs.length} market jobs</Text>
          </Pressable>

          <Pressable
            style={styles.actionCard}
            onPress={() => onNavigateTab?.("safety")}
          >
            <View style={[styles.actionIconBox, { backgroundColor: "rgba(59, 130, 246, 0.15)" }]}>
              <Ionicons name="shield-checkmark-outline" size={22} color={RIDER_COLORS.info} />
            </View>
            <Text style={styles.actionTitle}>Safety Shield</Text>
            <Text style={styles.actionCount}>
              {safetySession.active ? "Night Timer Active" : "Ready"}
            </Text>
          </Pressable>

          <Pressable
            style={styles.actionCard}
            onPress={() => onNavigateTab?.("vehicle")}
          >
            <View style={[styles.actionIconBox, { backgroundColor: "rgba(229, 169, 60, 0.15)" }]}>
              <Ionicons name="car-sport-outline" size={22} color={RIDER_COLORS.gold} />
            </View>
            <Text style={styles.actionTitle}>Vehicle & KYC</Text>
            <Text style={styles.actionCount}>
              {activeVehicle?.vehicle_mode.toUpperCase() || activeVehicleMode.toUpperCase()}
            </Text>
          </Pressable>
        </View>
      </ScrollView>

      {/* Daily Goal Edit Modal */}
      <Modal visible={goalModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Update Daily Net Goal (BDT)</Text>
            <TextInput
              style={styles.modalInput}
              keyboardType="numeric"
              value={goalInputBdt}
              onChangeText={setGoalInputBdt}
              placeholder="1800"
              placeholderTextColor={RIDER_COLORS.textMuted}
            />
            <View style={styles.modalActions}>
              <Pressable style={styles.modalCancel} onPress={() => setGoalModalVisible(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.modalSave} onPress={handleSaveGoal}>
                <Text style={styles.modalSaveText}>Save Goal</Text>
              </Pressable>
            </View>
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
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  brandTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: RIDER_COLORS.textPrimary,
    letterSpacing: -0.4,
  },
  pilotSubtitle: {
    fontSize: 12,
    color: RIDER_COLORS.textSecondary,
    marginTop: 2,
  },
  sosButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: RIDER_COLORS.danger,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    gap: 5,
  },
  sosText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "900",
  },
  dutyTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  ratingBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: RIDER_COLORS.surfaceDeep,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: RIDER_COLORS.border,
  },
  ratingText: {
    color: RIDER_COLORS.textPrimary,
    fontSize: 12,
    fontWeight: "800",
  },
  kycWrap: {
    marginBottom: 12,
  },
  vehicleSelectorWrap: {
    borderTopWidth: 1,
    borderTopColor: RIDER_COLORS.border,
    paddingTop: 10,
  },
  sectionSmallLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: RIDER_COLORS.textMuted,
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  activeBanner: {
    backgroundColor: "rgba(16, 185, 129, 0.12)",
    borderColor: RIDER_COLORS.emerald,
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 14,
  },
  activeBannerTitle: {
    fontSize: 12,
    fontWeight: "800",
    color: RIDER_COLORS.emerald,
  },
  activeBannerSub: {
    fontSize: 12,
    color: RIDER_COLORS.textPrimary,
    marginTop: 2,
  },
  goalHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: RIDER_COLORS.textPrimary,
  },
  editGoalLink: {
    fontSize: 12,
    fontWeight: "700",
    color: RIDER_COLORS.gold,
  },
  goalBody: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  goalStatsCol: {
    flex: 1,
    gap: 6,
  },
  statRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  statLabel: {
    fontSize: 12,
    color: RIDER_COLORS.textSecondary,
  },
  statValue: {
    fontSize: 12,
    fontWeight: "700",
    color: RIDER_COLORS.textPrimary,
  },
  quickCashoutBtn: {
    marginTop: 4,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(16, 185, 129, 0.12)",
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 8,
    alignSelf: "flex-start",
  },
  quickCashoutText: {
    fontSize: 12,
    fontWeight: "700",
    color: RIDER_COLORS.emerald,
  },
  actionGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: 12,
  },
  actionCard: {
    width: "48%",
    backgroundColor: RIDER_COLORS.surface,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: RIDER_COLORS.border,
  },
  actionIconBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  actionTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: RIDER_COLORS.textPrimary,
  },
  actionCount: {
    fontSize: 11,
    color: RIDER_COLORS.textSecondary,
    marginTop: 2,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    padding: 24,
  },
  modalCard: {
    backgroundColor: RIDER_COLORS.surface,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: RIDER_COLORS.border,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: RIDER_COLORS.textPrimary,
    marginBottom: 12,
  },
  modalInput: {
    backgroundColor: RIDER_COLORS.surfaceDeep,
    borderWidth: 1,
    borderColor: RIDER_COLORS.border,
    borderRadius: 10,
    color: RIDER_COLORS.textPrimary,
    fontSize: 18,
    fontWeight: "700",
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 14,
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
  },
  modalCancel: {
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  modalCancelText: {
    color: RIDER_COLORS.textSecondary,
    fontWeight: "700",
  },
  modalSave: {
    backgroundColor: RIDER_COLORS.emerald,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 8,
  },
  modalSaveText: {
    color: "#FFFFFF",
    fontWeight: "800",
  },
});

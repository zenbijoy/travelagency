import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  Modal,
  Alert,
  StyleSheet,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRiderStore } from "@/store/riderStore";
import {
  RIDER_COLORS,
  RiderSectionCard,
  KycBrtaBadge,
} from "@/features/rider/components/RiderDesignSystem";
import { VEHICLE_TIERS } from "@/features/rider/calculators";
import { FuelType, RiderVehicle, VehicleMode } from "@/features/rider/types";

const VEHICLE_MODES: VehicleMode[] = ["bike", "cng", "sedan", "suv", "boat", "parcel_rider"];
const FUEL_TYPES: FuelType[] = ["octane", "cng", "diesel", "electric", "human"];

export const RiderVehicleView: React.FC = () => {
  const profile = useRiderStore((s) => s.profile);
  const vehicles = useRiderStore((s) => s.vehicles);
  const activeVehicleMode = useRiderStore((s) => s.activeVehicleMode);
  const setVehicleMode = useRiderStore((s) => s.setVehicleMode);
  const addFleetVehicle = useRiderStore((s) => s.addFleetVehicle);
  const submitKyc = useRiderStore((s) => s.submitKyc);

  const [vehicleModalVisible, setVehicleModalVisible] = useState(false);
  const [makeModel, setMakeModel] = useState("");
  const [plateNumber, setPlateNumber] = useState("");
  const [vehicleMode, setNewVehicleMode] = useState<VehicleMode>("bike");
  const [fuelType, setFuelType] = useState<FuelType>("octane");
  const [busy, setBusy] = useState(false);

  const [kycModalVisible, setKycModalVisible] = useState(false);
  const [nidNumber, setNidNumber] = useState(profile?.nid_number || "");
  const [licenseNumber, setLicenseNumber] = useState(profile?.driving_license_number || "");
  const [homeCity, setHomeCity] = useState(profile?.home_city || "Dhaka");

  const handleAddVehicle = async () => {
    if (!makeModel.trim() || plateNumber.trim().length < 4) {
      Alert.alert("Missing Details", "Provide make/model and a valid BRTA plate number.");
      return;
    }
    const spec = VEHICLE_TIERS[vehicleMode];
    setBusy(true);
    try {
      await addFleetVehicle({
        vehicle_mode: vehicleMode,
        make_model: makeModel.trim(),
        plate_number: plateNumber.trim().toUpperCase(),
        registration_number: `BRTA-${plateNumber.trim().toUpperCase()}`,
        seat_capacity: spec.seats,
        max_cargo_kg: spec.maxCargoKg,
        fuel_type: fuelType,
        fuel_cost_per_km_bdt: spec.fuelCostPerKmBdt,
      });
      setVehicleModalVisible(false);
      setMakeModel("");
      setPlateNumber("");
      Alert.alert("Vehicle Registered", "Added to your BRTA fleet roster.");
    } catch (err: unknown) {
      Alert.alert("Error", err instanceof Error ? err.message : "Could not add vehicle.");
    } finally {
      setBusy(false);
    }
  };

  const handleSubmitKyc = async () => {
    if (nidNumber.trim().length < 10 || licenseNumber.trim().length < 5) {
      Alert.alert("KYC Validation", "Enter a valid NID (10-17 digits) and BRTA License Number.");
      return;
    }
    setBusy(true);
    try {
      await submitKyc({
        nidNumber: nidNumber.trim(),
        licenseNumber: licenseNumber.trim(),
        homeCity: homeCity.trim() || "Dhaka",
      });
      setKycModalVisible(false);
      Alert.alert("KYC Submitted", "NID & BRTA license updated and verified.");
    } catch (err: unknown) {
      Alert.alert("KYC Error", err instanceof Error ? err.message : "Failed to submit KYC.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* KYC & BRTA Compliance Overview */}
        <RiderSectionCard style={styles.sectionGap}>
          <View style={styles.kycTopRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.sectionTitle}>KYC & BRTA Compliance</Text>
              <Text style={styles.kycMeta}>
                NID: {profile?.nid_number || "Not submitted"} • License:{" "}
                {profile?.driving_license_number || "Not submitted"}
              </Text>
              <Text style={styles.kycMeta}>Home Hub: {profile?.home_city || "Dhaka"}</Text>
            </View>
            <Pressable style={styles.editKycBtn} onPress={() => setKycModalVisible(true)}>
              <Text style={styles.editKycText}>Update</Text>
            </Pressable>
          </View>
          <View style={{ marginTop: 10 }}>
            <KycBrtaBadge
              kycStatus={profile?.kyc_status || "pending"}
              brtaVerified={profile?.brta_verified ?? false}
            />
          </View>
        </RiderSectionCard>

        {/* Vehicle Fleet List */}
        <RiderSectionCard style={styles.sectionGap}>
          <View style={styles.fleetHeader}>
            <Text style={styles.sectionTitle}>Registered Vehicles ({vehicles.length})</Text>
            <Pressable
              style={styles.addBtnSmall}
              onPress={() => setVehicleModalVisible(true)}
            >
              <Ionicons name="add" size={16} color="#FFFFFF" />
              <Text style={styles.addBtnSmallText}>Add</Text>
            </Pressable>
          </View>

          {vehicles.map((v: RiderVehicle) => {
            const isActive = v.vehicle_mode === activeVehicleMode;
            const spec = VEHICLE_TIERS[v.vehicle_mode];
            return (
              <Pressable
                key={v.id}
                style={[styles.vehicleCard, isActive && styles.vehicleCardActive]}
                onPress={() => setVehicleMode(v.vehicle_mode)}
              >
                <View style={styles.vehicleIconBox}>
                  <Ionicons
                    name={spec.icon as keyof typeof Ionicons.glyphMap}
                    size={22}
                    color={isActive ? RIDER_COLORS.emerald : RIDER_COLORS.textSecondary}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={styles.vehicleTitleRow}>
                    <Text style={styles.vehicleModel}>{v.make_model}</Text>
                    {isActive && (
                      <View style={styles.activePill}>
                        <Text style={styles.activePillText}>ACTIVE</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.plateText}>{v.plate_number}</Text>
                  <Text style={styles.specsText}>
                    {spec.label} • {v.fuel_type.toUpperCase()} (৳{v.fuel_cost_per_km_bdt}/km) •{" "}
                    {v.seat_capacity} seats / {v.max_cargo_kg} kg
                  </Text>
                </View>
                <Ionicons
                  name={isActive ? "checkmark-circle" : "ellipse-outline"}
                  size={20}
                  color={isActive ? RIDER_COLORS.emerald : RIDER_COLORS.border}
                />
              </Pressable>
            );
          })}
        </RiderSectionCard>
      </ScrollView>

      {/* Register Vehicle Modal */}
      <Modal visible={vehicleModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Register New Vehicle</Text>
              <Pressable onPress={() => setVehicleModalVisible(false)}>
                <Ionicons name="close" size={20} color={RIDER_COLORS.textSecondary} />
              </Pressable>
            </View>

            <Text style={styles.inputLabel}>Make & Model</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g., Bajaj Pulsar 150 / Toyota Axio"
              placeholderTextColor={RIDER_COLORS.textMuted}
              value={makeModel}
              onChangeText={setMakeModel}
            />

            <Text style={styles.inputLabel}>BRTA Plate Number</Text>
            <TextInput
              style={styles.input}
              placeholder="DHAKA METRO-HA-24-8821"
              placeholderTextColor={RIDER_COLORS.textMuted}
              autoCapitalize="characters"
              value={plateNumber}
              onChangeText={setPlateNumber}
            />

            <Text style={styles.inputLabel}>Vehicle Mode</Text>
            <View style={styles.optionsWrap}>
              {VEHICLE_MODES.map((m) => (
                <Pressable
                  key={m}
                  style={[styles.chip, vehicleMode === m && styles.chipActive]}
                  onPress={() => setNewVehicleMode(m)}
                >
                  <Text style={[styles.chipText, vehicleMode === m && styles.chipTextActive]}>
                    {VEHICLE_TIERS[m].label}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.inputLabel}>Fuel Type</Text>
            <View style={styles.optionsWrap}>
              {FUEL_TYPES.map((f) => (
                <Pressable
                  key={f}
                  style={[styles.chip, fuelType === f && styles.chipActive]}
                  onPress={() => setFuelType(f)}
                >
                  <Text style={[styles.chipText, fuelType === f && styles.chipTextActive]}>
                    {f.toUpperCase()}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Pressable
              style={[styles.submitBtn, { opacity: busy ? 0.6 : 1 }]}
              onPress={handleAddVehicle}
              disabled={busy}
            >
              <Text style={styles.submitBtnText}>
                {busy ? "Saving..." : "Submit Vehicle to Fleet"}
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Update KYC Modal */}
      <Modal visible={kycModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Update NID & BRTA Credentials</Text>
              <Pressable onPress={() => setKycModalVisible(false)}>
                <Ionicons name="close" size={20} color={RIDER_COLORS.textSecondary} />
              </Pressable>
            </View>

            <Text style={styles.inputLabel}>Bangladesh NID Number</Text>
            <TextInput
              style={styles.input}
              placeholder="10 or 17 digit NID"
              placeholderTextColor={RIDER_COLORS.textMuted}
              keyboardType="number-pad"
              value={nidNumber}
              onChangeText={setNidNumber}
            />

            <Text style={styles.inputLabel}>BRTA Driving License No.</Text>
            <TextInput
              style={styles.input}
              placeholder="DK-2026-884210"
              placeholderTextColor={RIDER_COLORS.textMuted}
              value={licenseNumber}
              onChangeText={setLicenseNumber}
            />

            <Text style={styles.inputLabel}>Home Operating City</Text>
            <TextInput
              style={styles.input}
              placeholder="Dhaka / Chattogram / Cox's Bazar / Sylhet"
              placeholderTextColor={RIDER_COLORS.textMuted}
              value={homeCity}
              onChangeText={setHomeCity}
            />

            <Pressable
              style={[styles.submitBtn, { opacity: busy ? 0.6 : 1 }]}
              onPress={handleSubmitKyc}
              disabled={busy}
            >
              <Text style={styles.submitBtnText}>
                {busy ? "Submitting..." : "Verify & Save KYC"}
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
  kycTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: RIDER_COLORS.textPrimary,
    marginBottom: 4,
  },
  kycMeta: {
    fontSize: 12,
    color: RIDER_COLORS.textSecondary,
    marginTop: 2,
  },
  editKycBtn: {
    backgroundColor: RIDER_COLORS.surfaceDeep,
    borderWidth: 1,
    borderColor: RIDER_COLORS.border,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  editKycText: {
    color: RIDER_COLORS.gold,
    fontSize: 12,
    fontWeight: "700",
  },
  fleetHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  addBtnSmall: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: RIDER_COLORS.emerald,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  addBtnSmallText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "800",
  },
  vehicleCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: RIDER_COLORS.surfaceDeep,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: RIDER_COLORS.border,
    marginBottom: 10,
  },
  vehicleCardActive: {
    borderColor: RIDER_COLORS.emerald,
    backgroundColor: "rgba(16, 185, 129, 0.08)",
  },
  vehicleIconBox: {
    width: 42,
    height: 42,
    borderRadius: 10,
    backgroundColor: RIDER_COLORS.surface,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  vehicleTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  vehicleModel: {
    fontSize: 14,
    fontWeight: "800",
    color: RIDER_COLORS.textPrimary,
  },
  activePill: {
    backgroundColor: "rgba(16, 185, 129, 0.2)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  activePillText: {
    fontSize: 9,
    fontWeight: "900",
    color: RIDER_COLORS.emerald,
  },
  plateText: {
    fontSize: 12,
    fontWeight: "700",
    color: RIDER_COLORS.emerald,
    marginTop: 2,
  },
  specsText: {
    fontSize: 11,
    color: RIDER_COLORS.textSecondary,
    marginTop: 2,
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
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: "800",
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
    marginBottom: 12,
  },
  optionsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 12,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: RIDER_COLORS.surfaceDeep,
    borderWidth: 1,
    borderColor: RIDER_COLORS.border,
  },
  chipActive: {
    backgroundColor: "rgba(16, 185, 129, 0.16)",
    borderColor: RIDER_COLORS.emerald,
  },
  chipText: {
    fontSize: 11,
    color: RIDER_COLORS.textSecondary,
  },
  chipTextActive: {
    color: RIDER_COLORS.emerald,
    fontWeight: "800",
  },
  submitBtn: {
    backgroundColor: RIDER_COLORS.emerald,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 6,
  },
  submitBtnText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
  },
});

import React, { useRef, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  Modal,
  Alert,
  StyleSheet,
  PanResponder,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Svg, { Path } from "react-native-svg";
import * as ImagePicker from "expo-image-picker";
import { useRiderStore } from "@/store/riderStore";
import { RIDER_COLORS, RiderSectionCard } from "@/features/rider/components/RiderDesignSystem";
import { createDeterministicHash, formatPaisaBDT } from "@/features/rider/calculators";
import { BundledDeliveryBatch, DeliveryJob } from "@/features/rider/types";

export const RiderDeliveriesView: React.FC = () => {
  const deliveryJobs = useRiderStore((s) => s.deliveryJobs);
  const bundledBatches = useRiderStore((s) => s.bundledBatches);
  const activeDeliveryJob = useRiderStore((s) => s.activeDeliveryJob);

  const claimDeliveryJob = useRiderStore((s) => s.claimDeliveryJob);
  const claimDeliveryBatch = useRiderStore((s) => s.claimDeliveryBatch);
  const verifyTripOtp = useRiderStore((s) => s.verifyTripOtp);
  const submitDeliveryPOD = useRiderStore((s) => s.submitDeliveryPOD);

  const [selectedJob, setSelectedJob] = useState<DeliveryJob | null>(null);
  const [pickupModalVisible, setPickupModalVisible] = useState(false);
  const [pickupOtp, setPickupOtp] = useState("");
  const [podModalVisible, setPodModalVisible] = useState(false);
  const [recipientName, setRecipientName] = useState("");
  const [podOtp, setPodOtp] = useState("");
  const [signaturePaths, setSignaturePaths] = useState<string[]>([]);
  const [currentStroke, setCurrentStroke] = useState("");
  const [photoUri, setPhotoUri] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  const strokeRef = useRef("");

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        const { locationX, locationY } = evt.nativeEvent;
        const start = `M${locationX.toFixed(1)},${locationY.toFixed(1)}`;
        strokeRef.current = start;
        setCurrentStroke(start);
      },
      onPanResponderMove: (evt) => {
        const { locationX, locationY } = evt.nativeEvent;
        const next = `${strokeRef.current} L${locationX.toFixed(1)},${locationY.toFixed(1)}`;
        strokeRef.current = next;
        setCurrentStroke(next);
      },
      onPanResponderRelease: () => {
        if (strokeRef.current) {
          const completed = strokeRef.current;
          setSignaturePaths((prev) => [...prev, completed]);
          strokeRef.current = "";
          setCurrentStroke("");
        }
      },
    })
  ).current;

  const handleClaimSingle = async (job: DeliveryJob) => {
    setBusy(true);
    try {
      const claimed = await claimDeliveryJob(job);
      Alert.alert(
        "Parcel Claimed",
        `Proceed to pickup from ${claimed.pickup_contact_name}. Pickup OTP hint: ${
          claimed.pickup_otp_hint || "provided by seller"
        }`
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Could not claim parcel.";
      Alert.alert("Claim Failed", msg);
    } finally {
      setBusy(false);
    }
  };

  const handleClaimBatch = async (batch: BundledDeliveryBatch) => {
    setBusy(true);
    try {
      const jobs = await claimDeliveryBatch(batch);
      Alert.alert(
        "Bundled Route Claimed",
        `Claimed ${jobs.length} deliveries in ${batch.areaLabel} (+${formatPaisaBDT(
          batch.bonusPaisa
        )} route bonus).`
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Could not claim batch.";
      Alert.alert("Batch Claim Error", msg);
    } finally {
      setBusy(false);
    }
  };

  const handleVerifyPickupOtp = async () => {
    if (!selectedJob) return;
    if (pickupOtp.trim().length < 4) {
      Alert.alert("Invalid Pickup OTP", "Enter the 4-6 digit merchant pickup code.");
      return;
    }
    setBusy(true);
    try {
      const res = await verifyTripOtp(
        selectedJob.id,
        pickupOtp.trim(),
        "delivery_pickup",
        selectedJob.pickup_otp_hint
      );
      if (res.verified) {
        setPickupModalVisible(false);
        setPickupOtp("");
        Alert.alert("Pickup Verified", "Parcel marked IN TRANSIT to customer dropoff.");
      } else {
        Alert.alert("OTP Mismatch", res.message);
      }
    } catch (err: unknown) {
      Alert.alert("Error", err instanceof Error ? err.message : "Pickup verification failed.");
    } finally {
      setBusy(false);
    }
  };

  const handleAttachPhoto = async () => {
    try {
      const res = await ImagePicker.launchCameraAsync({
        quality: 0.6,
        allowsEditing: false,
      });
      if (!res.canceled && res.assets[0]?.uri) {
        setPhotoUri(res.assets[0].uri);
        return;
      }
    } catch {
      // Fallback to library picker if camera unavailable on web/simulator
      try {
        const lib = await ImagePicker.launchImageLibraryAsync({ quality: 0.6 });
        if (!lib.canceled && lib.assets[0]?.uri) {
          setPhotoUri(lib.assets[0].uri);
          return;
        }
      } catch {
        // Handled cleanly below
      }
    }
    Alert.alert("Photo Capture", "No photo selected from camera or library.");
  };

  const handleSubmitPod = async () => {
    if (!selectedJob) return;
    if (!recipientName.trim()) {
      Alert.alert("Recipient Required", "Enter the receiver's full name.");
      return;
    }
    if (podOtp.trim().length < 4) {
      Alert.alert("Delivery OTP Required", "Enter the 4-6 digit recipient delivery OTP.");
      return;
    }
    const combinedSvg = [...signaturePaths, currentStroke].filter(Boolean).join(" ");
    if (combinedSvg.length < 4) {
      Alert.alert("Signature Required", "Have the recipient sign inside the signature box.");
      return;
    }

    setBusy(true);
    try {
      const res = await submitDeliveryPOD(selectedJob, {
        jobId: selectedJob.id,
        deliveryOtp: podOtp.trim(),
        recipientName: recipientName.trim(),
        signatureSvgPath: combinedSvg,
        photoUri,
        photoCapturedAt: photoUri ? new Date().toISOString() : undefined,
      });
      if (res.verified) {
        setPodModalVisible(false);
        setSignaturePaths([]);
        setCurrentStroke("");
        setPhotoUri(undefined);
        Alert.alert(
          "Proof of Delivery Verified",
          `Hash ${createDeterministicHash(combinedSvg).slice(0, 10)} recorded. Payout credited!`
        );
      } else {
        Alert.alert("Incorrect Delivery OTP", "Verify the 4-digit delivery PIN with recipient.");
      }
    } catch (err: unknown) {
      Alert.alert("POD Error", err instanceof Error ? err.message : "Could not submit POD.");
    } finally {
      setBusy(false);
    }
  };

  const openPodModal = (job: DeliveryJob) => {
    setSelectedJob(job);
    setRecipientName(job.dropoff_contact_name || "");
    setPodOtp("");
    setSignaturePaths([]);
    setCurrentStroke("");
    setPhotoUri(undefined);
    setPodModalVisible(true);
  };

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Active Delivery Highlight */}
        {activeDeliveryJob && activeDeliveryJob.status !== "delivered" && (
          <RiderSectionCard style={{ marginBottom: 14, borderColor: RIDER_COLORS.amber }}>
            <View style={styles.jobHeader}>
              <View>
                <Text style={styles.activeLabel}>
                  ACTIVE PARCEL • {activeDeliveryJob.job_reference}
                </Text>
                <Text style={styles.merchantName}>
                  {activeDeliveryJob.package_summary}
                </Text>
              </View>
              <Text style={styles.jobPayout}>
                {formatPaisaBDT(activeDeliveryJob.rider_payout_paisa)}
              </Text>
            </View>
            <Text style={styles.locText}>Pickup: {activeDeliveryJob.pickup_address}</Text>
            <Text style={styles.locText}>Drop: {activeDeliveryJob.dropoff_address}</Text>
            {activeDeliveryJob.pickup_otp_hint && !activeDeliveryJob.pickup_otp_verified_at && (
              <Text style={styles.hintText}>
                Seller Pickup OTP Hint: {activeDeliveryJob.pickup_otp_hint}
              </Text>
            )}
            {activeDeliveryJob.delivery_otp_hint && (
              <Text style={styles.hintText}>
                Recipient Delivery OTP Hint: {activeDeliveryJob.delivery_otp_hint}
              </Text>
            )}

            <View style={styles.actionRow}>
              {!activeDeliveryJob.pickup_otp_verified_at &&
              activeDeliveryJob.status !== "picked_up" &&
              activeDeliveryJob.status !== "in_transit" ? (
                <Pressable
                  style={[styles.primaryBtn, { backgroundColor: RIDER_COLORS.amber }]}
                  onPress={() => {
                    setSelectedJob(activeDeliveryJob);
                    setPickupOtp("");
                    setPickupModalVisible(true);
                  }}
                >
                  <Ionicons name="key-outline" size={16} color="#0F172A" />
                  <Text style={[styles.primaryBtnText, { color: "#0F172A" }]}>
                    Verify Pickup OTP
                  </Text>
                </Pressable>
              ) : (
                <Pressable
                  style={[styles.primaryBtn, { backgroundColor: RIDER_COLORS.emerald }]}
                  onPress={() => openPodModal(activeDeliveryJob)}
                >
                  <Ionicons name="create-outline" size={16} color="#FFFFFF" />
                  <Text style={styles.primaryBtnText}>Capture POD (OTP + Signature)</Text>
                </Pressable>
              )}
            </View>
          </RiderSectionCard>
        )}

        {/* Bundled Multi-Stop Route Batches */}
        {bundledBatches.length > 0 && (
          <RiderSectionCard style={styles.sectionGap}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>
                Bundled Multi-Drop Routes ({bundledBatches.length})
              </Text>
              <View style={styles.batchTag}>
                <Text style={styles.batchTagText}>+BONUS PAYOUT</Text>
              </View>
            </View>
            {bundledBatches.map((batch: BundledDeliveryBatch) => (
              <View key={batch.batchId} style={styles.batchCard}>
                <View style={styles.jobHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.batchArea}>{batch.areaLabel}</Text>
                    <Text style={styles.batchMeta}>
                      {batch.stopCount} Stops • {batch.totalDistanceKm.toFixed(1)} km •{" "}
                      {batch.totalWeightKg.toFixed(1)} kg
                    </Text>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={styles.batchPayout}>
                      {formatPaisaBDT(batch.totalPayoutPaisa)}
                    </Text>
                    <Text style={styles.batchBonus}>
                      incl. {formatPaisaBDT(batch.bonusPaisa)} bonus
                    </Text>
                  </View>
                </View>

                <Pressable
                  style={[styles.primaryBtn, { backgroundColor: RIDER_COLORS.amber, marginTop: 10 }]}
                  onPress={() => handleClaimBatch(batch)}
                  disabled={busy}
                >
                  <Ionicons name="layers-outline" size={16} color="#0F172A" />
                  <Text style={[styles.primaryBtnText, { color: "#0F172A" }]}>
                    Claim {batch.stopCount}-Stop Bundle
                  </Text>
                </Pressable>
              </View>
            ))}
          </RiderSectionCard>
        )}

        {/* Marketplace & Concierge Parcel Queue */}
        <RiderSectionCard style={styles.sectionGap}>
          <Text style={styles.sectionTitle}>
            Local Marketplace Parcels ({deliveryJobs.length})
          </Text>
          {deliveryJobs.length === 0 ? (
            <View style={styles.emptyBox}>
              <Ionicons name="cube-outline" size={32} color={RIDER_COLORS.textMuted} />
              <Text style={styles.emptyText}>No parcels currently queued.</Text>
            </View>
          ) : (
            deliveryJobs.map((job: DeliveryJob) => {
              const isAssigned =
                job.status === "claimed" ||
                job.status === "en_route_pickup" ||
                job.status === "picked_up" ||
                job.status === "in_transit";
              const isDelivered = job.status === "delivered";

              return (
                <View key={job.id} style={styles.jobCard}>
                  <View style={styles.jobHeader}>
                    <View style={{ flex: 1, marginRight: 8 }}>
                      <Text style={styles.merchantName}>{job.package_summary}</Text>
                      <Text style={styles.packageMeta}>
                        {job.job_reference} • {job.delivery_tier.replace(/_/g, " ").toUpperCase()} •{" "}
                        {job.package_weight_kg} kg
                      </Text>
                    </View>
                    <Text style={styles.jobPayout}>
                      {formatPaisaBDT(job.rider_payout_paisa)}
                    </Text>
                  </View>

                  <View style={styles.tagsRow}>
                    {job.is_fragile && (
                      <View style={styles.tagPill}>
                        <Text style={styles.tagText}>FRAGILE</Text>
                      </View>
                    )}
                    {job.is_perishable && (
                      <View style={styles.tagPill}>
                        <Text style={styles.tagText}>PERISHABLE</Text>
                      </View>
                    )}
                    {job.cod_amount_paisa > 0 && (
                      <View style={[styles.tagPill, { backgroundColor: "rgba(59,130,246,0.16)" }]}>
                        <Text style={[styles.tagText, { color: "#93C5FD" }]}>
                          COD {formatPaisaBDT(job.cod_amount_paisa)}
                        </Text>
                      </View>
                    )}
                    {job.hotel_room_number && (
                      <View style={[styles.tagPill, { backgroundColor: "rgba(229,169,60,0.16)" }]}>
                        <Text style={[styles.tagText, { color: RIDER_COLORS.gold }]}>
                          Room {job.hotel_room_number}
                        </Text>
                      </View>
                    )}
                  </View>

                  <Text style={styles.locText} numberOfLines={1}>
                    From: {job.pickup_address}
                  </Text>
                  <Text style={styles.locText} numberOfLines={1}>
                    To: {job.dropoff_address}
                  </Text>

                  <View style={styles.actionRow}>
                    {isDelivered ? (
                      <View style={styles.deliveredBadge}>
                        <Ionicons name="checkmark-circle" size={16} color={RIDER_COLORS.emerald} />
                        <Text style={styles.deliveredText}>
                          Delivered ({job.pod_recipient_name || "Signed"})
                        </Text>
                      </View>
                    ) : isAssigned ? (
                      <Pressable
                        style={[styles.primaryBtn, { backgroundColor: RIDER_COLORS.emerald }]}
                        onPress={() => openPodModal(job)}
                      >
                        <Ionicons name="qr-code-outline" size={16} color="#FFFFFF" />
                        <Text style={styles.primaryBtnText}>Complete POD</Text>
                      </Pressable>
                    ) : (
                      <Pressable
                        style={[styles.primaryBtn, { backgroundColor: RIDER_COLORS.info }]}
                        onPress={() => handleClaimSingle(job)}
                        disabled={busy}
                      >
                        <Ionicons name="bicycle-outline" size={16} color="#FFFFFF" />
                        <Text style={styles.primaryBtnText}>Claim Parcel Job</Text>
                      </Pressable>
                    )}
                  </View>
                </View>
              );
            })
          )}
        </RiderSectionCard>
      </ScrollView>

      {/* Merchant Pickup OTP Modal */}
      <Modal visible={pickupModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Merchant Pickup Verification</Text>
              <Pressable onPress={() => setPickupModalVisible(false)}>
                <Ionicons name="close" size={20} color={RIDER_COLORS.textSecondary} />
              </Pressable>
            </View>
            <Text style={styles.modalSub}>
              Enter the pickup PIN from {selectedJob?.pickup_contact_name || "merchant"} to confirm custody.
            </Text>
            <TextInput
              style={styles.pinInput}
              placeholder="0000"
              placeholderTextColor={RIDER_COLORS.textMuted}
              keyboardType="number-pad"
              maxLength={6}
              value={pickupOtp}
              onChangeText={setPickupOtp}
            />
            <Pressable
              style={[styles.submitPodBtn, { backgroundColor: RIDER_COLORS.amber }]}
              onPress={handleVerifyPickupOtp}
              disabled={busy}
            >
              <Text style={[styles.submitPodText, { color: "#0F172A" }]}>
                Confirm Parcel Pickup
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Proof of Delivery (POD) Modal */}
      <Modal visible={podModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Proof of Delivery (POD)</Text>
              <Pressable onPress={() => setPodModalVisible(false)}>
                <Ionicons name="close" size={20} color={RIDER_COLORS.textSecondary} />
              </Pressable>
            </View>

            <Text style={styles.inputLabel}>Receiver Full Name</Text>
            <TextInput
              style={styles.textInput}
              placeholder="Receiver Name"
              placeholderTextColor={RIDER_COLORS.textMuted}
              value={recipientName}
              onChangeText={setRecipientName}
            />

            <Text style={styles.inputLabel}>Recipient 4-6 Digit Delivery OTP</Text>
            <TextInput
              style={styles.pinInput}
              placeholder="0000"
              placeholderTextColor={RIDER_COLORS.textMuted}
              keyboardType="number-pad"
              maxLength={6}
              value={podOtp}
              onChangeText={setPodOtp}
            />

            <View style={styles.sigHeaderRow}>
              <Text style={styles.inputLabel}>Recipient Signature (Draw below)</Text>
              <Pressable
                onPress={() => {
                  setSignaturePaths([]);
                  setCurrentStroke("");
                }}
              >
                <Text style={styles.clearLink}>Clear</Text>
              </Pressable>
            </View>

            <View style={styles.signaturePad} {...panResponder.panHandlers}>
              <Svg style={StyleSheet.absoluteFill}>
                {signaturePaths.map((d, i) => (
                  <Path
                    key={i}
                    d={d}
                    stroke="#34D399"
                    strokeWidth={2.5}
                    fill="none"
                    strokeLinecap="round"
                  />
                ))}
                {currentStroke ? (
                  <Path
                    d={currentStroke}
                    stroke="#34D399"
                    strokeWidth={2.5}
                    fill="none"
                    strokeLinecap="round"
                  />
                ) : null}
              </Svg>
              {signaturePaths.length === 0 && !currentStroke && (
                <Text style={styles.sigPlaceholder}>Sign here with finger</Text>
              )}
            </View>

            <Pressable style={styles.photoBtn} onPress={handleAttachPhoto}>
              <Ionicons name="camera-outline" size={16} color={RIDER_COLORS.gold} />
              <Text style={styles.photoBtnText}>
                {photoUri ? "Photo Proof Attached ✓" : "Attach Parcel Photo Proof (Optional)"}
              </Text>
            </Pressable>

            <Pressable
              style={[styles.submitPodBtn, { opacity: busy ? 0.6 : 1 }]}
              onPress={handleSubmitPod}
              disabled={busy}
            >
              <Text style={styles.submitPodText}>
                {busy ? "Verifying POD..." : "Verify POD & Release Payout"}
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
  batchTag: {
    backgroundColor: "rgba(245, 158, 11, 0.16)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  batchTagText: {
    fontSize: 10,
    fontWeight: "800",
    color: RIDER_COLORS.amber,
  },
  batchCard: {
    backgroundColor: RIDER_COLORS.surfaceDeep,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: RIDER_COLORS.amber,
    marginBottom: 10,
  },
  batchArea: {
    fontSize: 14,
    fontWeight: "800",
    color: RIDER_COLORS.textPrimary,
  },
  batchMeta: {
    fontSize: 11,
    color: RIDER_COLORS.textSecondary,
    marginTop: 2,
  },
  batchPayout: {
    fontSize: 16,
    fontWeight: "900",
    color: RIDER_COLORS.emerald,
  },
  batchBonus: {
    fontSize: 10,
    color: RIDER_COLORS.amber,
    fontWeight: "700",
  },
  jobCard: {
    backgroundColor: RIDER_COLORS.surfaceDeep,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: RIDER_COLORS.border,
    marginBottom: 10,
  },
  jobHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 6,
  },
  activeLabel: {
    fontSize: 11,
    fontWeight: "800",
    color: RIDER_COLORS.amber,
    marginBottom: 2,
  },
  merchantName: {
    fontSize: 14,
    fontWeight: "800",
    color: RIDER_COLORS.textPrimary,
  },
  packageMeta: {
    fontSize: 11,
    color: RIDER_COLORS.textSecondary,
    marginTop: 2,
  },
  jobPayout: {
    fontSize: 16,
    fontWeight: "900",
    color: RIDER_COLORS.emerald,
  },
  tagsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 6,
  },
  tagPill: {
    backgroundColor: "rgba(239, 68, 68, 0.16)",
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 5,
  },
  tagText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#FCA5A5",
  },
  locText: {
    fontSize: 12,
    color: RIDER_COLORS.textSecondary,
    marginBottom: 3,
  },
  hintText: {
    fontSize: 11,
    fontWeight: "700",
    color: RIDER_COLORS.gold,
    marginTop: 4,
  },
  actionRow: {
    marginTop: 8,
  },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 11,
    borderRadius: 10,
  },
  primaryBtnText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "800",
  },
  deliveredBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(16, 185, 129, 0.12)",
    padding: 8,
    borderRadius: 8,
  },
  deliveredText: {
    color: RIDER_COLORS.emerald,
    fontSize: 12,
    fontWeight: "700",
  },
  emptyBox: {
    alignItems: "center",
    paddingVertical: 24,
  },
  emptyText: {
    fontSize: 12,
    color: RIDER_COLORS.textSecondary,
    marginTop: 8,
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
    marginBottom: 10,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: RIDER_COLORS.textPrimary,
  },
  modalSub: {
    fontSize: 12,
    color: RIDER_COLORS.textSecondary,
    marginBottom: 12,
  },
  inputLabel: {
    fontSize: 12,
    color: RIDER_COLORS.textSecondary,
    marginBottom: 6,
  },
  textInput: {
    backgroundColor: RIDER_COLORS.surfaceDeep,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: RIDER_COLORS.border,
    color: RIDER_COLORS.textPrimary,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    marginBottom: 12,
  },
  pinInput: {
    backgroundColor: RIDER_COLORS.surfaceDeep,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: RIDER_COLORS.border,
    textAlign: "center",
    letterSpacing: 8,
    fontSize: 22,
    fontWeight: "800",
    color: RIDER_COLORS.emerald,
    paddingVertical: 10,
    marginBottom: 12,
  },
  sigHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  clearLink: {
    fontSize: 12,
    fontWeight: "700",
    color: RIDER_COLORS.amber,
  },
  signaturePad: {
    height: 110,
    backgroundColor: RIDER_COLORS.surfaceDeep,
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: RIDER_COLORS.border,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
    overflow: "hidden",
  },
  sigPlaceholder: {
    fontSize: 12,
    color: RIDER_COLORS.textMuted,
  },
  photoBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "rgba(229, 169, 60, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(229, 169, 60, 0.35)",
    borderRadius: 8,
    paddingVertical: 9,
    marginBottom: 12,
  },
  photoBtnText: {
    color: RIDER_COLORS.gold,
    fontSize: 12,
    fontWeight: "700",
  },
  submitPodBtn: {
    backgroundColor: RIDER_COLORS.emerald,
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: "center",
  },
  submitPodText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
  },
});

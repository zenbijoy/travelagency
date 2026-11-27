import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
  batchDeliveryJobsByProximity,
  calculateNetProfitSummary,
} from "../features/rider/calculators";
import {
  DEFAULT_DEMAND_HOTSPOTS,
  DEFAULT_OFFLINE_MAP_PACKS,
} from "../features/rider/constants";
import {
  BundledDeliveryBatch,
  DeliveryJob,
  DemandHotspotZone,
  DutyStatus,
  LocationBreadcrumb,
  NetProfitSummary,
  OfflineMapPackStatus,
  PODMetadata,
  RideQuote,
  RideRequest,
  RideTrip,
  RiderLedgerEntry,
  RiderPayout,
  RiderPayoutChannel,
  RiderProfile,
  RiderVehicle,
  SafetyCheckInSession,
  VehicleMode,
} from "../features/rider/types";
import { riderService } from "../services/riderService";
import { cachedStateStorage } from "./storage";

const IS_PRODUCTION =
  !process.env.JEST_WORKER_ID &&
  process.env.NODE_ENV !== "test" &&
  (process.env.EXPO_PUBLIC_APP_ENV === "production" || process.env.NODE_ENV === "production");

export interface RiderStoreState {
  // Rider Partner State
  profile: RiderProfile | null;
  vehicles: RiderVehicle[];
  dutyStatus: DutyStatus;
  activeVehicleMode: VehicleMode;

  // Dispatch Radar & Active Fulfillment
  openRideRequests: RideRequest[];
  declinedRequestIds: string[];
  deliveryJobs: DeliveryJob[];
  bundledBatches: BundledDeliveryBatch[];
  activeRideTrip: RideTrip | null;
  activeDeliveryJob: DeliveryJob | null;

  // Live Telemetry & Navigation
  currentLocation: { latitude: number; longitude: number; heading: number; speedKmh: number };
  breadcrumbs: LocationBreadcrumb[];
  etaMinutes: number;
  tripDistanceKm: number;

  // Financial & Fuel Tracker
  ledgerEntries: RiderLedgerEntry[];
  payouts: RiderPayout[];
  profitSummary: NetProfitSummary;

  // Demand Hotspots, Offline Packs & Safety Shield
  demandHotspots: DemandHotspotZone[];
  offlineMapPacks: OfflineMapPackStatus[];
  safetySession: SafetyCheckInSession;

  // Consumer Ride-Hailing State
  consumerActiveRide: RideRequest | null;
  consumerPassengerOtp: string | null;
  consumerRideHistory: RideRequest[];
  consumerQuotes: Partial<Record<VehicleMode, RideQuote>>;

  // UI Status
  isLoading: boolean;
  isHydrated: boolean;
  lastError: string | null;
  lastSyncedAt: string | null;

  // Actions
  bootstrapRiderPortal: (userHint?: { id?: string; name?: string; phone?: string }) => Promise<void>;
  toggleDutyStatus: () => Promise<void>;
  setVehicleMode: (mode: VehicleMode) => Promise<void>;
  setDailyGoalPaisa: (goalPaisa: number) => Promise<void>;
  refreshDispatchRadar: () => Promise<void>;
  claimRideRequest: (req: RideRequest) => Promise<RideTrip>;
  declineRideRequest: (requestId: string) => void;
  claimDeliveryJob: (job: DeliveryJob) => Promise<DeliveryJob>;
  claimDeliveryBatch: (batch: BundledDeliveryBatch) => Promise<DeliveryJob[]>;
  verifyTripOtp: (
    targetId: string,
    otp: string,
    jobType: "ride_start" | "delivery_pickup" | "delivery_dropoff",
    expectedHint?: string
  ) => Promise<{ verified: boolean; status: string; message: string }>;
  completeActiveRideTrip: (tipPaisa?: number) => Promise<void>;
  submitDeliveryPOD: (
    job: DeliveryJob,
    pod: Omit<PODMetadata, "signatureHash">
  ) => Promise<{ verified: boolean; updatedJob: DeliveryJob }>;
  recordGpsTelemetry: (coords: {
    latitude: number;
    longitude: number;
    speedKmh?: number;
    heading?: number;
    accuracyMeters?: number;
  }) => Promise<{ accepted: boolean; reason?: string }>;
  addFleetVehicle: (vehicleInput: unknown) => Promise<RiderVehicle>;
  submitKyc: (payload: { nidNumber: string; licenseNumber: string; homeCity: string }) => Promise<void>;
  requestCashout: (params: {
    amountPaisa: number;
    channel: RiderPayoutChannel;
    accountNumber: string;
  }) => Promise<RiderPayout>;
  downloadOfflinePack: (packId: string) => Promise<void>;
  startNightSafetyTimer: (intervalMinutes: number, contactName: string, contactPhone: string) => void;
  confirmSafetyCheckIn: () => void;
  stopNightSafetyTimer: () => void;
  triggerSOS: (note?: string) => Promise<{ success: boolean; shareLink: string }>;

  // Consumer Actions
  refreshConsumerQuotes: (params: {
    pickupLat: number;
    pickupLng: number;
    dropoffLat: number;
    dropoffLng: number;
    promoCode?: string;
    rideType?: "on_demand" | "scheduled" | "airport_pickup" | "hourly_rental" | "intercity";
    weatherGuard?: boolean;
  }) => Promise<Record<VehicleMode, RideQuote>>;
  bookConsumerRide: (input: unknown) => Promise<{ request: RideRequest; passengerOtp: string }>;
  cancelConsumerRide: (requestId: string, reason?: string) => Promise<void>;
  loadConsumerHistory: () => Promise<void>;
  resetError: () => void;
}

const INITIAL_PROFIT_SUMMARY: NetProfitSummary = {
  grossEarningsPaisa: 0,
  platformCommissionPaisa: 0,
  tipsPaisa: 0,
  estimatedFuelCostPaisa: 0,
  netTakeHomePaisa: 0,
  availableForCashoutPaisa: 0,
  pendingPayoutsPaisa: 0,
  paidOutPaisa: 0,
  dailyGoalPaisa: 180000,
  dailyProgressPct: 0,
  todayGrossPaisa: 0,
  todayNetPaisa: 0,
  tripCount: 0,
  deliveryCount: 0,
};

export const useRiderStore = create<RiderStoreState>()(
  persist(
    (set, get) => ({
      profile: null,
      vehicles: [],
      dutyStatus: "offline",
      activeVehicleMode: "bike",

      openRideRequests: [],
      declinedRequestIds: [],
      deliveryJobs: [],
      bundledBatches: [],
      activeRideTrip: null,
      activeDeliveryJob: null,

      currentLocation: {
        latitude: 23.7925,
        longitude: 90.4078,
        heading: 0,
        speedKmh: 0,
      },
      breadcrumbs: [],
      etaMinutes: 8,
      tripDistanceKm: 0,

      ledgerEntries: [],
      payouts: [],
      profitSummary: INITIAL_PROFIT_SUMMARY,

      demandHotspots: DEFAULT_DEMAND_HOTSPOTS,
      offlineMapPacks: DEFAULT_OFFLINE_MAP_PACKS,
      safetySession: {
        active: false,
        intervalMinutes: 30,
        nextCheckInAt: null,
        trustedContactName: "Nusrat Jahan",
        trustedContactPhone: "+8801811445566",
        liveShareUrl: null,
        lastCheckInAt: null,
        sosActive: false,
        lastSosDispatchedAt: null,
      },

      consumerActiveRide: null,
      consumerPassengerOtp: null,
      consumerRideHistory: [],
      consumerQuotes: {},

      isLoading: false,
      isHydrated: false,
      lastError: null,
      lastSyncedAt: null,

      bootstrapRiderPortal: async (userHint) => {
        set({ isLoading: true, lastError: null });
        try {
          const profile = await riderService.getOrCreateRiderProfile(userHint);
          const [vehicles, rideReqs, delJobs, ledger, payouts, hotspots, packs] =
            await Promise.all([
              riderService.listVehicles(profile.id),
              IS_PRODUCTION && profile.duty_status !== "online"
                ? Promise.resolve([])
                : riderService.fetchOpenRideRequests(profile.active_vehicle_mode),
              riderService.fetchDeliveryJobs(profile.id),
              riderService.fetchEarningsLedger(profile.id),
              riderService.fetchPayoutHistory(profile.id),
              riderService.getDemandHotspots(),
              riderService.getOfflineMapPacks(),
            ]);

          const declined = new Set(get().declinedRequestIds);
          const filteredReqs = rideReqs.filter((r) => !declined.has(r.id));
          const batches = batchDeliveryJobsByProximity(delJobs);
          const profitSummary = calculateNetProfitSummary({
            entries: ledger,
            payouts,
            dailyGoalPaisa: profile.daily_goal_paisa,
            totalRideCount: profile.total_rides,
            totalDeliveryCount: profile.total_deliveries,
          });

          set({
            profile,
            vehicles,
            dutyStatus: profile.duty_status,
            activeVehicleMode: profile.active_vehicle_mode,
            openRideRequests: filteredReqs,
            deliveryJobs: delJobs,
            bundledBatches: batches,
            ledgerEntries: ledger,
            payouts,
            profitSummary,
            demandHotspots: hotspots,
            offlineMapPacks: packs,
            isLoading: false,
            lastSyncedAt: new Date().toISOString(),
          });
        } catch (err: any) {
          set({
            isLoading: false,
            lastError: err?.message || "Failed to initialize rider telemetry",
          });
        }
      },

      toggleDutyStatus: async () => {
        const current = get().profile;
        if (!current) return;
        const nextStatus: DutyStatus =
          get().dutyStatus === "offline" ? "online" : "offline";
        set({ dutyStatus: nextStatus });

        const updated = await riderService.updateDutyAndMode(current.id, {
          dutyStatus: nextStatus,
        });
        set({ profile: updated, dutyStatus: updated.duty_status });

        if (nextStatus === "online") {
          await get().refreshDispatchRadar();
        }
      },

      setVehicleMode: async (mode) => {
        const current = get().profile;
        set({ activeVehicleMode: mode });
        if (current) {
          const updated = await riderService.updateDutyAndMode(current.id, {
            vehicleMode: mode,
          });
          set({ profile: updated, activeVehicleMode: updated.active_vehicle_mode });
        }
        if (get().dutyStatus === "online") await get().refreshDispatchRadar();
      },

      setDailyGoalPaisa: async (goalPaisa) => {
        const current = get().profile;
        if (!current) return;
        const updated = await riderService.updateDutyAndMode(current.id, {
          dailyGoalPaisa: goalPaisa,
        });
        const summary = calculateNetProfitSummary({
          entries: get().ledgerEntries,
          payouts: get().payouts,
          dailyGoalPaisa: goalPaisa,
          totalRideCount: updated.total_rides,
          totalDeliveryCount: updated.total_deliveries,
        });
        set({ profile: updated, profitSummary: summary });
      },

      refreshDispatchRadar: async () => {
        const mode = get().activeVehicleMode;
        const profileId = get().profile?.id;
        const [rideReqs, delJobs] = await Promise.all([
          riderService.fetchOpenRideRequests(mode),
          riderService.fetchDeliveryJobs(profileId),
        ]);
        const declined = new Set(get().declinedRequestIds);
        set({
          openRideRequests: rideReqs.filter((r) => !declined.has(r.id)),
          deliveryJobs: delJobs,
          bundledBatches: batchDeliveryJobsByProximity(delJobs),
          lastSyncedAt: new Date().toISOString(),
        });
      },

      claimRideRequest: async (req) => {
        const profile = get().profile || (await riderService.getOrCreateRiderProfile());
        const trip = await riderService.claimRideRequest(req, profile);
        set((state) => ({
          activeRideTrip: trip,
          dutyStatus: "on_trip",
          openRideRequests: state.openRideRequests.filter((r) => r.id !== req.id),
          etaMinutes: req.estimated_duration_min,
          tripDistanceKm: req.estimated_distance_km,
        }));
        return trip;
      },

      declineRideRequest: (requestId) => {
        set((state) => ({
          declinedRequestIds: [...state.declinedRequestIds, requestId],
          openRideRequests: state.openRideRequests.filter((r) => r.id !== requestId),
        }));
      },

      claimDeliveryJob: async (job) => {
        const profile = get().profile || (await riderService.getOrCreateRiderProfile());
        const claimed = await riderService.claimDeliveryJob(job, profile);
        set((state) => {
          const nextJobs = state.deliveryJobs.map((j) =>
            j.id === claimed.id ? claimed : j
          );
          return {
            deliveryJobs: nextJobs,
            bundledBatches: batchDeliveryJobsByProximity(nextJobs),
            activeDeliveryJob: claimed,
            dutyStatus: "on_trip",
          };
        });
        return claimed;
      },

      claimDeliveryBatch: async (batch) => {
        const claimedJobs: DeliveryJob[] = [];
        for (const job of batch.jobs) {
          const claimed = await get().claimDeliveryJob(job);
          claimedJobs.push(claimed);
        }
        if (claimedJobs[0]) {
          set({ activeDeliveryJob: claimedJobs[0] });
        }
        return claimedJobs;
      },

      verifyTripOtp: async (targetId, otp, jobType, expectedHint) => {
        const res = await riderService.verifyTripOtp(targetId, otp, jobType, expectedHint);
        if (res.verified) {
          if (jobType === "ride_start" && get().activeRideTrip?.id === targetId) {
            set((state) => ({
              activeRideTrip: state.activeRideTrip
                ? {
                    ...state.activeRideTrip,
                    otp_verified: true,
                    otp_verified_at: new Date().toISOString(),
                    status: "in_progress",
                    started_at: new Date().toISOString(),
                  }
                : null,
            }));
          } else if (jobType === "delivery_pickup") {
            set((state) => {
              const updatedJobs = state.deliveryJobs.map((j) =>
                j.id === targetId
                  ? {
                      ...j,
                      status: "picked_up" as const,
                      pickup_otp_verified_at: new Date().toISOString(),
                      picked_up_at: new Date().toISOString(),
                    }
                  : j
              );
              return {
                deliveryJobs: updatedJobs,
                activeDeliveryJob:
                  state.activeDeliveryJob?.id === targetId
                    ? {
                        ...state.activeDeliveryJob,
                        status: "picked_up",
                        pickup_otp_verified_at: new Date().toISOString(),
                      }
                    : state.activeDeliveryJob,
              };
            });
          }
        }
        return res;
      },

      completeActiveRideTrip: async (tipPaisa = 0) => {
        const active = get().activeRideTrip;
        if (!active) return;

        const { trip, ledgerEntries } = await riderService.finalizeRideSettlement(
          active,
          get().tripDistanceKm || active.actual_distance_km,
          active.actual_duration_min,
          tipPaisa
        );

        const profile = get().profile;
        const nextProfile = profile
          ? {
              ...profile,
              total_rides: profile.total_rides + 1,
              duty_status: "online" as DutyStatus,
            }
          : null;

        const summary = calculateNetProfitSummary({
          entries: ledgerEntries,
          payouts: get().payouts,
          dailyGoalPaisa: nextProfile?.daily_goal_paisa ?? 180000,
          totalRideCount: nextProfile?.total_rides ?? 1,
          totalDeliveryCount: nextProfile?.total_deliveries ?? 0,
        });

        set({
          activeRideTrip: null,
          profile: nextProfile,
          dutyStatus: "online",
          ledgerEntries,
          profitSummary: summary,
          lastSyncedAt: new Date().toISOString(),
        });
        void trip;
      },

      submitDeliveryPOD: async (job, pod) => {
        const res = await riderService.submitProofOfDelivery(job, pod);
        if (res.verified) {
          const profile = get().profile;
          const nextProfile = profile
            ? {
                ...profile,
                total_deliveries: profile.total_deliveries + 1,
                duty_status: "online" as DutyStatus,
              }
            : null;
          const nextLedger = res.ledgerEntry
            ? [res.ledgerEntry, ...get().ledgerEntries]
            : get().ledgerEntries;

          const nextJobs = get().deliveryJobs.map((j) =>
            j.id === res.updatedJob.id ? res.updatedJob : j
          );
          const nextActive =
            nextJobs.find(
              (j) =>
                j.rider_id === profile?.id &&
                ["claimed", "en_route_pickup", "picked_up", "in_transit"].includes(j.status)
            ) ?? null;

          const summary = calculateNetProfitSummary({
            entries: nextLedger,
            payouts: get().payouts,
            dailyGoalPaisa: nextProfile?.daily_goal_paisa ?? 180000,
            totalRideCount: nextProfile?.total_rides ?? 0,
            totalDeliveryCount: nextProfile?.total_deliveries ?? 1,
          });

          set({
            profile: nextProfile,
            dutyStatus: nextActive ? "on_trip" : "online",
            deliveryJobs: nextJobs,
            bundledBatches: batchDeliveryJobsByProximity(nextJobs),
            activeDeliveryJob: nextActive,
            ledgerEntries: nextLedger,
            profitSummary: summary,
          });
        }
        return { verified: res.verified, updatedJob: res.updatedJob };
      },

      recordGpsTelemetry: async (coords) => {
        const profile = get().profile;
        const prev = get().breadcrumbs[get().breadcrumbs.length - 1] ?? null;
        const result = await riderService.sendTelemetryPing({
          riderId: profile?.id || "",
          tripId: get().activeRideTrip?.id,
          deliveryJobId: get().activeDeliveryJob?.id,
          latitude: coords.latitude,
          longitude: coords.longitude,
          speedKmh: coords.speedKmh,
          heading: coords.heading,
          accuracyMeters: coords.accuracyMeters,
          previousBreadcrumb: prev,
        });

        if (result.accepted) {
          const crumb: LocationBreadcrumb = {
            latitude: coords.latitude,
            longitude: coords.longitude,
            speedKmh: result.speedKmh,
            heading: coords.heading ?? 0,
            accuracyMeters: coords.accuracyMeters,
            recordedAt: new Date().toISOString(),
          };
          set((state) => ({
            currentLocation: {
              latitude: coords.latitude,
              longitude: coords.longitude,
              heading: coords.heading ?? 0,
              speedKmh: result.speedKmh,
            },
            breadcrumbs: [...state.breadcrumbs.slice(-49), crumb],
          }));
        }
        return { accepted: result.accepted, reason: result.reason };
      },

      addFleetVehicle: async (vehicleInput) => {
        const profile = get().profile || (await riderService.getOrCreateRiderProfile());
        const created = await riderService.addVehicle(profile.id, vehicleInput);
        set((state) => ({ vehicles: [created, ...state.vehicles] }));
        return created;
      },

      submitKyc: async (payload) => {
        const profile = get().profile || (await riderService.getOrCreateRiderProfile());
        const updated = await riderService.submitKycDocuments(profile.id, payload);
        set({ profile: updated });
      },

      requestCashout: async (params) => {
        const profile = get().profile || (await riderService.getOrCreateRiderProfile());
        const payout = await riderService.requestPayout(profile.id, params);
        const nextPayouts = [payout, ...get().payouts];
        const summary = calculateNetProfitSummary({
          entries: get().ledgerEntries,
          payouts: nextPayouts,
          dailyGoalPaisa: profile.daily_goal_paisa,
          totalRideCount: profile.total_rides,
          totalDeliveryCount: profile.total_deliveries,
        });
        set({ payouts: nextPayouts, profitSummary: summary });
        return payout;
      },

      downloadOfflinePack: async (packId) => {
        set((state) => ({
          offlineMapPacks: state.offlineMapPacks.map((p) =>
            p.id === packId ? { ...p, status: "downloading", progressPct: 35 } : p
          ),
        }));
        const updated = await riderService.downloadOfflineMapPack(packId, (pct) => {
          set((state) => ({
            offlineMapPacks: state.offlineMapPacks.map((p) =>
              p.id === packId ? { ...p, progressPct: pct } : p
            ),
          }));
        });
        set({ offlineMapPacks: updated });
      },

      startNightSafetyTimer: (intervalMinutes, contactName, contactPhone) => {
        const { latitude, longitude } = get().currentLocation;
        const shareUrl = `https://maps.google.com/?q=${latitude},${longitude}`;
        set({
          safetySession: {
            active: true,
            intervalMinutes,
            nextCheckInAt: Date.now() + intervalMinutes * 60_000,
            trustedContactName: contactName,
            trustedContactPhone: contactPhone,
            liveShareUrl: shareUrl,
            lastCheckInAt: Date.now(),
            sosActive: false,
            lastSosDispatchedAt: get().safetySession.lastSosDispatchedAt,
          },
        });
      },

      confirmSafetyCheckIn: () => {
        const current = get().safetySession;
        if (!current.active) return;
        set({
          safetySession: {
            ...current,
            lastCheckInAt: Date.now(),
            nextCheckInAt: Date.now() + current.intervalMinutes * 60_000,
            sosActive: false,
          },
        });
      },

      stopNightSafetyTimer: () => {
        set((state) => ({
          safetySession: {
            ...state.safetySession,
            active: false,
            nextCheckInAt: null,
          },
        }));
      },

      triggerSOS: async (note) => {
        const loc = get().currentLocation;
        const result = await riderService.triggerRiderSOS({
          tripId: get().activeRideTrip?.id,
          coords: { latitude: loc.latitude, longitude: loc.longitude },
          note,
        });
        set((state) => ({
          safetySession: {
            ...state.safetySession,
            sosActive: true,
            liveShareUrl: result.shareLink,
            lastSosDispatchedAt: Date.now(),
          },
        }));
        return { success: result.success, shareLink: result.shareLink };
      },

      refreshConsumerQuotes: async (params) => {
        const quotes = await riderService.getConsumerQuotes(params);
        set({ consumerQuotes: quotes });
        return quotes;
      },

      bookConsumerRide: async (input) => {
        const { request, passengerOtp } = await riderService.createConsumerRideRequest(input);
        set((state) => ({
          consumerActiveRide: request,
          consumerPassengerOtp: passengerOtp,
          consumerRideHistory: [request, ...state.consumerRideHistory].slice(0, 30),
        }));
        return { request, passengerOtp };
      },

      cancelConsumerRide: async (requestId, reason) => {
        await riderService.cancelConsumerRide(requestId, reason);
        set((state) => ({
          consumerActiveRide:
            state.consumerActiveRide?.id === requestId ? null : state.consumerActiveRide,
          consumerPassengerOtp:
            state.consumerActiveRide?.id === requestId ? null : state.consumerPassengerOtp,
          consumerRideHistory: state.consumerRideHistory.map((r) =>
            r.id === requestId ? { ...r, status: "cancelled" } : r
          ),
        }));
      },

      loadConsumerHistory: async () => {
        const history = await riderService.fetchConsumerRideHistory();
        set({ consumerRideHistory: history });
      },

      resetError: () => set({ lastError: null }),
    }),
    {
      name: "shopnojatra_rider_store_v1",
      storage: createJSONStorage(() => cachedStateStorage),
      partialize: (state) => ({
        profile: state.profile,
        vehicles: state.vehicles,
        dutyStatus: state.dutyStatus,
        activeVehicleMode: state.activeVehicleMode,
        declinedRequestIds: state.declinedRequestIds,
        activeRideTrip: state.activeRideTrip,
        activeDeliveryJob: state.activeDeliveryJob,
        ledgerEntries: state.ledgerEntries,
        payouts: state.payouts,
        offlineMapPacks: state.offlineMapPacks,
        safetySession: state.safetySession,
        consumerActiveRide: state.consumerActiveRide,
        consumerPassengerOtp: state.consumerPassengerOtp,
        consumerRideHistory: state.consumerRideHistory,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.isHydrated = true;
        }
      },
    }
  )
);

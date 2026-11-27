/**
 * Hotel PMS Enterprise Reactive Zustand Store
 * High-performance state management for Hotel Partners and PMS Console.
 * Aligned 100% with src/features/hotel/types.ts and hotelPmsClient.ts.
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { cachedStateStorage } from "../../../store/storage";
import { supabase } from "../../../utils/supabase";
import {
  HotelProperty,
  HotelRoomUnit,
  HotelReservation,
  HotelFolioItem,
  HotelHousekeepingTask,
  HotelMaintenanceTicket,
  HotelRateRule,
  HotelPayoutRecord,
  DateBlockRecord,
  HotelKpiSnapshot,
  HousekeepingTaskStatus,
  MaintenanceTicketStatus,
  MaintenanceCategory,
  MaintenanceSeverity,
  FolioItemType,
} from "../types";
import {
  buildInitialWorkspaceSnapshot,
  HotelWorkspaceSnapshot,
} from "../data/initialBootstrap";
import {
  HotelPmsClient,
  HotelPmsClientDeps,
  StorageLike,
} from "../services/hotelPmsClient";
import { computeHotelKpis } from "../engines/yieldEngine";
import { createFolioLineItem } from "../engines/folioEngine";
import { buildTapeChartMatrix, TapeChartRow } from "../engines/availabilityEngine";

const asyncPmsStorage: StorageLike = {
  getItem: async (key: string) => await Promise.resolve(cachedStateStorage.getItem(key)),
  setItem: async (key: string, value: string) => {
    await Promise.resolve(cachedStateStorage.setItem(key, value));
  },
  removeItem: async (key: string) => {
    await Promise.resolve(cachedStateStorage.removeItem(key));
  },
};

const defaultClientDeps: HotelPmsClientDeps = {
  supabase,
  storage: asyncPmsStorage,
  apiBaseUrl: process.env.EXPO_PUBLIC_API_URL || "http://localhost:8000/api/v1",
};

export const defaultHotelPmsClient = new HotelPmsClient(defaultClientDeps);

export interface HotelPmsStoreState {
  workspace: HotelWorkspaceSnapshot;
  selectedHotelId: string;
  selectedFloor: string; // "all" | "1" | "2" | "3" | "suites"
  selectedDate: string; // YYYY-MM-DD
  searchQuery: string;

  isLoading: boolean;
  isSyncing: boolean;
  isOffline: boolean;
  lastSyncTime: number | null;
  offlineQueueCount: number;
  errorMessage: string | null;

  _unsubscribeRealtime?: () => void;

  // Actions
  initWorkspace: (preferredHotelId?: string) => Promise<void>;
  refreshWorkspace: () => Promise<void>;
  setSelectedHotelId: (id: string) => void;
  setSelectedFloor: (floor: string) => void;
  setSelectedDate: (date: string) => void;
  setSearchQuery: (query: string) => void;

  expressCheckIn: (params: {
    bookingReference: string;
    roomUnitId?: string;
    nidOrPassportVerified?: boolean;
  }) => Promise<{ success: boolean; qrPassCode?: string; roomNumber?: string; error?: string }>;

  postFolioAndCheckOut: (params: {
    folioId: string;
    additionalCharges?: Array<{
      description: string;
      itemType: FolioItemType;
      amountBdt: number;
    }>;
    paymentAmountBdt?: number;
    paymentMethod?: string;
    checkout?: boolean;
  }) => Promise<{ success: boolean; totalChargedBdt?: number; error?: string }>;

  transitionHousekeeping: (params: {
    taskId: string;
    targetStatus: HousekeepingTaskStatus;
    staffId?: string | null;
    staffName?: string | null;
  }) => Promise<{ success: boolean; error?: string }>;

  transitionMaintenance: (params: {
    ticketId: string;
    targetStatus: MaintenanceTicketStatus;
    resolutionNotes?: string;
    actualCostBdt?: number;
  }) => Promise<{ success: boolean; error?: string }>;

  createMaintenanceTicket: (params: {
    roomUnitId: string;
    category: MaintenanceCategory;
    title: string;
    description: string;
    severity: MaintenanceSeverity;
    estimatedCostBdt?: number;
    blocksRoomSale?: boolean;
  }) => Promise<{ success: boolean; ticketId?: string; error?: string }>;

  toggleRateRule: (ruleId: string, enabled?: boolean) => Promise<{ success: boolean }>;
  createRateRule: (rule: Omit<HotelRateRule, "id">) => Promise<{ success: boolean; ruleId?: string }>;

  requestPayout: (params: {
    amountBdt: number;
    method: "bkash" | "nagad" | "bank_transfer";
    accountRef: string;
  }) => Promise<{ success: boolean; payoutId?: string; error?: string }>;

  blockRoomDates: (params: {
    roomUnitId?: string | null;
    date: string;
    reason: string;
  }) => Promise<{ success: boolean; blockId?: string }>;

  unblockRoomDates: (blockId: string) => Promise<{ success: boolean }>;

  sendConciergeMessage: (params: {
    threadId: string;
    text: string;
    senderRole: "guest" | "hotel" | "system";
    senderName?: string;
    tag?: string;
  }) => Promise<{ success: boolean }>;

  rotateDigitalKey: (keyId: string) => Promise<{ success: boolean; newPasscode?: string; error?: string }>;

  syncOfflineQueue: () => Promise<{ synced: number; remaining: number }>;

  patchWorkspace: (updater: (draft: HotelWorkspaceSnapshot) => HotelWorkspaceSnapshot) => void;
}

const initialSnapshot = buildInitialWorkspaceSnapshot();

export const useHotelPmsStore = create<HotelPmsStoreState>()(
  persist(
    (set, get) => ({
      workspace: initialSnapshot,
      selectedHotelId: initialSnapshot.activeHotelId || initialSnapshot.properties[0]?.id,
      selectedFloor: "all",
      selectedDate: new Date().toISOString().slice(0, 10),
      searchQuery: "",

      isLoading: false,
      isSyncing: false,
      isOffline: false,
      lastSyncTime: null,
      offlineQueueCount: 0,
      errorMessage: null,

      initWorkspace: async (preferredHotelId) => {
        set({ isLoading: true, errorMessage: null });
        try {
          const client = defaultHotelPmsClient;
          const hotelId = preferredHotelId || get().selectedHotelId;
          const { snapshot, source, pendingQueueCount } = await client.loadWorkspace(hotelId);

          const prevUnsub = get()._unsubscribeRealtime;
          if (prevUnsub) prevUnsub();

          const unsub = client.subscribeToRealtime(snapshot.activeHotelId, () => {
            get().refreshWorkspace();
          });

          set({
            workspace: snapshot,
            selectedHotelId: snapshot.activeHotelId,
            isLoading: false,
            isOffline: source === "cache" || source === "bootstrap",
            lastSyncTime: Date.now(),
            offlineQueueCount: pendingQueueCount,
            _unsubscribeRealtime: unsub,
          });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "Failed to load PMS workspace";
          set({ isLoading: false, isOffline: true, errorMessage: msg });
        }
      },

      refreshWorkspace: async () => {
        set({ isSyncing: true });
        try {
          const client = defaultHotelPmsClient;
          const { snapshot, source, pendingQueueCount } = await client.loadWorkspace(
            get().selectedHotelId
          );
          set({
            workspace: snapshot,
            isSyncing: false,
            isOffline: source === "cache" || source === "bootstrap",
            lastSyncTime: Date.now(),
            offlineQueueCount: pendingQueueCount,
          });
        } catch {
          set({ isSyncing: false });
        }
      },

      setSelectedHotelId: (id: string) => {
        set({ selectedHotelId: id });
        get().refreshWorkspace();
      },

      setSelectedFloor: (floor: string) => set({ selectedFloor: floor }),

      setSelectedDate: (date: string) => set({ selectedDate: date }),

      setSearchQuery: (query: string) => set({ searchQuery: query }),

      patchWorkspace: (updater) => {
        const updated = updater(get().workspace);
        set({ workspace: updated });
        defaultHotelPmsClient.saveCachedWorkspace(updated).catch(() => {});
      },

      expressCheckIn: async (params) => {
        try {
          const client = defaultHotelPmsClient;
          const res = await client.expressCheckIn({
            snapshot: get().workspace,
            hotelId: get().selectedHotelId,
            bookingReference: params.bookingReference,
            roomUnitId: params.roomUnitId,
            nidOrPassportVerified: params.nidOrPassportVerified ?? true,
          });

          set({
            workspace: res.nextSnapshot,
            offlineQueueCount: (await client.getOfflineQueue()).length,
          });

          return {
            success: true,
            qrPassCode: res.guestKey.qrPassCode,
            roomNumber: res.unit.roomNumber,
          };
        } catch (err: unknown) {
          return {
            success: false,
            error: err instanceof Error ? err.message : "Express check-in failed",
          };
        }
      },

      postFolioAndCheckOut: async (params) => {
        try {
          const client = defaultHotelPmsClient;
          const folio = get().workspace.folios.find((f) => f.id === params.folioId);
          if (!folio) return { success: false, error: "Folio not found" };

          const newItems: HotelFolioItem[] = (params.additionalCharges || []).map((c) =>
            createFolioLineItem({
              folioId: folio.id,
              hotelId: folio.hotelId,
              itemType: c.itemType,
              description: c.description,
              quantity: 1,
              unitAmountBdt: c.amountBdt,
              applyTax: true,
            })
          );

          const res = await client.postFolioAndCheckout({
            snapshot: get().workspace,
            folioId: params.folioId,
            newItems,
            paymentAmountBdt: params.paymentAmountBdt,
            paymentMethod: params.paymentMethod || "card",
            checkout: params.checkout ?? true,
          });

          set({
            workspace: res.nextSnapshot,
            offlineQueueCount: (await client.getOfflineQueue()).length,
          });

          return {
            success: true,
            totalChargedBdt: Math.round(res.folio.totalChargesPaisa / 100),
          };
        } catch (err: unknown) {
          return {
            success: false,
            error: err instanceof Error ? err.message : "Folio settlement failed",
          };
        }
      },

      transitionHousekeeping: async (params) => {
        try {
          const client = defaultHotelPmsClient;
          const nextSnapshot = await client.transitionHousekeeping({
            snapshot: get().workspace,
            taskId: params.taskId,
            targetStatus: params.targetStatus,
            staffId: params.staffId,
            staffName: params.staffName,
          });

          set({
            workspace: nextSnapshot,
            offlineQueueCount: (await client.getOfflineQueue()).length,
          });
          return { success: true };
        } catch (err: unknown) {
          return {
            success: false,
            error: err instanceof Error ? err.message : "Housekeeping update failed",
          };
        }
      },

      transitionMaintenance: async (params) => {
        try {
          const client = defaultHotelPmsClient;
          const nextSnapshot = await client.transitionMaintenance({
            snapshot: get().workspace,
            ticketId: params.ticketId,
            targetStatus: params.targetStatus,
            actualCostBdt: params.actualCostBdt,
            resolutionNotes: params.resolutionNotes,
          });

          set({
            workspace: nextSnapshot,
            offlineQueueCount: (await client.getOfflineQueue()).length,
          });
          return { success: true };
        } catch (err: unknown) {
          return {
            success: false,
            error: err instanceof Error ? err.message : "Maintenance update failed",
          };
        }
      },

      createMaintenanceTicket: async (params) => {
        const ticketId = `ticket_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        const now = new Date().toISOString();
        const unit = get().workspace.units.find((u) => u.id === params.roomUnitId);

        const newTicket: HotelMaintenanceTicket = {
          id: ticketId,
          hotelId: get().selectedHotelId,
          roomUnitId: params.roomUnitId,
          roomNumber: unit?.roomNumber || "Room",
          ticketReference: `MNT-${Math.floor(1000 + Math.random() * 9000)}`,
          category: params.category,
          severity: params.severity,
          status: "open",
          title: params.title,
          description: params.description,
          blocksRoomSale: params.blocksRoomSale ?? params.severity === "critical",
          estimatedCostBdt: params.estimatedCostBdt || 0,
          actualCostBdt: 0,
          currency: "BDT",
          createdAt: now,
        };

        const updatedUnits =
          newTicket.blocksRoomSale
            ? get().workspace.units.map((u) =>
                u.id === params.roomUnitId ? { ...u, occupancyStatus: "out_of_order" as const } : u
              )
            : get().workspace.units;

        const updatedWorkspace: HotelWorkspaceSnapshot = {
          ...get().workspace,
          units: updatedUnits,
          maintenanceTickets: [newTicket, ...get().workspace.maintenanceTickets],
          lastSyncedAt: now,
        };

        set({ workspace: updatedWorkspace });
        defaultHotelPmsClient.saveCachedWorkspace(updatedWorkspace).catch(() => {});
        defaultHotelPmsClient
          .enqueueOfflineMutation("MAINTENANCE_UPSERT", get().selectedHotelId, newTicket)
          .catch(() => {});

        return { success: true, ticketId };
      },

      toggleRateRule: async (ruleId: string, enabled?: boolean) => {
        const rules = get().workspace.rateRules.map((r) =>
          r.id === ruleId ? { ...r, isActive: enabled !== undefined ? enabled : !r.isActive } : r
        );
        const updatedWorkspace: HotelWorkspaceSnapshot = {
          ...get().workspace,
          rateRules: rules,
          lastSyncedAt: new Date().toISOString(),
        };
        set({ workspace: updatedWorkspace });
        defaultHotelPmsClient.saveCachedWorkspace(updatedWorkspace).catch(() => {});
        return { success: true };
      },

      createRateRule: async (ruleData) => {
        const ruleId = `rule_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        const newRule: HotelRateRule = {
          id: ruleId,
          ...ruleData,
        };
        const updatedWorkspace: HotelWorkspaceSnapshot = {
          ...get().workspace,
          rateRules: [...get().workspace.rateRules, newRule],
          lastSyncedAt: new Date().toISOString(),
        };
        set({ workspace: updatedWorkspace });
        defaultHotelPmsClient.saveCachedWorkspace(updatedWorkspace).catch(() => {});
        return { success: true, ruleId };
      },

      requestPayout: async (params) => {
        if (params.amountBdt < 1000) {
          return { success: false, error: "Minimum payout withdrawal is BDT 1,000" };
        }
        const payoutId = `pay_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        const newPayout: HotelPayoutRecord = {
          id: payoutId,
          hotelId: get().selectedHotelId,
          amountBdt: params.amountBdt,
          method: params.method,
          accountRef: params.accountRef,
          status: "Pending",
          requestedAt: new Date().toISOString(),
        };

        const updatedWorkspace: HotelWorkspaceSnapshot = {
          ...get().workspace,
          payouts: [newPayout, ...get().workspace.payouts],
          lastSyncedAt: new Date().toISOString(),
        };
        set({ workspace: updatedWorkspace });
        defaultHotelPmsClient.saveCachedWorkspace(updatedWorkspace).catch(() => {});
        defaultHotelPmsClient
          .enqueueOfflineMutation("PAYOUT_REQUEST", get().selectedHotelId, newPayout)
          .catch(() => {});
        return { success: true, payoutId };
      },

      blockRoomDates: async (params) => {
        const blockId = `block_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        const newBlock: DateBlockRecord = {
          id: blockId,
          hotelId: get().selectedHotelId,
          roomUnitId: params.roomUnitId ?? null,
          date: params.date,
          reason: params.reason,
          createdAt: new Date().toISOString(),
        };
        const updatedWorkspace: HotelWorkspaceSnapshot = {
          ...get().workspace,
          blocks: [...get().workspace.blocks, newBlock],
          lastSyncedAt: new Date().toISOString(),
        };
        set({ workspace: updatedWorkspace });
        defaultHotelPmsClient.saveCachedWorkspace(updatedWorkspace).catch(() => {});
        defaultHotelPmsClient
          .enqueueOfflineMutation("BLOCK_DATES", get().selectedHotelId, newBlock)
          .catch(() => {});
        return { success: true, blockId };
      },

      unblockRoomDates: async (blockId: string) => {
        const updatedBlocks = get().workspace.blocks.filter((b) => b.id !== blockId);
        const updatedWorkspace: HotelWorkspaceSnapshot = {
          ...get().workspace,
          blocks: updatedBlocks,
          lastSyncedAt: new Date().toISOString(),
        };
        set({ workspace: updatedWorkspace });
        defaultHotelPmsClient.saveCachedWorkspace(updatedWorkspace).catch(() => {});
        return { success: true };
      },

      sendConciergeMessage: async (params) => {
        const now = new Date().toISOString();
        const threads = [...get().workspace.conciergeThreads];
        const index = threads.findIndex((t) => t.id === params.threadId);
        const newMsg = {
          id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          threadId: params.threadId,
          senderRole: params.senderRole,
          senderName: params.senderName || (params.senderRole === "hotel" ? "Hotel Concierge" : "Guest"),
          text: params.text,
          tag: params.tag,
          sentAt: now,
          read: true,
        };

        if (index >= 0) {
          const thread = threads[index];
          threads[index] = {
            ...thread,
            messages: [...thread.messages, newMsg],
            updatedAt: now,
          };
        }

        const updatedWorkspace: HotelWorkspaceSnapshot = {
          ...get().workspace,
          conciergeThreads: threads,
          lastSyncedAt: now,
        };
        set({ workspace: updatedWorkspace });
        defaultHotelPmsClient.saveCachedWorkspace(updatedWorkspace).catch(() => {});
        return { success: true };
      },

      rotateDigitalKey: async (keyId: string) => {
        try {
          const client = defaultHotelPmsClient;
          const res = await client.rotateKey({
            snapshot: get().workspace,
            keyId,
          });
          set({ workspace: res.nextSnapshot });
          return {
            success: true,
            newPasscode: res.rotatedKey.qrPassCode,
          };
        } catch (err: unknown) {
          return {
            success: false,
            error: err instanceof Error ? err.message : "Failed to rotate key",
          };
        }
      },

      syncOfflineQueue: async () => {
        set({ isSyncing: true });
        try {
          const res = await defaultHotelPmsClient.syncOfflineQueue();
          set({ offlineQueueCount: res.remaining, isSyncing: false });
          return res;
        } catch {
          set({ isSyncing: false });
          return { synced: 0, remaining: get().offlineQueueCount };
        }
      },
    }),
    {
      name: "hotel_pms_store_v1",
      storage: createJSONStorage(() => cachedStateStorage),
      partialize: (state) => ({
        workspace: state.workspace,
        selectedHotelId: state.selectedHotelId,
        selectedFloor: state.selectedFloor,
        selectedDate: state.selectedDate,
      }),
    }
  )
);

export function useHotelPmsComputed() {
  const store = useHotelPmsStore();
  const { workspace, selectedHotelId, selectedFloor, searchQuery, selectedDate } = store;

  const currentProperty: HotelProperty =
    workspace.properties.find((p) => p.id === selectedHotelId) ||
    workspace.properties[0] ||
    initialSnapshot.properties[0];

  const hotelUnits = workspace.units.filter((u) => u.hotelId === currentProperty.id);
  const hotelReservations = workspace.reservations.filter((r) => r.hotelId === currentProperty.id);
  const hotelFolios = workspace.folios.filter((f) => f.hotelId === currentProperty.id);
  const hotelHkTasks = workspace.housekeepingTasks.filter((t) => t.hotelId === currentProperty.id);
  const hotelTickets = workspace.maintenanceTickets.filter((t) => t.hotelId === currentProperty.id);

  const kpis: HotelKpiSnapshot = computeHotelKpis({
    units: hotelUnits,
    reservations: hotelReservations,
    folios: hotelFolios,
    housekeepingTasks: hotelHkTasks,
    maintenanceTickets: hotelTickets,
    competitors: workspace.competitors,
    commissionPct: currentProperty.commissionPct,
    operatingCostPerRoomBdt: currentProperty.operatingCostPerRoomBdt,
    referenceDate: selectedDate,
  });

  const filteredUnits = hotelUnits.filter((unit) => {
    if (selectedFloor !== "all") {
      if (selectedFloor === "suites") {
        if (!unit.isVipRoom && !unit.roomTypeName.toLowerCase().includes("suite")) return false;
      } else {
        const floorNum = parseInt(selectedFloor, 10);
        if (unit.floorNumber !== floorNum) return false;
      }
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const matchRoom = unit.roomNumber.toLowerCase().includes(q);
      const matchType = unit.roomTypeName.toLowerCase().includes(q);
      const matchGuest = (unit.currentGuestName || "").toLowerCase().includes(q);
      return matchRoom || matchType || matchGuest;
    }
    return true;
  });

  const activeReservations = hotelReservations.filter(
    (r) => r.status === "confirmed" || r.status === "checked_in" || r.status === "pending"
  );

  const pendingHousekeeping = hotelHkTasks.filter(
    (t) => t.status !== "ready" && t.status !== "cancelled"
  );

  const openMaintenance = hotelTickets.filter(
    (t) => t.status !== "resolved" && t.status !== "closed"
  );

  const tapeChart: { dates: string[]; rows: TapeChartRow[] } = buildTapeChartMatrix({
    units: hotelUnits,
    reservations: hotelReservations,
    blocks: workspace.blocks,
    startDate: selectedDate,
    days: 7,
  });

  return {
    currentProperty,
    kpis,
    filteredUnits,
    activeReservations,
    pendingHousekeeping,
    openMaintenance,
    tapeChart,
  };
}

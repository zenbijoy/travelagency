/**
 * Off-Grid P2P Mesh Communication & Safety Store (Zustand) - Shopno Jatra
 * Reactive state management for real-time peer proximity, message timelines,
 * distress beacons, and offline trail breadcrumb checkpoints.
 */

import { create } from "zustand";
import {
  MeshNetworkState,
  MeshNode,
  MeshMessage,
  TrailCheckpoint,
  SosEmergencyType,
  MeshPowerMode,
} from "../types/offGridMesh";
import { offGridMeshService } from "../services/mesh/offGridMeshService";
import { GeoCoordinates } from "../services/safety/sosService";

export type MeshActiveTab = "radar" | "chat" | "sos" | "trail";

let activeSubscriptionUnsubscribe: (() => void) | null = null;

export interface OffGridMeshStoreState {
  networkState: MeshNetworkState;
  messages: MeshMessage[];
  checkpoints: TrailCheckpoint[];
  activeTab: MeshActiveTab;
  currentLocation: GeoCoordinates | null;
  compassHeading: number; // 0-360 degrees
  selectedPeer: MeshNode | null;
  isLoading: boolean;
  isSendingMessage: boolean;
  isTriggeringSos: boolean;

  // Actions
  initialize: (networkId?: string, peerName?: string) => Promise<void>;
  setActiveTab: (tab: MeshActiveTab) => void;
  setSelectedPeer: (peer: MeshNode | null) => void;
  setPowerMode: (mode: MeshPowerMode) => void;
  sendMessage: (text: string, isUrgent?: boolean) => Promise<void>;
  triggerSos: (emergencyType: SosEmergencyType, medicalNotes?: string) => Promise<void>;
  cancelSos: () => Promise<void>;
  addCheckpoint: (title: string, type: TrailCheckpoint["type"], description?: string) => Promise<void>;
  joinNetwork: (networkId: string, peerName: string) => Promise<void>;
  syncCloudNow: () => Promise<number>;
  updateLocationAndHeading: () => Promise<void>;
  cleanup: () => void;
}

export const useOffGridMeshStore = create<OffGridMeshStoreState>((set, get) => ({
  networkState: offGridMeshService.getState(),
  messages: [],
  checkpoints: [],
  activeTab: "radar",
  currentLocation: null,
  compassHeading: 0,
  selectedPeer: null,
  isLoading: true,
  isSendingMessage: false,
  isTriggeringSos: false,

  initialize: async (networkId?: string, peerName?: string) => {
    set({ isLoading: true });
    try {
      if (activeSubscriptionUnsubscribe) {
        activeSubscriptionUnsubscribe();
        activeSubscriptionUnsubscribe = null;
      }

      const state = await offGridMeshService.startMesh(networkId, peerName);
      const messages = await offGridMeshService.getMessages();
      const checkpoints = await offGridMeshService.getCheckpoints();

      set({
        networkState: state,
        messages,
        checkpoints,
        isLoading: false,
      });

      activeSubscriptionUnsubscribe = offGridMeshService.subscribe((updatedState) => {
        set({ networkState: updatedState });
      });

      // Initial GPS & Heading poll
      await get().updateLocationAndHeading();
    } catch {
      set({ isLoading: false });
    }
  },

  setActiveTab: (activeTab: MeshActiveTab) => set({ activeTab }),

  setSelectedPeer: (selectedPeer: MeshNode | null) => set({ selectedPeer }),

  setPowerMode: (mode: MeshPowerMode) => {
    const updated = offGridMeshService.setPowerMode(mode);
    set({ networkState: updated });
  },

  sendMessage: async (text: string, isUrgent: boolean = false) => {
    if (!text.trim()) return;
    set({ isSendingMessage: true });
    try {
      const msg = await offGridMeshService.sendMessage(text, isUrgent);
      const currentList = get().messages;
      set({
        messages: [...currentList, msg],
        isSendingMessage: false,
      });
    } catch {
      set({ isSendingMessage: false });
    }
  },

  triggerSos: async (emergencyType: SosEmergencyType, medicalNotes?: string) => {
    set({ isTriggeringSos: true });
    try {
      const battery = get().networkState.connectedNodes[0]?.batteryLevel || 78;
      await offGridMeshService.triggerSosBeacon({
        emergencyType,
        medicalNotes,
        batteryPercentage: battery,
      });
      const messages = await offGridMeshService.getMessages();
      set({
        messages,
        isTriggeringSos: false,
        activeTab: "sos",
      });
    } catch {
      set({ isTriggeringSos: false });
    }
  },

  cancelSos: async () => {
    await offGridMeshService.cancelSosBeacon();
    const messages = await offGridMeshService.getMessages();
    set({ messages });
  },

  addCheckpoint: async (title: string, type: TrailCheckpoint["type"], description?: string) => {
    const cp = await offGridMeshService.addCheckpoint({ title, type, description });
    const currentLoc = get().currentLocation;
    const checkpoints = await offGridMeshService.getCheckpoints(currentLoc || undefined);
    const messages = await offGridMeshService.getMessages();
    set({ checkpoints, messages });
  },

  joinNetwork: async (networkId: string, peerName: string) => {
    await get().initialize(networkId, peerName);
  },

  syncCloudNow: async () => {
    const count = await offGridMeshService.checkCloudConnectivityAndSync();
    const messages = await offGridMeshService.getMessages();
    set({ messages });
    return count;
  },

  updateLocationAndHeading: async () => {
    try {
      const coords = await offGridMeshService.acquireLiveCoordinates();
      const checkpoints = await offGridMeshService.getCheckpoints(coords);
      set({
        currentLocation: coords,
        compassHeading: 0,
        checkpoints,
      });
    } catch {}
  },

  cleanup: () => {
    if (activeSubscriptionUnsubscribe) {
      activeSubscriptionUnsubscribe();
      activeSubscriptionUnsubscribe = null;
    }
    offGridMeshService.stopMesh();
  },
}));

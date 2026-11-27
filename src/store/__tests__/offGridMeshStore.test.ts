jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn().mockResolvedValue(undefined),
  notificationAsync: jest.fn().mockResolvedValue(undefined),
  ImpactFeedbackStyle: { Light: "Light", Medium: "Medium", Heavy: "Heavy" },
  NotificationFeedbackType: { Success: "Success", Warning: "Warning", Error: "Error" },
}));

jest.mock("expo-location", () => ({
  getForegroundPermissionsAsync: jest.fn().mockResolvedValue({ status: "granted", granted: true }),
  requestForegroundPermissionsAsync: jest.fn().mockResolvedValue({ status: "granted", granted: true }),
  getCurrentPositionAsync: jest.fn().mockResolvedValue({
    coords: {
      latitude: 23.3824,
      longitude: 92.2938,
      altitude: 450,
      heading: 45,
    },
  }),
  Accuracy: { Balanced: 3 },
}));

jest.mock("../../services/safety/sosService", () => ({
  sosService: {
    triggerOneTapSOS: jest.fn().mockResolvedValue({ success: true, dispatchId: "test-sos-1" }),
    getCurrentLocation: jest.fn().mockResolvedValue({
      latitude: 23.3824,
      longitude: 92.2938,
      timestamp: Date.now(),
    }),
  },
}));

import { useOffGridMeshStore } from "../offGridMeshStore";
import { offGridMeshService } from "../../services/mesh/offGridMeshService";
import AsyncStorage from "@react-native-async-storage/async-storage";

global.fetch = jest.fn().mockRejectedValue(new Error("Offline in mountains"));

describe("useOffGridMeshStore - Zustand Mesh State Management", () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    useOffGridMeshStore.getState().cleanup();
  });

  afterEach(() => {
    useOffGridMeshStore.getState().cleanup();
  });

  afterAll(() => {
    offGridMeshService.stopMesh();
  });

  it("should initialize with default state and load network data", async () => {
    await useOffGridMeshStore.getState().initialize("TEST-NET-01", "Hiker-Tanvir");

    const state = useOffGridMeshStore.getState();
    expect(state.isLoading).toBe(false);
    expect(state.networkState.networkId).toBe("TEST-NET-01");
    expect(state.networkState.localNodeName).toBe("Hiker-Tanvir");
    expect(state.networkState.isActive).toBe(true);
    expect(state.checkpoints.length).toBeGreaterThan(0);
  });

  it("should switch active tabs cleanly", () => {
    const store = useOffGridMeshStore.getState();
    expect(store.activeTab).toBe("radar");

    store.setActiveTab("chat");
    expect(useOffGridMeshStore.getState().activeTab).toBe("chat");

    store.setActiveTab("sos");
    expect(useOffGridMeshStore.getState().activeTab).toBe("sos");

    store.setActiveTab("trail");
    expect(useOffGridMeshStore.getState().activeTab).toBe("trail");
  });

  it("should select and deselect peer nodes", () => {
    const peer = {
      id: "node-lead-01",
      name: "Tariq (Lead Guide)",
      role: "guide" as const,
      rssi: -65,
      estimatedDistanceMeters: 2.5,
      batteryLevel: 94,
      lastSeenTimestamp: Date.now(),
      isSosActive: false,
      hopCount: 1,
    };

    useOffGridMeshStore.getState().setSelectedPeer(peer);
    expect(useOffGridMeshStore.getState().selectedPeer?.id).toBe("node-lead-01");

    useOffGridMeshStore.getState().setSelectedPeer(null);
    expect(useOffGridMeshStore.getState().selectedPeer).toBeNull();
  });

  it("should update power mode in network state", async () => {
    await useOffGridMeshStore.getState().initialize();

    useOffGridMeshStore.getState().setPowerMode("eco");
    expect(useOffGridMeshStore.getState().networkState.powerMode).toBe("eco");

    useOffGridMeshStore.getState().setPowerMode("emergency");
    expect(useOffGridMeshStore.getState().networkState.powerMode).toBe("emergency");
  });

  it("should send an off-grid chat message and append to timeline", async () => {
    await useOffGridMeshStore.getState().initialize("CHAT-NET", "Sender-01");

    await useOffGridMeshStore.getState().sendMessage("Water spring found near camp!", false);

    const messages = useOffGridMeshStore.getState().messages;
    const sentMsg = messages.find((m) => m.text === "Water spring found near camp!");
    expect(sentMsg).toBeDefined();
    expect(sentMsg?.senderName).toBe("Sender-01");
  });

  it("should ignore empty chat messages", async () => {
    await useOffGridMeshStore.getState().initialize();
    const initialCount = useOffGridMeshStore.getState().messages.length;

    await useOffGridMeshStore.getState().sendMessage("   ");
    expect(useOffGridMeshStore.getState().messages.length).toBe(initialCount);
  });

  it("should trigger and cancel SOS distress beacon", async () => {
    await useOffGridMeshStore.getState().initialize();

    await useOffGridMeshStore.getState().triggerSos("injury", "Sprained left ankle near Keokradong slope");

    expect(useOffGridMeshStore.getState().networkState.activeSosBeacon).toBeDefined();
    expect(useOffGridMeshStore.getState().networkState.activeSosBeacon?.emergencyType).toBe("injury");
    expect(useOffGridMeshStore.getState().activeTab).toBe("sos");

    const messages = useOffGridMeshStore.getState().messages;
    const sosMsg = messages.find((m) => m.isUrgent);
    expect(sosMsg).toBeDefined();

    await useOffGridMeshStore.getState().cancelSos();
    expect(useOffGridMeshStore.getState().networkState.activeSosBeacon).toBeNull();
    const updatedMessages = useOffGridMeshStore.getState().messages;
    const cancelMsg = updatedMessages.find((m) => m.text.includes("[SOS CANCELLED]"));
    expect(cancelMsg).toBeDefined();
  });

  it("should add custom trail checkpoints", async () => {
    await useOffGridMeshStore.getState().initialize();
    const prevCount = useOffGridMeshStore.getState().checkpoints.length;

    await useOffGridMeshStore.getState().addCheckpoint("Boga Lake South Ridge", "rendezvous", "Viewpoint before climbing Keokradong");

    const checkpoints = useOffGridMeshStore.getState().checkpoints;
    expect(checkpoints.length).toBe(prevCount + 1);
    const added = checkpoints.find((c) => c.title === "Boga Lake South Ridge");
    expect(added?.type).toBe("rendezvous");
  });
});

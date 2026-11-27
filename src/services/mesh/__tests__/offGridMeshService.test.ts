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

jest.mock("../../safety/sosService", () => ({
  sosService: {
    triggerOneTapSOS: jest.fn().mockResolvedValue({ success: true, dispatchId: "test-sos-1" }),
    getCurrentLocation: jest.fn().mockResolvedValue({
      latitude: 23.3824,
      longitude: 92.2938,
      timestamp: Date.now(),
    }),
  },
}));

global.fetch = jest.fn().mockRejectedValue(new Error("Offline in mountains"));

import { offGridMeshService } from "../offGridMeshService";
import AsyncStorage from "@react-native-async-storage/async-storage";

describe("OffGridMeshService - Offline P2P Mesh Communication Engine", () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  afterEach(() => {
    offGridMeshService.stopMesh();
  });

  afterAll(() => {
    offGridMeshService.stopMesh();
  });

  describe("Logarithmic Path Loss Distance Calculation", () => {
    it("should calculate ~1.0m at reference TxPower (-59 dBm)", () => {
      const dist = offGridMeshService.calculateDistanceMeters(-59);
      expect(dist).toBeCloseTo(1.0, 1);
    });

    it("should increase estimated distance as RSSI drops", () => {
      const nearDist = offGridMeshService.calculateDistanceMeters(-65);
      const midDist = offGridMeshService.calculateDistanceMeters(-75);
      const farDist = offGridMeshService.calculateDistanceMeters(-90);

      expect(nearDist).toBeLessThan(midDist);
      expect(midDist).toBeLessThan(farDist);
      expect(farDist).toBeGreaterThan(15);
    });

    it("should clamp extreme RSSI readings to reasonable physical bounds", () => {
      const clampedNear = offGridMeshService.calculateDistanceMeters(-10);
      const clampedFar = offGridMeshService.calculateDistanceMeters(-120);

      expect(clampedNear).toBeGreaterThanOrEqual(0.5);
      expect(clampedFar).toBeLessThanOrEqual(150);
    });
  });

  describe("Geographic Math: Haversine & Compass Bearing", () => {
    const ruiluiCamp = {
      latitude: 23.3824,
      longitude: 92.2938,
      timestamp: Date.now(),
    };
    const konglakPeak = {
      latitude: 23.3915,
      longitude: 92.2892,
      timestamp: Date.now(),
    };

    it("should accurately compute distance between trail points", () => {
      const distMeters = offGridMeshService.calculateHaversineDistanceMeters(
        ruiluiCamp,
        konglakPeak
      );
      // Ruilui to Konglak is approximately 1.1km - 1.3km straight line
      expect(distMeters).toBeGreaterThan(900);
      expect(distMeters).toBeLessThan(1500);
    });

    it("should compute valid compass forward bearing (0 - 360 deg)", () => {
      const bearing = offGridMeshService.calculateCompassBearing(
        ruiluiCamp,
        konglakPeak
      );
      expect(bearing).toBeGreaterThanOrEqual(0);
      expect(bearing).toBeLessThanOrEqual(360);
    });
  });

  describe("P2P Mesh Messaging & Store-and-Forward", () => {
    it("should boot mesh with custom network ID and peer name", async () => {
      const state = await offGridMeshService.startMesh(
        "BANDARBAN-EXPEDITION",
        "Explorer Rafi"
      );
      expect(state.networkId).toBe("BANDARBAN-EXPEDITION");
      expect(state.localNodeName).toBe("Explorer Rafi");
      expect(state.isActive).toBe(true);
      expect(state.connectedNodes.length).toBeGreaterThan(0);
    });

    it("should send and persist a decentralized mesh message", async () => {
      await offGridMeshService.startMesh("SAJEK-TEST", "Tester");
      const msg = await offGridMeshService.sendMessage(
        "Reached waterfall checkpoint safely."
      );

      expect(msg.text).toBe("Reached waterfall checkpoint safely.");
      expect(msg.status).toBe("sent");
      expect(msg.hops).toBe(1);

      const all = await offGridMeshService.getMessages();
      const found = all.find((m) => m.id === msg.id);
      expect(found).toBeDefined();
      expect(found?.text).toBe("Reached waterfall checkpoint safely.");
    });

    it("should support tactical urgent messages", async () => {
      await offGridMeshService.startMesh("SAJEK-TEST", "Tester");
      const urgentMsg = await offGridMeshService.sendMessage(
        "Heavy rain starting, gather at cave.",
        true
      );
      expect(urgentMsg.isUrgent).toBe(true);
    });
  });

  describe("Offline SOS Distress Beacon", () => {
    it("should broadcast distress beacon and switch to emergency duty cycle", async () => {
      await offGridMeshService.startMesh("SOS-TEST", "Distressed Traveler");
      const beacon = await offGridMeshService.triggerSosBeacon({
        emergencyType: "injury",
        medicalNotes: "Sprained right knee on boulders",
        batteryPercentage: 45,
      });

      expect(beacon.emergencyType).toBe("injury");
      expect(beacon.medicalNotes).toBe("Sprained right knee on boulders");
      expect(beacon.batteryPercentage).toBe(45);
      expect(beacon.cloudSynced).toBe(false);

      const state = offGridMeshService.getState();
      expect(state.activeSosBeacon).toBeDefined();
      expect(state.activeSosBeacon?.id).toBe(beacon.id);
      expect(state.powerMode).toBe("emergency");
      expect(state.dutyCycleSeconds.scanInterval).toBe(4);
    });

    it("should cancel active SOS beacon cleanly", async () => {
      await offGridMeshService.startMesh("SOS-TEST", "Distressed Traveler");
      await offGridMeshService.triggerSosBeacon({
        emergencyType: "lost",
        batteryPercentage: 60,
      });

      await offGridMeshService.cancelSosBeacon();
      const state = offGridMeshService.getState();
      expect(state.activeSosBeacon).toBeNull();
      expect(state.powerMode).toBe("balanced");
    });
  });

  describe("Offline Trail Checkpoint Pins", () => {
    it("should add and retrieve offline trail checkpoints", async () => {
      await offGridMeshService.startMesh("TRAIL-TEST", "Trail Scout");
      const cp = await offGridMeshService.addCheckpoint({
        title: "Hidden Water Spring",
        type: "water_source",
        description: "Pure natural spring near bamboo grove",
      });

      expect(cp.title).toBe("Hidden Water Spring");
      expect(cp.type).toBe("water_source");

      const all = await offGridMeshService.getCheckpoints();
      const found = all.find((p) => p.id === cp.id);
      expect(found).toBeDefined();
    });
  });

  describe("Duty Cycle Battery Management", () => {
    it("should switch between eco and balanced power modes", () => {
      offGridMeshService.setPowerMode("eco");
      let state = offGridMeshService.getState();
      expect(state.powerMode).toBe("eco");
      expect(state.dutyCycleSeconds.scanInterval).toBe(30);

      offGridMeshService.setPowerMode("balanced");
      state = offGridMeshService.getState();
      expect(state.powerMode).toBe("balanced");
      expect(state.dutyCycleSeconds.scanInterval).toBe(12);
    });
  });
});

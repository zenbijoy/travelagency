import React from "react";
import renderer, { act } from "react-test-renderer";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

jest.mock(
  "expo-asset",
  () => ({
    Asset: {
      fromModule: () => ({ downloadAsync: jest.fn(), uri: "" }),
    },
  }),
  { virtual: true }
);

jest.mock("expo-font", () => ({
  isLoaded: () => true,
  loadAsync: jest.fn().mockResolvedValue(true),
}));

jest.mock("@expo/vector-icons", () => {
  const { View } = require("react-native");
  return {
    Ionicons: View,
    MaterialCommunityIcons: View,
    Feather: View,
  };
});
jest.mock("@expo/vector-icons/Ionicons", () => require("react-native").View);
jest.mock("@expo/vector-icons/MaterialCommunityIcons", () => require("react-native").View);
jest.mock("@expo/vector-icons/Feather", () => require("react-native").View);

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
  watchHeadingAsync: jest.fn().mockResolvedValue({
    remove: jest.fn(),
  }),
  Accuracy: { Balanced: 3 },
}));

jest.mock("react-native-safe-area-context", () => ({
  SafeAreaView: ({ children, style }: any) => <>{children}</>,
  useSafeAreaInsets: () => ({ top: 44, bottom: 34, left: 0, right: 0 }),
}));

jest.mock("expo-router", () => ({
  router: {
    back: jest.fn(),
    push: jest.fn(),
    replace: jest.fn(),
  },
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

global.fetch = jest.fn().mockRejectedValue(new Error("Offline mesh testing"));

import OffGridMeshScreen from "../OffGridMeshScreen";
import { useOffGridMeshStore } from "../../store/offGridMeshStore";
import { offGridMeshService } from "../../services/mesh/offGridMeshService";

describe("OffGridMeshScreen Component", () => {
  let currentTree: renderer.ReactTestRenderer | null = null;

  beforeEach(() => {
    jest.clearAllMocks();
    useOffGridMeshStore.getState().cleanup();
  });

  afterEach(() => {
    if (currentTree) {
      act(() => {
        currentTree?.unmount();
      });
      currentTree = null;
    }
    useOffGridMeshStore.getState().cleanup();
    offGridMeshService.stopMesh();
  });

  afterAll(() => {
    offGridMeshService.stopMesh();
  });

  it("should render the screen with header, active nodes, and radar view", async () => {
    await act(async () => {
      currentTree = renderer.create(<OffGridMeshScreen />);
    });

    expect(currentTree).toBeDefined();
    const json = currentTree!.toJSON();
    expect(json).toBeDefined();

    const root = currentTree!.root;
    // Verify Network ID in header
    const netIdText = root.findAll((node) =>
      typeof node.children[0] === "string" && node.children[0].includes("SAJEK-EXPEDITION-2026")
    );
    expect(netIdText.length).toBeGreaterThan(0);
  }, 15000);

  it("should switch to chat tab and render tactical presets", async () => {
    await act(async () => {
      currentTree = renderer.create(<OffGridMeshScreen />);
    });

    await act(async () => {
      useOffGridMeshStore.getState().setActiveTab("chat");
    });

    const root = currentTree!.root;
    // Verify tactical chips appear
    const presetChip = root.findAll((node) =>
      typeof node.children[0] === "string" && node.children[0].includes("I'm safe")
    );
    expect(presetChip.length).toBeGreaterThan(0);
  });

  it("should switch to SOS tab and display emergency selectors", async () => {
    await act(async () => {
      currentTree = renderer.create(<OffGridMeshScreen />);
    });

    await act(async () => {
      useOffGridMeshStore.getState().setActiveTab("sos");
    });

    const root = currentTree!.root;
    // Verify SOS beacon card
    const sosTitle = root.findAll((node) =>
      typeof node.children[0] === "string" && node.children[0].includes("Offline Distress Beacon")
    );
    expect(sosTitle.length).toBeGreaterThan(0);
  });

  it("should switch to Trail tab and display offline checkpoints", async () => {
    await act(async () => {
      currentTree = renderer.create(<OffGridMeshScreen />);
    });

    await act(async () => {
      useOffGridMeshStore.getState().setActiveTab("trail");
    });

    const root = currentTree!.root;
    // Verify trail header button
    const pinButton = root.findAll((node) =>
      typeof node.children[0] === "string" && node.children[0].includes("Drop Pin")
    );
    expect(pinButton.length).toBeGreaterThan(0);
  });
});

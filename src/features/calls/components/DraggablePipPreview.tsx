import React, { useRef, useState } from "react";
import {
  View,
  StyleSheet,
  Pressable,
  PanResponder,
  Animated,
  Dimensions,
  Text,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { CameraView, CameraType } from "expo-camera";

interface Props {
  cameraFacing: CameraType;
  isVideoEnabled: boolean;
  onFlipCamera: () => void;
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");
const PIP_WIDTH = 100;
const PIP_HEIGHT = 140;

export const DraggablePipPreview: React.FC<Props> = ({
  cameraFacing,
  isVideoEnabled,
  onFlipCamera,
}) => {
  const pan = useRef(new Animated.ValueXY({ x: SCREEN_WIDTH - PIP_WIDTH - 20, y: 100 })).current;
  const [minimized, setMinimized] = useState(false);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return Math.abs(gestureState.dx) > 4 || Math.abs(gestureState.dy) > 4;
      },
      onPanResponderGrant: () => {
        pan.setOffset({
          x: (pan.x as any)._value,
          y: (pan.y as any)._value,
        });
        pan.setValue({ x: 0, y: 0 });
      },
      onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], {
        useNativeDriver: false,
      }),
      onPanResponderRelease: () => {
        pan.flattenOffset();
      },
    })
  ).current;

  if (!isVideoEnabled) return null;

  return (
    <Animated.View
      {...panResponder.panHandlers}
      style={[
        styles.container,
        {
          transform: [{ translateX: pan.x }, { translateY: pan.y }],
          width: minimized ? 44 : PIP_WIDTH,
          height: minimized ? 44 : PIP_HEIGHT,
        },
      ]}
    >
      {minimized ? (
        <Pressable style={styles.minimizedCircle} onPress={() => setMinimized(false)}>
          <Ionicons name="videocam" size={18} color="#FFFFFF" />
        </Pressable>
      ) : (
        <View style={styles.cameraBox}>
          {/* Real or Mock Camera Stream */}
          <CameraView facing={cameraFacing} style={styles.cameraView}>
            <View style={styles.overlayControls}>
              <Pressable
                style={styles.microBtn}
                onPress={onFlipCamera}
                hitSlop={6}
              >
                <Ionicons name="camera-reverse" size={12} color="#FFFFFF" />
              </Pressable>
              <Pressable
                style={styles.microBtn}
                onPress={() => setMinimized(true)}
                hitSlop={6}
              >
                <Ionicons name="contract-outline" size={12} color="#FFFFFF" />
              </Pressable>
            </View>
          </CameraView>
        </View>
      )}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 0,
    left: 0,
    zIndex: 90,
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1.5,
    borderColor: "rgba(56, 189, 248, 0.6)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
    backgroundColor: "#0F172A",
  },
  minimizedCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(15, 23, 42, 0.9)",
    alignItems: "center",
    justifyContent: "center",
  },
  cameraBox: {
    flex: 1,
    position: "relative",
  },
  cameraView: {
    flex: 1,
  },
  overlayControls: {
    position: "absolute",
    top: 4,
    left: 4,
    right: 4,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  microBtn: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "rgba(0, 0, 0, 0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
});

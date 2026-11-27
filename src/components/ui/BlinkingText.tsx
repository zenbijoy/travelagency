/**
 * BlinkingText — Animated typography placeholder / loading state indicator.
 * Uses react-native-reanimated for 60fps smooth opacity pulse.
 * Props:
 *  - text: string — the placeholder text shown while loading
 *  - interval?: number — full pulse cycle ms (default 900)
 *  - color?: string — text color (default "#94a3b8")
 *  - fontSize?: number — text size (default 14)
 *  - style?: StyleProp<TextStyle>
 *  - numberOfLines?: number
 */

import React, { useEffect } from "react";
import { Text, StyleSheet, StyleProp, TextStyle } from "react-native";
import Animated, {
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  useAnimatedStyle,
  Easing,
} from "react-native-reanimated";

interface BlinkingTextProps {
  text: string;
  interval?: number;
  color?: string;
  fontSize?: number;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
}

export const BlinkingText: React.FC<BlinkingTextProps> = ({
  text,
  interval = 900,
  color = "#94a3b8",
  fontSize = 14,
  style,
  numberOfLines,
}) => {
  const opacity = useSharedValue(1);

  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(
        withTiming(0.25, { duration: interval / 2, easing: Easing.inOut(Easing.ease) }),
        withTiming(1.0, { duration: interval / 2, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      false
    );
  }, [interval, opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <Animated.Text
      style={[styles.base, { color, fontSize }, animatedStyle, style]}
      numberOfLines={numberOfLines}
    >
      {text}
    </Animated.Text>
  );
};

const styles = StyleSheet.create({
  base: {
    fontFamily: undefined, // Inherits from theme
  },
});

export default BlinkingText;

import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, StyleProp, ViewStyle, TextStyle } from "react-native";
import { Colors, BorderRadius, Spacing } from "./tokens";

export interface SharedBadgeProps {
  label: string;
  variant?: "success" | "warning" | "danger" | "info" | "neutral" | "gold";
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
}

export const SharedBadge: React.FC<SharedBadgeProps> = ({
  label,
  variant = "neutral",
  style,
  textStyle,
}) => {
  const getColors = () => {
    switch (variant) {
      case "success":
        return { bg: "rgba(34, 197, 94, 0.15)", text: Colors.success };
      case "warning":
        return { bg: "rgba(245, 158, 11, 0.15)", text: Colors.warning };
      case "danger":
        return { bg: "rgba(239, 68, 68, 0.15)", text: Colors.danger };
      case "info":
        return { bg: "rgba(59, 130, 246, 0.15)", text: Colors.info };
      case "gold":
        return { bg: "rgba(229, 169, 60, 0.15)", text: Colors.gold };
      default:
        return { bg: Colors.gray800, text: Colors.gray300 };
    }
  };

  const { bg, text } = getColors();

  return (
    <View style={[styles.badgeBase, { backgroundColor: bg }, style]}>
      <Text style={[styles.badgeText, { color: text }, textStyle]}>{label}</Text>
    </View>
  );
};

export interface SharedCardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
}

export const SharedCard: React.FC<SharedCardProps> = ({ children, style, onPress }) => {
  if (onPress) {
    return (
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={onPress}
        style={[styles.cardBase, style]}
      >
        {children}
      </TouchableOpacity>
    );
  }
  return <View style={[styles.cardBase, style]}>{children}</View>;
};

export interface SharedButtonProps {
  title: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "outline" | "danger";
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
}

export const SharedButton: React.FC<SharedButtonProps> = ({
  title,
  onPress,
  variant = "primary",
  disabled = false,
  style,
  textStyle,
}) => {
  const getStyle = () => {
    switch (variant) {
      case "secondary":
        return { bg: Colors.navyLight, text: Colors.white, border: "transparent" };
      case "outline":
        return { bg: "transparent", text: Colors.gold, border: Colors.gold };
      case "danger":
        return { bg: Colors.danger, text: Colors.white, border: "transparent" };
      default:
        return { bg: Colors.gold, text: Colors.navyDark, border: "transparent" };
    }
  };

  const current = getStyle();

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      disabled={disabled}
      style={[
        styles.buttonBase,
        {
          backgroundColor: disabled ? Colors.gray700 : current.bg,
          borderColor: current.border,
          borderWidth: current.border === "transparent" ? 0 : 1,
          opacity: disabled ? 0.6 : 1,
        },
        style,
      ]}
    >
      <Text
        style={[
          styles.buttonText,
          { color: disabled ? Colors.gray400 : current.text },
          textStyle,
        ]}
      >
        {title}
      </Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  badgeBase: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
    alignSelf: "flex-start",
  },
  badgeText: {
    fontSize: 12,
    fontWeight: "600",
  },
  cardBase: {
    backgroundColor: Colors.navyLight,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  buttonBase: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: {
    fontSize: 15,
    fontWeight: "700",
  },
});

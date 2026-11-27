/**
 * Dashboard UI Primitives — light theme, Feather icons, accessible states.
 * Reusable building blocks for the Agency dashboard surfaces.
 */
import React, { ReactNode } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ViewStyle,
  StyleProp,
} from "react-native";
import { Feather } from "@expo/vector-icons";

import {
  palette,
  radius,
  spacing,
  typography,
  shadow,
  toneColor,
} from "../../theme/tokens";
import type { Tone } from "../../theme/tokens";

// ---------------------------------------------------------------------------
// Icon
// ---------------------------------------------------------------------------
type FeatherName = React.ComponentProps<typeof Feather>["name"];

export interface IconProps {
  name: FeatherName;
  size?: number;
  color?: string;
  style?: StyleProp<any>;
}

export const Icon: React.FC<IconProps> = ({
  name,
  size = 20,
  color = palette.text,
  style,
}) => <Feather name={name} size={size} color={color} style={style} />;

// ---------------------------------------------------------------------------
// Button
// ---------------------------------------------------------------------------
type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: FeatherName;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

const buttonHeights: Record<ButtonSize, number> = { sm: 32, md: 40, lg: 48 };

export const Button: React.FC<ButtonProps> = ({
  label,
  onPress,
  variant = "primary",
  size = "md",
  icon,
  loading = false,
  disabled = false,
  style,
}) => {
  const isDisabled = disabled || loading;
  const bg =
    variant === "primary"
      ? palette.primary
      : variant === "danger"
      ? palette.danger
      : variant === "secondary"
      ? palette.primarySoft
      : "transparent";
  const fg =
    variant === "primary" || variant === "danger"
      ? palette.textInverse
      : variant === "secondary"
      ? palette.primary
      : variant === "outline"
      ? palette.text
      : palette.textSecondary;
  const iconSize = size === "sm" ? 14 : size === "lg" ? 18 : 16;

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={isDisabled ? undefined : onPress}
      disabled={isDisabled}
      style={[
        styles.button,
        { height: buttonHeights[size], backgroundColor: bg, opacity: isDisabled ? 0.55 : 1 },
        variant === "outline" && {
          borderWidth: 1,
          borderColor: palette.borderStrong,
          backgroundColor: palette.surface,
        },
        variant === "ghost" && { backgroundColor: "transparent" },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={fg} />
      ) : (
        <>
          {icon ? <Icon name={icon} size={iconSize} color={fg} /> : null}
          <Text style={[styles.buttonText, { color: fg, fontSize: size === "sm" ? 12 : 14 }]}>
            {label}
          </Text>
        </>
      )}
    </TouchableOpacity>
  );
};

// ---------------------------------------------------------------------------
// Icon Button
// ---------------------------------------------------------------------------
export interface IconButtonProps {
  icon: FeatherName;
  onPress: () => void;
  color?: string;
  size?: number;
  badgeCount?: number;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

export const IconButton: React.FC<IconButtonProps> = ({
  icon,
  onPress,
  color = palette.textSecondary,
  size = 18,
  badgeCount,
  accessibilityLabel,
  style,
}) => (
  <TouchableOpacity
    activeOpacity={0.7}
    onPress={onPress}
    accessibilityLabel={accessibilityLabel}
    style={[styles.iconBtn, style]}
  >
    <Icon name={icon} size={size} color={color} />
    {badgeCount && badgeCount > 0 ? (
      <View style={styles.iconBadge}>
        <Text style={styles.iconBadgeText}>{badgeCount > 9 ? "9+" : badgeCount}</Text>
      </View>
    ) : null}
  </TouchableOpacity>
);

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------
export interface CardProps {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  raised?: boolean;
  padded?: boolean;
}

export const Card: React.FC<CardProps> = ({ children, style, raised, padded = true }) => (
  <View
    style={[
      styles.card,
      padded ? styles.cardPadded : null,
      raised ? shadow.raised : shadow.card,
      style,
    ]}
  >
    {children}
  </View>
);

// ---------------------------------------------------------------------------
// Badge
// ---------------------------------------------------------------------------
export interface BadgeProps {
  label: string;
  tone?: Tone;
  style?: StyleProp<ViewStyle>;
}

export const Badge: React.FC<BadgeProps> = ({ label, tone = "neutral", style }) => {
  const c = toneColor[tone];
  return (
    <View style={[styles.badge, { backgroundColor: c.bg }, style]}>
      <Text style={[styles.badgeText, { color: c.fg }]}>{label}</Text>
    </View>
  );
};

// ---------------------------------------------------------------------------
// Section Header
// ---------------------------------------------------------------------------
export interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onActionPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

export const SectionHeader: React.FC<SectionHeaderProps> = ({
  title,
  subtitle,
  actionLabel,
  onActionPress,
  style,
}) => (
  <View style={[styles.sectionHeader, style]}>
    <View style={{ flex: 1 }}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
    </View>
    {actionLabel ? (
      <TouchableOpacity activeOpacity={0.7} onPress={onActionPress}>
        <Text style={styles.sectionAction}>{actionLabel}</Text>
      </TouchableOpacity>
    ) : null}
  </View>
);

// ---------------------------------------------------------------------------
// State View (loading / empty / error)
// ---------------------------------------------------------------------------
export interface StateViewProps {
  variant: "loading" | "empty" | "error";
  title?: string;
  message?: string;
  icon?: FeatherName;
  actionLabel?: string;
  onActionPress?: () => void;
}

export const StateView: React.FC<StateViewProps> = ({
  variant,
  title,
  message,
  icon,
  actionLabel,
  onActionPress,
}) => {
  if (variant === "loading") {
    return (
      <View style={styles.stateWrap}>
        <ActivityIndicator size="large" color={palette.primary} />
        {message ? <Text style={styles.stateMessage}>{message}</Text> : null}
      </View>
    );
  }

  const defaultIcon: FeatherName =
    variant === "error" ? "alert-triangle" : "inbox";
  const defaultTitle =
    variant === "error" ? "Something went wrong" : "Nothing here yet";
  const tint =
    variant === "error" ? palette.danger : palette.textMuted;

  return (
    <View style={styles.stateWrap}>
      <View
        style={[
          styles.stateIconWrap,
          { backgroundColor: variant === "error" ? palette.dangerSoft : palette.surfaceAlt },
        ]}
      >
        <Icon name={icon ?? defaultIcon} size={30} color={tint} />
      </View>
      <Text style={styles.stateTitle}>{title ?? defaultTitle}</Text>
      {message ? <Text style={styles.stateMessage}>{message}</Text> : null}
      {actionLabel && onActionPress ? (
        <Button
          label={actionLabel}
          onPress={onActionPress}
          variant={variant === "error" ? "primary" : "outline"}
          size="sm"
          icon={variant === "error" ? "refresh-cw" : undefined}
          style={{ marginTop: spacing.md }}
        />
      ) : null}
    </View>
  );
};

// ---------------------------------------------------------------------------
// KPI Card
// ---------------------------------------------------------------------------
export interface KpiCardProps {
  label: string;
  value: string;
  icon: FeatherName;
  tone?: Tone;
  trend?: number;
  trendLabel?: string;
}

export const KpiCard: React.FC<KpiCardProps> = ({
  label,
  value,
  icon,
  tone = "primary",
  trend,
  trendLabel,
}) => {
  const c = toneColor[tone];
  const showTrend = typeof trend === "number" && trend !== 0;
  const up = (trend ?? 0) >= 0;
  return (
    <Card style={styles.kpiCard}>
      <View style={styles.kpiTop}>
        <View style={[styles.kpiIcon, { backgroundColor: c.bg }]}>
          <Icon name={icon} size={18} color={c.fg} />
        </View>
        {showTrend ? (
          <View
            style={[
              styles.trendChip,
              { backgroundColor: up ? palette.successSoft : palette.dangerSoft },
            ]}
          >
            <Icon
              name={up ? "trending-up" : "trending-down"}
              size={11}
              color={up ? palette.success : palette.danger}
            />
            <Text style={[styles.trendText, { color: up ? palette.success : palette.danger }]}>
              {up ? "+" : ""}
              {trend}%
            </Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.kpiLabel}>{label}</Text>
      <Text style={styles.kpiValue} numberOfLines={1}>
        {value}
      </Text>
      {trendLabel ? <Text style={styles.kpiSub}>{trendLabel}</Text> : null}
    </Card>
  );
};

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------
export const Skeleton: React.FC<{ style?: StyleProp<ViewStyle> }> = ({ style }) => (
  <View style={[styles.skeleton, style]} />
);

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
  },
  buttonText: { fontWeight: "700" },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: palette.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  iconBadge: {
    position: "absolute",
    top: -3,
    right: -3,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: palette.danger,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: palette.surface,
  },
  iconBadgeText: { color: "#fff", fontSize: 9, fontWeight: "800" },
  card: {
    backgroundColor: palette.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.border,
  },
  cardPadded: { padding: spacing.lg },
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
    alignSelf: "flex-start",
  },
  badgeText: { fontSize: 10, fontWeight: "800", letterSpacing: 0.3 },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.md,
  },
  sectionTitle: { ...typography.h3, color: palette.text },
  sectionSubtitle: { ...typography.caption, color: palette.textMuted, marginTop: 2 },
  sectionAction: { ...typography.label, color: palette.primary },
  stateWrap: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing["2xl"],
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  stateIconWrap: {
    width: 64,
    height: 64,
    borderRadius: radius.lg,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.sm,
  },
  stateTitle: { ...typography.h3, color: palette.text, textAlign: "center" },
  stateMessage: {
    ...typography.body,
    color: palette.textMuted,
    textAlign: "center",
    maxWidth: 320,
  },
  kpiCard: { flex: 1, padding: spacing.lg, gap: 6 },
  kpiTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  kpiIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  trendChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  trendText: { fontSize: 10, fontWeight: "800" },
  kpiLabel: { ...typography.label, color: palette.textMuted },
  kpiValue: { ...typography.h2, color: palette.text },
  kpiSub: { ...typography.caption, color: palette.textMuted },
  skeleton: {
    backgroundColor: palette.surfaceAlt,
    borderRadius: radius.md,
  },
});
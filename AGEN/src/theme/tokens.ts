/**
 * Light Design System Tokens — Agency Dashboard
 * A clean, professional travel SaaS light theme.
 * Scoped to the dashboard surfaces so the rest of the portal is untouched.
 */

export const palette = {
  background: "#F4F6FB",
  surface: "#FFFFFF",
  surfaceAlt: "#F1F5F9",
  surfaceMuted: "#F8FAFC",
  border: "#E4E9F2",
  borderStrong: "#CBD5E1",

  text: "#0F172A",
  textSecondary: "#475569",
  textMuted: "#94A3B8",
  textInverse: "#FFFFFF",

  primary: "#4F46E5",
  primaryDark: "#4338CA",
  primarySoft: "#EEF2FF",

  success: "#10B981",
  successSoft: "#ECFDF5",
  warning: "#F59E0B",
  warningSoft: "#FFFBEB",
  danger: "#EF4444",
  dangerSoft: "#FEF2F2",
  info: "#3B82F6",
  infoSoft: "#EFF6FF",
  cyan: "#06B6D4",
  cyanSoft: "#ECFEFF",
  purple: "#8B5CF6",
  purpleSoft: "#F5F3FF",
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  "2xl": 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  pill: 999,
} as const;

export const typography = {
  h1: { fontSize: 26, fontWeight: "800" as const, letterSpacing: -0.4 },
  h2: { fontSize: 20, fontWeight: "800" as const, letterSpacing: -0.3 },
  h3: { fontSize: 16, fontWeight: "700" as const },
  body: { fontSize: 14, fontWeight: "500" as const },
  label: { fontSize: 12, fontWeight: "600" as const },
  caption: { fontSize: 11, fontWeight: "500" as const },
} as const;

export const shadow = {
  card: {
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  raised: {
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
  },
} as const;

export type Tone = "primary" | "success" | "warning" | "danger" | "info" | "cyan" | "purple" | "neutral";

export const toneColor: Record<Tone, { fg: string; bg: string }> = {
  primary: { fg: palette.primary, bg: palette.primarySoft },
  success: { fg: palette.success, bg: palette.successSoft },
  warning: { fg: palette.warning, bg: palette.warningSoft },
  danger: { fg: palette.danger, bg: palette.dangerSoft },
  info: { fg: palette.info, bg: palette.infoSoft },
  cyan: { fg: palette.cyan, bg: palette.cyanSoft },
  purple: { fg: palette.purple, bg: palette.purpleSoft },
  neutral: { fg: palette.textSecondary, bg: palette.surfaceAlt },
};
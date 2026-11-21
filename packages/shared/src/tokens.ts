/**
 * Shared Design Tokens across ShopnoJatra Mobile, Agency Portal & Hotel UI
 */
export const Colors = {
  // Brand Colors
  gold: "#E5A93C",
  goldDark: "#C48821",
  goldLight: "#FDE68A",
  navy: "#0F172A",
  navyDark: "#020617",
  navyLight: "#1E293B",
  slateBg: "#0B1120",

  // Semantic Status Colors
  success: "#22C55E",
  warning: "#F59E0B",
  danger: "#EF4444",
  info: "#3B82F6",

  // Monochrome & Grays
  white: "#FFFFFF",
  gray50: "#F8FAFC",
  gray100: "#F1F5F9",
  gray200: "#E2E8F0",
  gray300: "#CBD5E1",
  gray400: "#94A3B8",
  gray500: "#64748B",
  gray600: "#475569",
  gray700: "#334155",
  gray800: "#1E293B",
  gray900: "#0F172A",

  // Overlays
  overlayBackdrop: "rgba(15, 23, 42, 0.75)",
  borderSubtle: "rgba(226, 232, 240, 0.15)",
} as const;

export const Typography = {
  fontFamily: {
    regular: "System",
    bengali: "HindSiliguri-Regular",
    bengaliBold: "HindSiliguri-Bold",
  },
} as const;

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

export const BorderRadius = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 20,
  full: 9999,
} as const;

/**
 * ShopnoJatra Design Tokens - Colors
 * Includes signature palettes: Navy, Emerald, Gold, Slate, and Semantic theme variables
 */

export const colors = {
  // Primary Brand: Deep Maritime Navy
  navy: {
    50: '#f0f5fa',
    100: '#e1ecf5',
    200: '#c3d9eb',
    300: '#95bde0',
    400: '#609cd0',
    500: '#3b7fbe',
    600: '#2a649f',
    700: '#235081',
    800: '#1e446d',
    900: '#0f2b48', // Primary brand color
    950: '#091a2d',
  },

  // Secondary Brand: Bengal Lush Emerald
  emerald: {
    50: '#ecfdf5',
    100: '#d1fae5',
    200: '#a7f3d0',
    300: '#6ee7b7',
    400: '#34d399',
    500: '#10b981',
    600: '#059669', // Primary green
    700: '#047857',
    800: '#065f46',
    900: '#064e3b',
    950: '#022c22',
  },

  // Luxury & Accent: Golden Sunset & Heritage Gold
  gold: {
    50: '#fbf8eb',
    100: '#f6efcc',
    200: '#edde99',
    300: '#e1c660',
    400: '#e5a93c', // Signature gold
    500: '#d9901d',
    600: '#bc7014',
    700: '#964f14',
    800: '#7c3f16',
    900: '#683416',
    950: '#3c1a08',
  },

  // Neutral UI scale: Modern Slate
  slate: {
    50: '#f8fafc',
    100: '#f1f5f9',
    200: '#e2e8f0',
    300: '#cbd5e1',
    400: '#94a3b8',
    500: '#64748b',
    600: '#475569',
    700: '#334155',
    800: '#1e293b',
    900: '#0f172a',
    950: '#020617',
  },

  // Semantic status palettes
  status: {
    success: '#10b981',
    successLight: '#d1fae5',
    warning: '#f59e0b',
    warningLight: '#fef3c7',
    danger: '#ef4444',
    dangerLight: '#fee2e2',
    info: '#3b82f6',
    infoLight: '#dbeafe',
  },

  // Theme palettes for CSS variables
  themes: {
    light: {
      background: '#ffffff',
      foreground: '#0f172a',
      card: '#ffffff',
      cardForeground: '#0f172a',
      popover: '#ffffff',
      popoverForeground: '#0f172a',
      primary: '#0f2b48',
      primaryForeground: '#ffffff',
      secondary: '#f1f5f9',
      secondaryForeground: '#0f172a',
      muted: '#f8fafc',
      mutedForeground: '#64748b',
      accent: '#e5a93c',
      accentForeground: '#0f172a',
      destructive: '#ef4444',
      destructiveForeground: '#ffffff',
      border: '#e2e8f0',
      input: '#e2e8f0',
      ring: '#0f2b48',
    },
    dark: {
      background: '#0b1120',
      foreground: '#f8fafc',
      card: '#0f172a',
      cardForeground: '#f8fafc',
      popover: '#0f172a',
      popoverForeground: '#f8fafc',
      primary: '#38bdf8',
      primaryForeground: '#0f172a',
      secondary: '#1e293b',
      secondaryForeground: '#f8fafc',
      muted: '#1e293b',
      mutedForeground: '#94a3b8',
      accent: '#f59e0b',
      accentForeground: '#0f172a',
      destructive: '#f87171',
      destructiveForeground: '#0f172a',
      border: '#334155',
      input: '#334155',
      ring: '#38bdf8',
    },
  },
} as const;

export type Colors = typeof colors;

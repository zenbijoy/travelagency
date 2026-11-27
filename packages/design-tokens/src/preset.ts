import { colors } from './colors';
import { typography } from './typography';
import { spacing } from './spacing';
import { shadows } from './shadows';
import { radii } from './radii';

/**
 * ShopnoJatra Tailwind Preset
 * Provides unified theme colors (navy, emerald, gold, slate), typography, spacing, radius, and shadows.
 */
export const shopnojatraTailwindPreset = {
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        navy: colors.navy,
        emerald: colors.emerald,
        gold: colors.gold,
        slate: colors.slate,
        brand: {
          primary: colors.navy[900],
          secondary: colors.emerald[600],
          accent: colors.gold[400],
          dark: '#0b1120',
        },
        background: 'var(--background)',
        foreground: 'var(--foreground)',
        card: {
          DEFAULT: 'var(--card)',
          foreground: 'var(--card-foreground)',
        },
        popover: {
          DEFAULT: 'var(--popover)',
          foreground: 'var(--popover-foreground)',
        },
        primary: {
          DEFAULT: 'var(--primary)',
          foreground: 'var(--primary-foreground)',
        },
        secondary: {
          DEFAULT: 'var(--secondary)',
          foreground: 'var(--secondary-foreground)',
        },
        muted: {
          DEFAULT: 'var(--muted)',
          foreground: 'var(--muted-foreground)',
        },
        accent: {
          DEFAULT: 'var(--accent)',
          foreground: 'var(--accent-foreground)',
        },
        destructive: {
          DEFAULT: 'var(--destructive)',
          foreground: 'var(--destructive-foreground)',
        },
        border: 'var(--border)',
        input: 'var(--input)',
        ring: 'var(--ring)',
      },
      fontFamily: {
        sans: typography.fontFamilies.sans.split(', '),
        bengali: typography.fontFamilies.bengali.split(', '),
        mono: typography.fontFamilies.mono.split(', '),
        display: typography.fontFamilies.display.split(', '),
      },
      spacing,
      boxShadow: shadows,
      borderRadius: radii,
    },
  },
};

/**
 * CSS custom properties helper to inject into base CSS or HTML
 */
export const cssVariables = `
:root {
  --background: #ffffff;
  --foreground: #0f172a;
  --card: #ffffff;
  --card-foreground: #0f172a;
  --popover: #ffffff;
  --popover-foreground: #0f172a;
  --primary: #0f2b48;
  --primary-foreground: #ffffff;
  --secondary: #f1f5f9;
  --secondary-foreground: #0f172a;
  --muted: #f8fafc;
  --muted-foreground: #64748b;
  --accent: #e5a93c;
  --accent-foreground: #0f172a;
  --destructive: #ef4444;
  --destructive-foreground: #ffffff;
  --border: #e2e8f0;
  --input: #e2e8f0;
  --ring: #0f2b48;
  --radius: 0.5rem;
}

.dark, [data-theme="dark"] {
  --background: #0b1120;
  --foreground: #f8fafc;
  --card: #0f172a;
  --card-foreground: #f8fafc;
  --popover: #0f172a;
  --popover-foreground: #f8fafc;
  --primary: #38bdf8;
  --primary-foreground: #0f172a;
  --secondary: #1e293b;
  --secondary-foreground: #f8fafc;
  --muted: #1e293b;
  --muted-foreground: #94a3b8;
  --accent: #f59e0b;
  --accent-foreground: #0f172a;
  --destructive: #f87171;
  --destructive-foreground: #0f172a;
  --border: #334155;
  --input: #334155;
  --ring: #38bdf8;
}
`;

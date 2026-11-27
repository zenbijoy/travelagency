/**
 * ShopnoJatra Design Tokens - Typography
 */

export const typography = {
  fontFamilies: {
    sans: [
      'Inter',
      '-apple-system',
      'BlinkMacSystemFont',
      '"Segoe UI"',
      'Roboto',
      '"Noto Sans Bengali"',
      'sans-serif',
    ].join(', '),
    bengali: [
      '"Noto Sans Bengali"',
      '"Hind Siliguri"',
      'Inter',
      'sans-serif',
    ].join(', '),
    mono: [
      'ui-monospace',
      'SFMono-Regular',
      'Menlo',
      'Monaco',
      'Consolas',
      '"Liberation Mono"',
      'monospace',
    ].join(', '),
    display: [
      'Cabinet Grotesk',
      'Inter',
      'sans-serif',
    ].join(', '),
  },

  fontSizes: {
    '2xs': ['0.625rem', { lineHeight: '0.875rem' }],   // 10px / 14px
    xs: ['0.75rem', { lineHeight: '1rem' }],           // 12px / 16px
    sm: ['0.875rem', { lineHeight: '1.25rem' }],       // 14px / 20px
    base: ['1rem', { lineHeight: '1.5rem' }],          // 16px / 24px
    lg: ['1.125rem', { lineHeight: '1.75rem' }],       // 18px / 28px
    xl: ['1.25rem', { lineHeight: '1.75rem' }],        // 20px / 28px
    '2xl': ['1.5rem', { lineHeight: '2rem' }],         // 24px / 32px
    '3xl': ['1.875rem', { lineHeight: '2.25rem' }],    // 30px / 36px
    '4xl': ['2.25rem', { lineHeight: '2.5rem' }],      // 36px / 40px
    '5xl': ['3rem', { lineHeight: '1' }],              // 48px
    '6xl': ['3.75rem', { lineHeight: '1' }],           // 60px
  },

  fontWeights: {
    thin: '100',
    light: '300',
    normal: '400',
    medium: '500',
    semibold: '600',
    bold: '700',
    extrabold: '800',
    black: '900',
  },

  letterSpacing: {
    tighter: '-0.05em',
    tight: '-0.025em',
    normal: '0em',
    wide: '0.025em',
    wider: '0.05em',
    widest: '0.1em',
  },
} as const;

export type Typography = typeof typography;

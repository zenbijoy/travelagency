/**
 * Base Tailwind CSS Configuration for ShopnoJatra Web Applications
 */
const { shopnojatraTailwindPreset } = require('../design-tokens/src/preset');

module.exports = {
  darkMode: ['class', '[data-theme="dark"]'],
  presets: [shopnojatraTailwindPreset],
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
    '../../packages/design-system/src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};

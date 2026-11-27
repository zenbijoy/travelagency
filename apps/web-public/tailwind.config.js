/** @type {import('tailwindcss').Config} */
const { shopnojatraTailwindPreset } = require('../../packages/design-tokens/src/preset');

module.exports = {
  darkMode: ['class', '[data-theme="dark"]'],
  presets: [shopnojatraTailwindPreset],
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};

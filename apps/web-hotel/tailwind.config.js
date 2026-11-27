/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        navy: {
          950: '#070a13',
          900: '#0b0f19',
          850: '#111726',
          800: '#161f33',
          700: '#222f4c',
          600: '#334468',
        },
        brand: {
          emerald: '#10b981',
          teal: '#14b8a6',
          gold: '#f59e0b',
          indigo: '#6366f1',
          rose: '#f43f5e',
        }
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      }
    },
  },
  plugins: [],
}

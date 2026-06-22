/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      colors: {
        ink: {
          950: "#0a0b10",
          900: "#0e1018",
          850: "#13161f",
          800: "#181c28",
          700: "#222736",
          600: "#2e3447",
        },
        accent: {
          DEFAULT: "#7c5cff",
          soft: "#9d85ff",
        },
        gain: "#34d399",
        loss: "#f87171",
        warn: "#fbbf24",
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(124,92,255,0.25), 0 8px 30px -10px rgba(124,92,255,0.45)",
      },
    },
  },
  plugins: [],
};

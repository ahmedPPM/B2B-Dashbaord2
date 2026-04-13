import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: "#09090b",
          card: "#18181b",
          hover: "#27272a",
        },
        border: {
          subtle: "#27272a",
          strong: "#3f3f46",
        },
        accent: {
          positive: "#22c55e",
          negative: "#ef4444",
          warning: "#f59e0b",
          info: "#3b82f6",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;

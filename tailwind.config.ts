import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        washi: {
          50: "#FBF7F0",
          100: "#F5EFE6",
          200: "#EADFCB",
          300: "#D9C9A8",
          500: "#A3926F",
          900: "#2A2118",
        },
        sumi: "#1A1613",
        shu: "#C03D2B",
        ai: "#2B4A6F",
        kin: "#C9A227",
      },
      fontFamily: {
        serif: [
          "Cormorant Garamond",
          "Garamond",
          "EB Garamond",
          "Georgia",
          "Times New Roman",
          "serif",
        ],
        jp: [
          "Shippori Mincho",
          "Hiragino Mincho ProN",
          "Yu Mincho",
          "YuMincho",
          "MS Mincho",
          "serif",
        ],
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(24px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "ink-bloom": {
          "0%": { opacity: "0", transform: "scale(0.6)" },
          "60%": { opacity: "0.8" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        ripple: {
          "0%": { transform: "scale(1)", opacity: "0.6" },
          "100%": { transform: "scale(2.4)", opacity: "0" },
        },
        float: {
          "0%,100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-8px)" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.8s ease-out forwards",
        "ink-bloom": "ink-bloom 1.4s ease-out forwards",
        ripple: "ripple 1.6s ease-out infinite",
        float: "float 4s ease-in-out infinite",
      },
    },
  },
  plugins: [],
} satisfies Config;

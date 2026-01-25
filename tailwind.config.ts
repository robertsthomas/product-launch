import type { Config } from "tailwindcss"

export default {
  content: [
    "./app/**/*.{js,jsx,ts,tsx}",
    "./app/**/*.css",
    "./extensions/**/*.{js,jsx,ts,tsx}",
    "./app/styles/theme.css",
  ],
  theme: {
    extend: {
      colors: {
        // Primary brand colors
        primary: {
          DEFAULT: "#1F4FD8",
          strong: "#1a43b8",
          light: "#4169e1",
          soft: "rgba(31, 79, 216, 0.08)",
          glow: "rgba(31, 79, 216, 0.25)",
        },
        // Highlight/Secondary - Cyan Teal
        highlight: {
          DEFAULT: "#3BC9DB",
          soft: "rgba(59, 201, 219, 0.12)",
        },
        // Accent - Status Attention (Amber)
        accent: {
          DEFAULT: "#FBBF24",
          strong: "#f59e0b",
          soft: "rgba(251, 191, 36, 0.12)",
          glow: "rgba(251, 191, 36, 0.3)",
        },
        // Backgrounds
        surface: {
          DEFAULT: "#FFFFFF",
          strong: "#f1f5f9",
          elevated: "#ffffff",
        },
        bg: {
          DEFAULT: "#f8fafc",
          warm: "#f1f5f9",
        },
        // Text colors
        text: {
          DEFAULT: "#111827",
          secondary: "#374151",
          muted: "#6b7280",
          subtle: "#9ca3af",
        },
        // Borders
        border: {
          DEFAULT: "#E5E7EB",
          strong: "#d1d5db",
          subtle: "#f3f4f6",
        },
        // Status colors
        success: {
          DEFAULT: "#22C55E",
          strong: "#16a34a",
          soft: "#f0fdf4",
          glow: "rgba(34, 197, 94, 0.2)",
        },
        warning: {
          DEFAULT: "#FBBF24",
          strong: "#f59e0b",
          soft: "#fffbeb",
        },
        error: {
          DEFAULT: "#F87171",
          strong: "#ef4444",
          soft: "#fef2f2",
        },
        // AI Feature Color
        ai: {
          DEFAULT: "#5EEAD4",
          soft: "rgba(94, 234, 212, 0.12)",
        },
      },
      fontFamily: {
        heading: ['"Inter"', '"Plus Jakarta Sans"', "system-ui", "-apple-system", "sans-serif"],
        body: ['"Inter"', '"Plus Jakarta Sans"', "system-ui", "-apple-system", "sans-serif"],
        mono: ['"JetBrains Mono"', '"SF Mono"', "Monaco", "monospace"],
      },
      fontSize: {
        xs: ["0.75rem", { lineHeight: "1rem" }],
        sm: ["0.875rem", { lineHeight: "1.25rem" }],
        base: ["1rem", { lineHeight: "1.5rem" }],
        lg: ["1.125rem", { lineHeight: "1.75rem" }],
        xl: ["1.5rem", { lineHeight: "2rem" }],
        "2xl": ["1.875rem", { lineHeight: "2.25rem" }],
        "3xl": ["2.25rem", { lineHeight: "2.5rem" }],
        "4xl": ["2.8rem", { lineHeight: "3.5rem" }],
      },
      lineHeight: {
        tight: "1.25",
        normal: "1.5",
        relaxed: "1.75",
      },
      spacing: {
        1: "4px",
        2: "8px",
        3: "12px",
        4: "16px",
        5: "20px",
        6: "24px",
        8: "32px",
        10: "40px",
        12: "48px",
      },
      borderRadius: {
        sm: "6px",
        md: "8px",
        lg: "12px",
        xl: "16px",
        full: "999px",
      },
      boxShadow: {
        sm: "0 2px 8px -2px rgba(17, 24, 39, 0.06)",
        soft: "0 8px 30px -12px rgba(17, 24, 39, 0.12)",
        card: "0 12px 40px -15px rgba(17, 24, 39, 0.15)",
        elevated: "0 20px 50px -20px rgba(17, 24, 39, 0.2)",
        "primary-glow": "0 4px 20px -4px rgba(31, 79, 216, 0.25)",
        "accent-glow": "0 4px 20px -4px rgba(251, 191, 36, 0.3)",
        "success-glow": "0 4px 20px -4px rgba(34, 197, 94, 0.2)",
      },
      transitionDuration: {
        fast: "150ms",
        base: "250ms",
        slow: "400ms",
      },
      transitionTimingFunction: {
        "ease-smooth": "cubic-bezier(0.4, 0, 0.2, 1)",
        "ease-bounce": "cubic-bezier(0.34, 1.56, 0.64, 1)",
      },
      duration: {
        fast: "150ms",
        base: "250ms",
        slow: "400ms",
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "fade-in-up": {
          from: { opacity: "0", transform: "translateY(12px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "slide-in-up": {
          from: { opacity: "0", transform: "translateY(20px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "scale-in": {
          from: { opacity: "0", transform: "scale(0.95)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
        "slide-down": {
          from: {
            opacity: "0",
            transform: "translateY(-8px)",
            "max-height": "0",
          },
          to: {
            opacity: "1",
            transform: "translateY(0)",
            "max-height": "500px",
          },
        },
        "slide-up": {
          from: {
            opacity: "1",
            transform: "translateY(0)",
            "max-height": "500px",
          },
          to: {
            opacity: "0",
            transform: "translateY(-8px)",
            "max-height": "0",
          },
        },
      },
      animation: {
        "fade-in": "fade-in 250ms ease-smooth",
        "fade-in-up": "fade-in-up 250ms ease-smooth",
        "slide-in-up": "slide-in-up 400ms ease-smooth",
        "scale-in": "scale-in 250ms ease-smooth",
        "slide-down": "slide-down 300ms ease-smooth forwards",
        "slide-up": "slide-up 300ms ease-smooth forwards",
      },
    },
  },
  plugins: [],
} satisfies Config

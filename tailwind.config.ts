import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        surface: "var(--surface)",
        "surface-raised": "var(--surface-raised)",
        ink: "var(--ink)",
        "ink-soft": "var(--ink-soft)",
        accent: "var(--color-accent)",
        "accent-ink": "var(--color-accent-ink)",
        "border-themed": "var(--border-color)",
      },
      borderRadius: {
        themed: "var(--radius)",
        "themed-sm": "var(--radius-sm)",
      },
      boxShadow: {
        themed: "var(--shadow)",
        "themed-sm": "var(--shadow-sm)",
      },
      fontFamily: {
        heading: "var(--font-heading)",
        body: "var(--font-body)",
      },
    },
  },
  plugins: [],
} satisfies Config;

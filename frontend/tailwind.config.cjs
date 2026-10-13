/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        // Runnel Canonical Palette
        // 1. Warm ivory canvas & substrate
        canvas: {
          DEFAULT: "#FBF9F3",
          subtle: "#F7F7F4",
          well: "#F0EEE7",
          high: "#EAE8E2",
          highest: "#E4E2DC",
        },
        // 2. Structural crisp surfaces
        surface: {
          DEFAULT: "#FFFFFF",
          hover: "#FAFAF8",
          active: "#F5F4ED",
          dim: "#DCDAD4",
        },
        // 3. Borders & dividers
        stone: {
          border: "#DCDCD5",
          strong: "#C8C8C0",
        },
        // 4. Primary Forest Green
        forest: {
          DEFAULT: "#1B4332",
          hover: "#143527",
          light: "#2D6A4F",
          ghost: "rgba(27, 67, 50, 0.08)",
          border: "rgba(27, 67, 50, 0.25)",
        },
        // 5. Restrained Terracotta (Critical / Destructive)
        terracotta: {
          DEFAULT: "#B63B32",
          hover: "#963522",
          ghost: "rgba(182, 59, 50, 0.08)",
          border: "rgba(182, 59, 50, 0.25)",
        },
        // 6. Typography (Charcoal & Muted Stone)
        charcoal: {
          DEFAULT: "#171717",
          secondary: "#62625D",
          muted: "#85857E",
          dim: "#A8A8A0",
        },

        // Semantic mappings (backward compatible & primary design system tokens)
        void: "#FBF9F3",
        base: "#FBF9F3",
        panel: "#FFFFFF",
        raised: "#F7F7F4",
        overlay: "#FFFFFF",
        elevated: "#F5F4ED",

        // Borders
        edge: "#DCDCD5",
        "edge-mid": "#C8C8C0",
        "edge-bright": "#A8A8A0",
        border: "#DCDCD5",
        "border-default": "#DCDCD5",
        "border-bright": "#C8C8C0",

        // Text
        hi: "#171717",
        mid: "#62625D",
        lo: "#85857E",
        dim: "#A8A8A0",
        "text-primary": "#171717",
        "text-secondary": "#62625D",
        "text-muted": "#85857E",

        // Primary interactive accent: Forest Green
        accent: "#1B4332",
        "accent-dim": "#143527",
        "accent-muted": "rgba(27, 67, 50, 0.08)",
        cyan: "#1B4332",
        "cyan-soft": "#2D6A4F",
        "cyan-dim": "rgba(27, 67, 50, 0.08)",

        // Status tokens
        ok: "#2F7D5A",
        "ok-bg": "rgba(47, 125, 90, 0.08)",
        "ok-edge": "rgba(47, 125, 90, 0.25)",

        warn: "#B7791F",
        "warn-bg": "rgba(183, 121, 31, 0.08)",
        "warn-edge": "rgba(183, 121, 31, 0.25)",

        danger: "#B63B32",
        "danger-bg": "rgba(182, 59, 50, 0.08)",
        "danger-edge": "rgba(182, 59, 50, 0.25)",

        info: "#3B5D80",
        "info-bg": "rgba(59, 93, 128, 0.08)",
        "info-edge": "rgba(59, 93, 128, 0.25)",

        // Layout aliases
        "ink-primary": "#171717",
        "ink-secondary": "#62625D",
        "ink-muted": "#85857E",
        "bg-void": "#FBF9F3",
        "bg-base": "#F7F7F4",
        "bg-panel": "#FFFFFF",
        "bg-raised": "#F5F4ED",
        "bg-overlay": "#FFFFFF",
        "line-subtle": "#DCDCD5",
        "line-bright": "#C8C8C0",
        "status-danger": "#B63B32",
        "status-warning": "#B7791F",
        "status-info": "#3B5D80",
        "status-success": "#2F7D5A",
        "green-vivid": "#1B4332",
        "green-ghost": "rgba(27, 67, 50, 0.08)",

        // Legacy simulator simulation tags (kept safe for non-destructive backwards compatibility)
        plant: "#2F7D5A",
        herb: "#3B5D80",
        carn: "#B63B32",
      },
      fontFamily: {
        sans: ["Inter", "-apple-system", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "Fira Code", "monospace"],
      },
      boxShadow: {
        card: "0 1px 3px rgba(23, 23, 23, 0.04), 0 0 0 1px #DCDCD5",
        elevated: "0 4px 12px rgba(23, 23, 23, 0.06), 0 0 0 1px #DCDCD5",
        modal: "0 8px 30px rgba(23, 23, 23, 0.12), 0 0 0 1px #C8C8C0",
      },
      fontSize: {
        "2xs": ["10px", { lineHeight: "14px", letterSpacing: "0.06em" }],
        xs:   ["11px", { lineHeight: "16px" }],
        sm:   ["13px", { lineHeight: "20px" }],
        base: ["14px", { lineHeight: "22px" }],
        lg:   ["16px", { lineHeight: "24px" }],
        xl:   ["18px", { lineHeight: "28px" }],
        "2xl":["22px", { lineHeight: "32px" }],
        "3xl":["28px", { lineHeight: "36px" }],
      },
    },
  },
  plugins: [],
};

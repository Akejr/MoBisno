/** Tailwind (build de produção) — substitui o CDN runtime. Mesmo tema do antigo
 *  `tailwind.config` inline do index.html. */
import forms from "@tailwindcss/forms";
import containerQueries from "@tailwindcss/container-queries";

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./web/**/*.{html,ts}"],
  // Classes construídas dinamicamente (template literals) — protegidas do purge.
  safelist: [
    "grid-cols-1", "grid-cols-2", "grid-cols-3", "grid-cols-4", "grid-cols-5", "grid-cols-6",
  ],
  theme: {
    extend: {
      colors: {
        "surface-tint": "#a73a00", "surface": "#fff8f6", "on-surface": "#271812",
        "surface-container-low": "#fff1ec", "surface-container": "#ffe9e2",
        "surface-container-high": "#ffe2d8", "surface-container-highest": "#fadcd2",
        "surface-container-lowest": "#ffffff", "surface-bright": "#fff8f6",
        "surface-dim": "#f1d4ca", "surface-variant": "#fadcd2",
        "on-surface-variant": "#5b4137", "background": "#fff8f6", "on-background": "#271812",
        "primary": "#a73a00", "on-primary": "#ffffff", "primary-container": "#ff5c00",
        "on-primary-container": "#521800", "primary-fixed": "#ffdbce",
        "secondary": "#5c5f60", "on-secondary": "#ffffff", "secondary-container": "#e1e3e4",
        "on-secondary-container": "#626566", "secondary-fixed-dim": "#c5c7c8",
        "tertiary": "#575e70", "tertiary-container": "#8b92a6", "tertiary-fixed": "#dce2f7",
        "on-tertiary-fixed": "#141b2b", "error": "#ba1a1a", "on-error": "#ffffff",
        "error-container": "#ffdad6", "on-error-container": "#93000a",
        "outline": "#8f7065", "outline-variant": "#e4beb1",
      },
      borderRadius: { DEFAULT: "0.25rem", lg: "0.5rem", xl: "0.75rem", "2xl": "1rem", full: "9999px" },
      spacing: {
        "stack-sm": "8px", "stack-md": "16px", "stack-lg": "32px",
        "container-max": "1280px", base: "8px", gutter: "24px",
        "margin-mobile": "16px", "margin-desktop": "32px",
      },
      maxWidth: { "container-max": "1280px" },
      fontFamily: { sans: ["Inter", "sans-serif"] },
      fontSize: {
        "display-lg": ["48px", { lineHeight: "1.2", letterSpacing: "-0.02em", fontWeight: "700" }],
        "headline-lg": ["32px", { lineHeight: "1.3", fontWeight: "600" }],
        "headline-md": ["24px", { lineHeight: "1.4", fontWeight: "600" }],
        "body-lg": ["18px", { lineHeight: "1.6", fontWeight: "400" }],
        "body-md": ["16px", { lineHeight: "1.6", fontWeight: "400" }],
        "label-md": ["14px", { lineHeight: "1.4", letterSpacing: "0.01em", fontWeight: "500" }],
        "label-sm": ["12px", { lineHeight: "1.2", fontWeight: "600" }],
      },
    },
  },
  plugins: [
    require("@tailwindcss/forms"),
    require("@tailwindcss/container-queries"),
  ],
};

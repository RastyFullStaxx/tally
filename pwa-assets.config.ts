import { defineConfig, minimal2023Preset } from "@vite-pwa/assets-generator/config"

// The logo is a full-bleed navy tile, so the iOS and maskable icons need no padding and a navy (not white) fill.
const navy = { background: "#0B1426", fit: "contain" } as const

export default defineConfig({
  headLinkOptions: { preset: "2023" },
  preset: {
    ...minimal2023Preset,
    transparent: { ...minimal2023Preset.transparent, padding: 0 },
    maskable: { sizes: [512], padding: 0, resizeOptions: navy },
    apple: { sizes: [180], padding: 0, resizeOptions: navy },
  },
  images: ["public/logo.svg"],
})

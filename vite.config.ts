import { resolve } from "node:path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { VitePWA } from "vite-plugin-pwa"

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // A new deploy downloads in the background and waits until Update is tapped (UpdateButton),
      // so nothing reloads mid-entry.
      registerType: "prompt",
      pwaAssets: { config: true, overrideManifestIcons: true },
      manifest: {
        name: "Tally",
        short_name: "Tally",
        description: "An offline budget notebook.",
        theme_color: "#0B1426",
        background_color: "#0B1426",
        display: "standalone",
        orientation: "portrait",
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,webp,ico,woff2}"],
        // Inter only stands in for SF Pro off Apple devices: keep the subsets holding Latin text and the ₱ sign.
        globIgnores: ["**/inter-{cyrillic,cyrillic-ext,greek,greek-ext,vietnamese}-*", "**/mascot/tally-cat/*.png"],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": resolve(import.meta.dirname, "./src"),
    },
  },
})

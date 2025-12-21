import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

const DEV_CSP =
  "default-src 'self'; " +
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval'; " +
   "connect-src 'self' http://localhost:* ws://localhost:* https://vmtcofezozrblfxudauk.supabase.co https://vmtcofezozrblfxudauk.functions.supabase.co wss://vmtcofezozrblfxudauk.supabase.co; " +
  "img-src 'self' data: blob: https:; " +
  "style-src 'self' 'unsafe-inline'; " +
  "font-src 'self' data:; " +
  "worker-src 'self' blob:; " +
  "frame-src https://vmtcofezozrblfxudauk.supabase.co;";

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: [
        "essateric_white.png",
        "android-chrome-192x192.png",
        "android-chrome-512x512.png",
        "screenshots/pwa-desktop.png",
        "screenshots/pwa-mobile.png",
      ],
      manifest: {
        name: "The Edge HD Salon",
        short_name: "EdgeHD",
        start_url: "/",
        scope: "/",
        display: "standalone",
        background_color: "#000000",
        theme_color: "#cd7f32",
        orientation: "portrait",
        icons: [
          { src: "/android-chrome-192x192.png", sizes: "192x192", type: "image/png" },
          { src: "/android-chrome-512x512.png", sizes: "512x512", type: "image/png" },
        ],
      },
      workbox: {
        runtimeCaching: [
          {
            urlPattern: ({ request }) =>
              ["document", "script", "style", "image", "font"].includes(request.destination),
            handler: "CacheFirst",
            options: {
              cacheName: "asset-cache",
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
        ],
      },
    }),
  ],

  // --- DEV-ONLY server settings ---
  server: {
    // These headers fix your CSP during development
    headers: mode === "development" ? { "Content-Security-Policy": DEV_CSP } : {},
    // When running `netlify dev`, the page is on 8888 but HMR still runs on 5173.
    // Telling the client to connect back through 8888 avoids blocked WS in some setups.
    hmr: { clientPort: 8888 },
  },
}));

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: [
        "essateric_white.png",
        "essateric_white_192.png",
        "essateric_white_512.png",
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
          {
            src: "/essateric_white_192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "/essateric_white_512.png",
            sizes: "512x512",
            type: "image/png",
          },
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
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 Days
              },
            },
          },
        ],
      },
    }),
  ],
});

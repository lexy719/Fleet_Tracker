import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (id.includes("react-dom") || id.includes("/react/")) return "react-vendor";
            if (id.includes("leaflet") || id.includes("react-leaflet") || id.includes("maplibre"))
              return "map-vendor";
            if (id.includes("recharts")) return "charts-vendor";
            if (id.includes("lucide-react")) return "icons-vendor";
          }
        },
      },
    },
    chunkSizeWarningLimit: 700,
  },
  server: {
    proxy: {
      // Same-origin proxy so browser fetch() avoids CORS to api.tomtom.com (common on localhost).
      "/api/tomtom": {
        target: "https://api.tomtom.com",
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/api\/tomtom/, ""),
      },
    },
  },
  preview: {
    proxy: {
      "/api/tomtom": {
        target: "https://api.tomtom.com",
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/api\/tomtom/, ""),
      },
    },
  },
});

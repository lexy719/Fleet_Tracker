import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { defineConfig, loadEnv, type Plugin } from "vite";
import { researchMiddleware } from "./server/researchProxy";
import { registryDomains } from "./src/discovery/authorities";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

/**
 * DEVELOPMENT ONLY: serves synthetic ingestion fixtures from dev-fixtures/ingestion at
 * /__dev/ingestion/<file>. `configureServer` runs only for `vite dev` — never in
 * `vite build` / `vite preview`, so these files can never reach production.
 */
function devIngestionFixtures(): Plugin {
  return {
    name: "fleetos-dev-ingestion-fixtures",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/__dev/ingestion/", async (req, res) => {
        const name = (req.url ?? "").replace(/^\//, "").split("?")[0] ?? "";
        if (!/^[a-z0-9-]+\.(xml|json)$/.test(name)) {
          res.statusCode = 400;
          res.end("bad fixture name");
          return;
        }
        try {
          const body = await readFile(resolve(__dirname, "dev-fixtures/ingestion", name), "utf8");
          res.setHeader("Content-Type", name.endsWith(".xml") ? "application/xml" : "application/json");
          res.setHeader("Cache-Control", "no-store");
          res.setHeader("X-FleetOS-Synthetic", "true");
          res.end(body);
        } catch {
          res.statusCode = 404;
          res.end("fixture not found");
        }
      });
    },
  };
}

/**
 * Phase 4 research boundary (dev + preview only): allow-listed retrieval of official
 * documents, and — only when server-side FLEETOS_* keys exist — LLM extraction / web search.
 * Only FLEETOS_-prefixed variables are read here; Vite exposes only VITE_* to the client,
 * so these secrets never reach the bundle.
 */
function researchBoundary(mode: string): Plugin {
  const env = loadEnv(mode, process.cwd(), "FLEETOS_");
  const deps = {
    fetch: globalThis.fetch,
    allowDomains: () => registryDomains().map((d) => d.domain),
    env: {
      FLEETOS_EXTRACTION_API_KEY: env.FLEETOS_EXTRACTION_API_KEY || process.env.FLEETOS_EXTRACTION_API_KEY,
      FLEETOS_EXTRACTION_MODEL: env.FLEETOS_EXTRACTION_MODEL || process.env.FLEETOS_EXTRACTION_MODEL,
      FLEETOS_SEARCH_API_KEY: env.FLEETOS_SEARCH_API_KEY || process.env.FLEETOS_SEARCH_API_KEY,
    },
  };
  return {
    name: "fleetos-research-boundary",
    configureServer(server) {
      server.middlewares.use(researchMiddleware(deps));
    },
    configurePreviewServer(server) {
      server.middlewares.use(researchMiddleware(deps));
    },
  };
}

/**
 * Same-origin relays for official sources that send no CORS headers. Fixed upstreams only
 * (see src/ingestion/sources.ts) — never an open proxy. Mirrored in vercel.json rewrites.
 */
const sourceRelays = {
  "/api/src/porto-dados": {
    target: "https://dadosabertos.cm-porto.pt",
    changeOrigin: true,
    secure: true,
    rewrite: (path: string) => path.replace(/^\/api\/src\/porto-dados/, ""),
  },
  "/api/src/ip-alertas": {
    target: "https://servicos.infraestruturasdeportugal.pt",
    changeOrigin: true,
    secure: true,
    rewrite: (path: string) => path.replace(/^\/api\/src\/ip-alertas/, "/pt-pt/alertas/rodovia"),
  },
};

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss(), devIngestionFixtures(), researchBoundary(mode)],
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
      ...sourceRelays,
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
      ...sourceRelays,
      "/api/tomtom": {
        target: "https://api.tomtom.com",
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/api\/tomtom/, ""),
      },
    },
  },
}));

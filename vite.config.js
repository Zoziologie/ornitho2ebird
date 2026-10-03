import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import packageJson from "./package.json" with { type: "json" };
import bootstrapIconsSubset from "./build/bootstrapIconsSubset.js";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [vue(), bootstrapIconsSubset()],
  build: {
    // Two chunks are large and loaded only when needed: MapLibre (~1 MB, ~280 KB compressed) with
    // the Customized-mode panel, and data/ebird_scientific_names.json (~660 KB, ~180 KB
    // compressed) when an import has sightings without an eBird code.
    chunkSizeWarningLimit: 1100,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) {
            return;
          }

          if (id.includes("maplibre-gl")) {
            return "map-vendor";
          }

          if (id.includes("papaparse")) {
            return "import-vendor";
          }

          if (id.includes("bootstrap")) {
            return "ui-vendor";
          }

          if (id.includes("vue")) {
            return "vue-vendor";
          }
        },
      },
    },
  },
  test: {
    include: ["test/**/*.test.js"],
    environment: "node",
  },
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version),
    __APP_LICENSE__: JSON.stringify(packageJson.license),
  },
});

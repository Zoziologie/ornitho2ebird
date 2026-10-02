import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import packageJson from "./package.json" with { type: "json" };
import bootstrapIconsSubset from "./build/bootstrapIconsSubset.js";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [vue(), bootstrapIconsSubset()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          // The global-L shim must run before the Leaflet plugins, so it goes in their chunk.
          if (id.endsWith("/src/lib/leaflet.js")) {
            return "map-vendor";
          }

          if (!id.includes("node_modules")) {
            return;
          }

          if (id.includes("leaflet")) {
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

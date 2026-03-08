import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import packageJson from "./package.json";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [vue()],
  base: "/ornitho2ebird/",
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) {
            return;
          }

          if (id.includes("leaflet")) {
            return "map-vendor";
          }

          if (id.includes("papaparse") || id.includes("wicket")) {
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
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version),
    __APP_LICENSE__: JSON.stringify(packageJson.license),
  },
});

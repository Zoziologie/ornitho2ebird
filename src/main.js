import { createApp } from "vue";
import Tooltip from "bootstrap/js/dist/tooltip";
import "bootstrap/dist/css/bootstrap.min.css";
import "bootstrap-icons/font/bootstrap-icons.css";
import App from "./App.vue";
import { i18n, resolveUiLanguage, setI18nLanguage } from "./i18n";
import { APP_STORAGE_PREFIX } from "./lib/constants";
import { alertDialog } from "./lib/dialog";
import { SETTINGS_STORAGE_KEY } from "./lib/settings";
import { readStorage } from "./lib/storage";

const app = createApp(App);

app.directive("tooltip", {
  mounted(element, binding) {
    const title = typeof binding.value === "string" ? binding.value : "";
    element.setAttribute("data-bs-toggle", "tooltip");
    element.setAttribute("data-bs-placement", binding.arg || "top");
    element.setAttribute("data-bs-title", title);
    element._tooltip = new Tooltip(element);
  },
  updated(element, binding) {
    // Runs on every parent re-render: only touch the tooltip when its text changed.
    if (binding.value === binding.oldValue) {
      return;
    }
    const title = typeof binding.value === "string" ? binding.value : "";
    element.setAttribute("data-bs-title", title);
    element._tooltip?.setContent({ ".tooltip-inner": title });
  },
  unmounted(element) {
    element._tooltip?.dispose();
  },
});

// After a deploy, a tab opened earlier asks for JS chunks that no longer exist. Reload once to
// get the new version; the timestamp prevents a reload loop if a chunk is really missing.
const RELOAD_STORAGE_KEY = `${APP_STORAGE_PREFIX}:chunk-reload`;

function reloadForNewVersion() {
  try {
    const lastReload = Number(window.sessionStorage.getItem(RELOAD_STORAGE_KEY)) || 0;
    if (Date.now() - lastReload < 10000) {
      return false;
    }
    window.sessionStorage.setItem(RELOAD_STORAGE_KEY, String(Date.now()));
  } catch {
    return false;
  }
  window.location.reload();
  return true;
}

function isChunkLoadError(error) {
  return /dynamically imported module|Importing a module script failed|Unable to preload CSS/i.test(
    String(error?.message || error),
  );
}

// Vite also fires this when a lazy chunk loads but throws while running: only a missing file
// is fixed by reloading, a real bug should reach the error dialog.
window.addEventListener("vite:preloadError", (event) => {
  if (isChunkLoadError(event.payload) && reloadForNewVersion()) {
    event.preventDefault();
  }
});

let errorDialogOpen = false;
app.config.errorHandler = (error, _instance, info) => {
  console.error(error, info);
  if (isChunkLoadError(error) && reloadForNewVersion()) {
    return;
  }
  if (errorDialogOpen) {
    return;
  }
  errorDialogOpen = true;
  alertDialog(
    i18n.global.t("unexpectedError", {
      detail: error instanceof Error ? error.message : String(error),
    }),
  ).finally(() => {
    errorDialogOpen = false;
  });
};

// Load the user's language before the first render to avoid a flash of English.
setI18nLanguage(resolveUiLanguage(readStorage(SETTINGS_STORAGE_KEY, {}))).finally(() => {
  app.use(i18n).mount("#app");
});

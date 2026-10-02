import { createApp } from "vue";
import Tooltip from "bootstrap/js/dist/tooltip";
import "bootstrap/dist/css/bootstrap.min.css";
import "bootstrap-icons/font/bootstrap-icons.css";
import App from "./App.vue";
import { i18n, resolveUiLanguage, setI18nLanguage } from "./i18n";
import { APP_STORAGE_PREFIX } from "./lib/constants";
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

// Load the user's language before the first render to avoid a flash of English.
setI18nLanguage(resolveUiLanguage(readStorage(`${APP_STORAGE_PREFIX}:settings`, {}))).finally(() => {
  app.use(i18n).mount("#app");
});

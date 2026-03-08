import { createApp } from "vue";
import { Tooltip } from "bootstrap";
import "bootstrap/dist/css/bootstrap.min.css";
import "bootstrap-icons/font/bootstrap-icons.css";
import "leaflet/dist/leaflet.css";
import "leaflet-draw/dist/leaflet.draw.css";
import App from "./App.vue";
import { i18n } from "./i18n";

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
    const title = typeof binding.value === "string" ? binding.value : "";
    element.setAttribute("data-bs-title", title);
    if (element._tooltip) {
      element._tooltip.dispose();
    }
    element._tooltip = new Tooltip(element);
  },
  unmounted(element) {
    element._tooltip?.dispose();
  },
});

app.use(i18n).mount("#app");

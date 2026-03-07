import { createApp } from "vue";
import "bootstrap/dist/css/bootstrap.min.css";
import "leaflet/dist/leaflet.css";
import "leaflet-draw/dist/leaflet.draw.css";
import App from "./App.vue";
import { i18n } from "./i18n";

window.type = true;

createApp(App).use(i18n).mount("#app");

import { createI18n } from "vue-i18n";
import en from "./locales/en.json";
import fr from "./locales/fr.json";
import ca from "./locales/ca.json";
import de from "./locales/de.json";
import it from "./locales/it.json";

const messages = {
  en,
  fr,
  ca,
  de,
  it,
};

export const i18n = createI18n({
  legacy: false,
  globalInjection: true,
  locale: "en",
  fallbackLocale: "en",
  messages,
});

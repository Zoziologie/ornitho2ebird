import { createI18n } from "vue-i18n";
import en from "./locales/en.json";
import { LANGUAGE_COOKIE_NAME, UI_LANGUAGES } from "./lib/constants";
import { readCookie } from "./lib/storage";

// English is bundled as the fallback; other locales are fetched on demand.
const localeLoaders = import.meta.glob(["./locales/*.json", "!./locales/en.json"], {
  import: "default",
});

const supportedLanguages = new Set(UI_LANGUAGES.map((language) => language.value));

export function normalizeLanguage(value) {
  if (typeof value !== "string" || value.length === 0) {
    return null;
  }

  const normalized = value.trim().toLowerCase().replaceAll("_", "-");
  const exactMatch = normalized.split("-")[0];
  return supportedLanguages.has(exactMatch) ? exactMatch : null;
}

export function resolveUiLanguage(savedSettings = {}) {
  const queryLanguage = normalizeLanguage(
    typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("lang") : "",
  );
  const cookieLanguage = normalizeLanguage(readCookie(LANGUAGE_COOKIE_NAME));
  const savedUiLanguage = normalizeLanguage(savedSettings.uiLanguage || savedSettings.language);
  const browserLanguage = normalizeLanguage(
    typeof navigator !== "undefined" ? navigator.language || navigator.languages?.[0] : "",
  );
  return queryLanguage || cookieLanguage || savedUiLanguage || browserLanguage || "en";
}

export const i18n = createI18n({
  legacy: false,
  globalInjection: true,
  locale: "en",
  fallbackLocale: "en",
  messages: { en },
  pluralRules: {
    // French uses the singular for 0 and 1 ("0 liste", "1 liste").
    fr: (choice, choicesLength) =>
      choicesLength === 2 && choice <= 1 ? 0 : Math.min(choice, choicesLength - 1),
  },
});

const loadingLocales = new Map();
let requestedLanguage = "en";

function loadLocaleMessages(language) {
  const loader = localeLoaders[`./locales/${language}.json`];
  if (!loader || i18n.global.availableLocales.includes(language)) {
    return Promise.resolve();
  }

  if (!loadingLocales.has(language)) {
    loadingLocales.set(
      language,
      loader()
        .then((messages) => i18n.global.setLocaleMessage(language, messages))
        .catch((error) => {
          loadingLocales.delete(language);
          throw error;
        }),
    );
  }
  return loadingLocales.get(language);
}

export async function setI18nLanguage(language) {
  requestedLanguage = language;
  try {
    await loadLocaleMessages(language);
  } catch (error) {
    console.error(`Could not load the "${language}" translations`, error);
    return;
  }
  // Ignore a slower load if the user has switched language again meanwhile.
  if (requestedLanguage === language) {
    i18n.global.locale.value = language;
  }
}

<script setup>
import { computed, defineAsyncComponent, reactive, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import "./app.css";
import AppHeader from "./components/AppHeader.vue";
import AppFooter from "./components/AppFooter.vue";
import ImportPanel from "./components/ImportPanel.vue";
import {
  APP_STORAGE_PREFIX,
  DEFAULT_SETTINGS,
  DEFAULT_SPECIES_COMMENT_TEMPLATE,
  DEFAULT_WEBSITE_BY_LANGUAGE,
  LANGUAGE_COOKIE_NAME,
  EBIRD_LANGUAGES,
  UI_LANGUAGES,
} from "./lib/constants";
import { readCookie, readStorage, writeCookie, writeStorage } from "./lib/storage";
import { applyDefaultAutomaticAssignment, buildForm } from "./lib/utils";

const SettingsPanel = defineAsyncComponent(() => import("./components/SettingsPanel.vue"));
const InfoPanel = defineAsyncComponent(() => import("./components/InfoPanel.vue"));
const AdvancedPanel = defineAsyncComponent(() => import("./components/AdvancedPanel.vue"));
const ExportPanel = defineAsyncComponent(() => import("./components/ExportPanel.vue"));

function normalizeSpeciesCommentTemplate(template) {
  return {
    short: template?.short || DEFAULT_SPECIES_COMMENT_TEMPLATE.short,
    long: template?.long || DEFAULT_SPECIES_COMMENT_TEMPLATE.long,
    limit: Number(template?.limit) || 5,
  };
}

function speciesCommentTemplateHasContent(template) {
  return Boolean(template?.short || template?.long);
}

function sameSpeciesCommentTemplate(left, right) {
  const normalizedLeft = normalizeSpeciesCommentTemplate(left);
  const normalizedRight = normalizeSpeciesCommentTemplate(right);

  return (
    normalizedLeft.short === normalizedRight.short &&
    normalizedLeft.long === normalizedRight.long &&
    normalizedLeft.limit === normalizedRight.limit
  );
}

function normalizeGlobalStaticMap(settings) {
  const defaults = DEFAULT_SETTINGS.globalStaticMap;
  const normalized = settings && typeof settings === "object" ? settings : {};

  return {
    show: Boolean(normalized.show),
    interactive: Boolean(normalized.interactive),
    style: typeof normalized.style === "string" && normalized.style ? normalized.style : defaults.style,
    pathStyle: {
      ...defaults.pathStyle,
      ...(normalized.pathStyle || {}),
    },
    markerStyle: {
      ...defaults.markerStyle,
      ...(normalized.markerStyle || {}),
    },
  };
}

const supportedLanguages = new Set(UI_LANGUAGES.map((language) => language.value));
const LEGACY_EBIRD_LANGUAGE_CODES = {
  id: "in",
  pa: "pa_IN",
  en_HAW: "haw",
};

function normalizeLanguage(value) {
  if (typeof value !== "string" || value.length === 0) {
    return null;
  }

  const normalized = value.trim().toLowerCase().replaceAll("_", "-");
  const exactMatch = normalized.split("-")[0];
  return supportedLanguages.has(exactMatch) ? exactMatch : null;
}

function defaultWebsiteForLanguage(language) {
  return DEFAULT_WEBSITE_BY_LANGUAGE[language] || DEFAULT_WEBSITE_BY_LANGUAGE.en;
}

function normalizeEbirdLanguage(value) {
  if (typeof value !== "string" || value.length === 0) {
    return null;
  }

  return LEGACY_EBIRD_LANGUAGE_CODES[value] || value;
}

const savedSettings = readStorage(`${APP_STORAGE_PREFIX}:settings`, DEFAULT_SETTINGS);
const queryLanguage = normalizeLanguage(
  typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("lang") : ""
);
const cookieLanguage = normalizeLanguage(readCookie(LANGUAGE_COOKIE_NAME));
const savedUiLanguage = normalizeLanguage(savedSettings.uiLanguage || savedSettings.language);
const browserLanguage = normalizeLanguage(
  typeof navigator !== "undefined" ? navigator.language || navigator.languages?.[0] : ""
);
const resolvedUiLanguage =
  queryLanguage || cookieLanguage || savedUiLanguage || browserLanguage || "en";
const supportedEbirdLanguages = new Set(EBIRD_LANGUAGES.map((language) => language.value));
const savedEbirdLanguage = normalizeEbirdLanguage(savedSettings.ebirdLanguage);
const legacySavedLanguage = normalizeEbirdLanguage(savedSettings.language);
const resolvedEbirdLanguage = supportedEbirdLanguages.has(savedEbirdLanguage)
  ? savedEbirdLanguage
  : supportedEbirdLanguages.has(legacySavedLanguage)
    ? legacySavedLanguage
    : "en";
const initialWebsiteName =
  queryLanguage || !savedSettings.websiteName
    ? defaultWebsiteForLanguage(resolvedUiLanguage)
    : savedSettings.websiteName;

const settings = reactive({
  ...DEFAULT_SETTINGS,
  ...savedSettings,
  uiLanguage: resolvedUiLanguage,
  ebirdLanguage: resolvedEbirdLanguage,
  websiteName: initialWebsiteName,
  speciesCommentTemplate: normalizeSpeciesCommentTemplate(savedSettings.speciesCommentTemplate),
  globalStaticMap: normalizeGlobalStaticMap(savedSettings.globalStaticMap),
});

const website = ref(null);
const sightings = ref([]);
const forms = ref([]);
const formsSightings = ref([]);
const selectedFormId = ref(null);
const infoOpen = ref(false);
const infoSection = ref("");
const settingsOpen = ref(false);
const settingsFocusSection = ref("");
const version = __APP_VERSION__;
const { locale, t } = useI18n({ useScope: "global" });
locale.value = settings.uiLanguage;

function updateDocumentMetadata(language) {
  if (typeof document === "undefined") {
    return;
  }

  const title = `${t("appTitle")} | ${t("appSubtitle")}`;
  const description = t("infoDescription");

  document.documentElement.lang = language || "en";
  document.title = title;

  const updateMeta = (selector, attribute, content) => {
    const element = document.head.querySelector(selector);
    if (element) {
      element.setAttribute(attribute, content);
    }
  };

  updateMeta('meta[name="description"]', "content", description);
  updateMeta('meta[property="og:title"]', "content", title);
  updateMeta('meta[property="og:description"]', "content", description);
  updateMeta('meta[name="twitter:title"]', "content", title);
  updateMeta('meta[name="twitter:description"]', "content", description);
}

watch(
  settings,
  (value) => {
    writeStorage(`${APP_STORAGE_PREFIX}:settings`, value);
  },
  { deep: true }
);

watch(
  () => settings.uiLanguage,
  (value, previousValue) => {
    locale.value = value;
    writeCookie(LANGUAGE_COOKIE_NAME, value);
    updateDocumentMetadata(value);

    const previousDefault = defaultWebsiteForLanguage(previousValue || value);
    if (!settings.websiteName || settings.websiteName === previousDefault) {
      settings.websiteName = defaultWebsiteForLanguage(value);
    }
  },
  { immediate: true }
);

const hasImportedData = computed(() => forms.value.length > 0 || sightings.value.length > 0);

function importData(payload) {
  const nextWebsite = payload.website || null;
  const nextWebsiteSpeciesCommentTemplate = normalizeSpeciesCommentTemplate(
    nextWebsite?.species_comment_template
  );
  const nextSightings = payload.sightings || [];
  const nextForms = (payload.forms || []).map((form, index) =>
    buildForm(form, index + 1, { defaultNumberObserver: settings.defaultNumberObserver })
  );
  const nextFormsSightings = payload.formsSightings || [];

  if (
    !speciesCommentTemplateHasContent(settings.speciesCommentTemplate) ||
    sameSpeciesCommentTemplate(settings.speciesCommentTemplate, website.value?.species_comment_template)
  ) {
    settings.speciesCommentTemplate = structuredClone(nextWebsiteSpeciesCommentTemplate);
  }

  applyDefaultAutomaticAssignment({
    forms: nextForms,
    sightings: nextSightings,
    autoAssignDuration: settings.autoAssignDuration,
    autoAssignDistance: settings.autoAssignDistance,
    defaultNumberObserver: settings.defaultNumberObserver,
    speciesCommentTemplate: settings.speciesCommentTemplate,
  });

  website.value = nextWebsite;
  sightings.value = nextSightings;
  forms.value = nextForms;
  formsSightings.value = nextFormsSightings;
  selectedFormId.value = forms.value[0]?.id || null;
}

watch(
  () => settings.defaultNumberObserver,
  (value) => {
    forms.value.forEach((form) => {
      if (!form.number_observer) {
        form.number_observer = value;
      }
    });
  }
);

function openInfo(section = "") {
  infoSection.value = section;
  infoOpen.value = true;
}

function openSettings(section = "") {
  settingsFocusSection.value = section;
  settingsOpen.value = true;
}

function closeSettings() {
  settingsOpen.value = false;
  settingsFocusSection.value = "";
}

function openSettingsForSection(section) {
  if (section === "advanced-options") {
    settings.advancedEnabled = true;
  }
  openSettings(section);
}
</script>

<template>
  <div class="app-shell container py-3">
    <AppHeader
      :ui-language="settings.uiLanguage"
      @update:ui-language="settings.uiLanguage = $event"
      @open-info="openInfo()"
      @open-settings="openSettings()"
    />

    <SettingsPanel
      :open="settingsOpen"
      :settings="settings"
      :focus-section="settingsFocusSection"
      @close="closeSettings"
      @open-info="openInfo($event)"
    />
    <div v-if="infoOpen" class="modal-backdrop" @click.self="infoOpen = false">
      <section class="modal-panel card border-0 shadow">
        <div class="card-body p-4">
          <div class="d-flex justify-content-between align-items-center mb-3">
            <h2 class="mb-0 d-inline-flex align-items-center gap-2">
              <i class="bi bi-journal-text" aria-hidden="true"></i>
              <span>{{ $t("infoTitle") }}</span>
            </h2>
            <button class="btn btn-outline-secondary btn-sm" type="button" @click="infoOpen = false">
              {{ $t("close") }}
            </button>
          </div>
          <InfoPanel :focus-section="infoSection" />
        </div>
      </section>
    </div>

    <main class="main-stack">
      <ImportPanel
        :selected-website-name="settings.websiteName"
        @update:selected-website-name="settings.websiteName = $event"
        @import-data="importData"
      />

      <AdvancedPanel
        v-if="settings.advancedEnabled && forms.length > 0"
        :forms="forms"
        :sightings="sightings"
        :forms-sightings="formsSightings"
        :mapbox-token="settings.mapboxToken"
        :global-static-map="settings.globalStaticMap"
        :selected-form-id="selectedFormId"
        :default-species-comment-template="settings.speciesCommentTemplate"
        :default-number-observer="settings.defaultNumberObserver"
        :default-assign-duration="settings.autoAssignDuration"
        :default-assign-distance="settings.autoAssignDistance"
        @update:selected-form-id="selectedFormId = $event"
        @open-info="openInfo('auto-assignment')"
      />

      <ExportPanel
        v-if="hasImportedData"
        :forms="forms"
        :sightings="sightings"
        :forms-sightings="formsSightings"
        :selected-ebird-language="settings.ebirdLanguage"
        :mapbox-token="settings.mapboxToken"
        :global-static-map="settings.globalStaticMap"
        :species-comment-template="settings.speciesCommentTemplate"
        :customized-species-comments="settings.customizedSpeciesComments"
        @open-settings-section="openSettingsForSection"
      />
    </main>

    <AppFooter :version="version" />
  </div>
</template>

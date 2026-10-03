<script setup>
import {
  computed,
  defineAsyncComponent,
  nextTick,
  onBeforeUnmount,
  reactive,
  ref,
  watch,
} from "vue";
import { useI18n } from "vue-i18n";
import "./app.css";
import AppHeader from "./components/AppHeader.vue";
import AppFooter from "./components/AppFooter.vue";
import ImportPanel from "./components/ImportPanel.vue";
import {
  ASSIGNMENT_MAP_BASE_LAYER_OPTIONS,
  APP_STORAGE_PREFIX,
  DEFAULT_SETTINGS,
  DEFAULT_SPECIES_COMMENT_LONG_TEMPLATE_OPTIONS,
  DEFAULT_SPECIES_COMMENT_TEMPLATE,
  DEFAULT_SPECIES_COMMENT_TEMPLATE_OPTIONS,
  DEFAULT_WEBSITE_BY_LANGUAGE,
  LANGUAGE_COOKIE_NAME,
  SPECIES_COMMENT_TEMPLATE_OPTION_KEYS,
  buildSpeciesCommentTemplateFromOptions,
} from "./lib/constants";
import { readStorage, writeCookie, writeStorage } from "./lib/storage";
import { normalizeLanguage, resolveUiLanguage, setI18nLanguage } from "./i18n";
import { assembleImport } from "./lib/utils";
import { confirmDialog } from "./lib/dialog";
import AppDialog from "./components/AppDialog.vue";

const SettingsPanel = defineAsyncComponent(() => import("./components/SettingsPanel.vue"));
const HelpPage = defineAsyncComponent(() => import("./components/HelpPage.vue"));
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

function hasSpeciesCommentTemplateOptions(options) {
  return (
    options &&
    typeof options === "object" &&
    SPECIES_COMMENT_TEMPLATE_OPTION_KEYS.some((key) => key in options)
  );
}

function normalizeSpeciesCommentSettings(savedSettings) {
  const savedOptions = savedSettings.speciesCommentTemplateOptions;
  const savedLongOptions = savedSettings.speciesCommentLongTemplateOptions;
  const hasSavedOptions = hasSpeciesCommentTemplateOptions(savedOptions);

  if (!hasSavedOptions) {
    return {
      options: structuredClone(DEFAULT_SPECIES_COMMENT_TEMPLATE_OPTIONS),
      longOptions: structuredClone(DEFAULT_SPECIES_COMMENT_LONG_TEMPLATE_OPTIONS),
      template: structuredClone(DEFAULT_SPECIES_COMMENT_TEMPLATE),
    };
  }

  const normalizeOptions = (value, defaults) =>
    Object.fromEntries(
      SPECIES_COMMENT_TEMPLATE_OPTION_KEYS.map((key) => [
        key,
        key in (value || {}) ? Boolean(value[key]) : Boolean(defaults[key]),
      ]),
    );
  const options = normalizeOptions(savedOptions, DEFAULT_SPECIES_COMMENT_TEMPLATE_OPTIONS);
  const longOptions = normalizeOptions(savedLongOptions, options);
  longOptions.personalized = false;
  const template = options.personalized
    ? normalizeSpeciesCommentTemplate(savedSettings.speciesCommentTemplate)
    : buildSpeciesCommentTemplateFromOptions(
        options,
        savedSettings.speciesCommentTemplate?.limit || DEFAULT_SPECIES_COMMENT_TEMPLATE.limit,
        longOptions,
      );

  return { options, longOptions, template };
}

function normalizeGlobalStaticMap(settings) {
  const defaults = DEFAULT_SETTINGS.globalStaticMap;
  const normalized = settings && typeof settings === "object" ? settings : {};

  return {
    show: Boolean(normalized.show),
    interactive: Boolean(normalized.interactive),
    style:
      typeof normalized.style === "string" && normalized.style ? normalized.style : defaults.style,
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

function normalizeAssignmentMapBaseLayer(value) {
  return ASSIGNMENT_MAP_BASE_LAYER_OPTIONS.includes(value)
    ? value
    : DEFAULT_SETTINGS.assignmentMapBaseLayer;
}

function defaultWebsiteForLanguage(language) {
  return DEFAULT_WEBSITE_BY_LANGUAGE[language] || DEFAULT_WEBSITE_BY_LANGUAGE.en;
}

const storedSettings = readStorage(`${APP_STORAGE_PREFIX}:settings`, null);
const savedSettings = storedSettings || DEFAULT_SETTINGS;
const queryLanguage = normalizeLanguage(
  typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("lang") : "",
);
const resolvedUiLanguage = resolveUiLanguage(savedSettings);
const initialWebsiteName =
  queryLanguage || !savedSettings.websiteName
    ? defaultWebsiteForLanguage(resolvedUiLanguage)
    : savedSettings.websiteName;
// Dropped settings: assignmentMap, and ebirdLanguage/language (the export now writes scientific
// names, which eBird matches whatever the account language).
const {
  assignmentMap: _legacyAssignmentMap,
  ebirdLanguage: _legacyEbirdLanguage,
  language: _legacyLanguage,
  ...savedSettingsWithoutLegacyKeys
} = savedSettings;
const normalizedSpeciesCommentSettings = normalizeSpeciesCommentSettings(savedSettings);

const settings = reactive({
  ...DEFAULT_SETTINGS,
  ...savedSettingsWithoutLegacyKeys,
  uiLanguage: resolvedUiLanguage,
  websiteName: initialWebsiteName,
  assignmentMapBaseLayer: normalizeAssignmentMapBaseLayer(savedSettings.assignmentMapBaseLayer),
  speciesCommentTemplateOptions: normalizedSpeciesCommentSettings.options,
  speciesCommentLongTemplateOptions: normalizedSpeciesCommentSettings.longOptions,
  speciesCommentTemplate: normalizedSpeciesCommentSettings.template,
  globalStaticMap: normalizeGlobalStaticMap(savedSettings.globalStaticMap),
});

const website = ref(null);
const sightings = ref([]);
const forms = ref([]);
const formsSightings = ref([]);
const selectedFormId = ref(null);
const settingsOpen = ref(false);
const settingsFocusSection = ref("");
const version = __APP_VERSION__;

// One-off announcement of a change returning users should know about. Shown to users who have
// used the app before (they have saved settings) until they dismiss it or NEWS.until passes.
// For a new announcement, change NEWS.id.
const NEWS = { id: "2026-10-scientific-names", version: "0.3", until: "2027-03-31" };
const NEWS_STORAGE_KEY = `${APP_STORAGE_PREFIX}:dismissed-news`;
const showNews = ref(
  storedSettings !== null &&
    new Date() < new Date(NEWS.until) &&
    readStorage(NEWS_STORAGE_KEY, "") !== NEWS.id,
);

function dismissNews() {
  showNews.value = false;
  writeStorage(NEWS_STORAGE_KEY, NEWS.id);
}
const { t } = useI18n({ useScope: "global" });
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

// Debounced: typing in a custom template would otherwise serialise all settings on every keystroke.
let settingsWriteTimer = null;
function writeSettings() {
  clearTimeout(settingsWriteTimer);
  settingsWriteTimer = null;
  writeStorage(`${APP_STORAGE_PREFIX}:settings`, settings);
}
watch(
  settings,
  () => {
    clearTimeout(settingsWriteTimer);
    settingsWriteTimer = setTimeout(writeSettings, 300);
  },
  { deep: true },
);
window.addEventListener("pagehide", () => {
  if (settingsWriteTimer) {
    writeSettings();
  }
});

watch(
  () => settings.uiLanguage,
  (value, previousValue) => {
    writeCookie(LANGUAGE_COOKIE_NAME, value);
    setI18nLanguage(value).then(() => {
      // Skip if the user switched language again while this one was loading.
      if (settings.uiLanguage === value) {
        updateDocumentMetadata(value);
      }
    });

    const previousDefault = defaultWebsiteForLanguage(previousValue || value);
    if (!settings.websiteName || settings.websiteName === previousDefault) {
      settings.websiteName = defaultWebsiteForLanguage(value);
    }
  },
  { immediate: true },
);

const hasImportedData = computed(() => {
  return forms.value.length > 0 || sightings.value.length > 0 || formsSightings.value.length > 0;
});

function clearImportedData() {
  website.value = null;
  sightings.value = [];
  forms.value = [];
  formsSightings.value = [];
  selectedFormId.value = null;
}

function importData(payload) {
  const nextWebsite = payload.website || null;
  const nextWebsiteSpeciesCommentTemplate = normalizeSpeciesCommentTemplate(
    nextWebsite?.species_comment_template,
  );

  if (settings.speciesCommentTemplateOptions.personalized) {
    if (
      !speciesCommentTemplateHasContent(settings.speciesCommentTemplate) ||
      sameSpeciesCommentTemplate(
        settings.speciesCommentTemplate,
        website.value?.species_comment_template,
      )
    ) {
      settings.speciesCommentTemplate = structuredClone(nextWebsiteSpeciesCommentTemplate);
    }
  } else {
    settings.speciesCommentTemplate = buildSpeciesCommentTemplateFromOptions(
      settings.speciesCommentTemplateOptions,
      settings.speciesCommentTemplate.limit,
      settings.speciesCommentLongTemplateOptions,
    );
  }

  const assembled = assembleImport(payload, {
    defaultNumberObserver: settings.defaultNumberObserver,
    autoAssignDuration: settings.autoAssignDuration,
    autoAssignDistance: settings.autoAssignDistance,
    speciesCommentTemplate: settings.speciesCommentTemplate,
  });

  website.value = nextWebsite;
  sightings.value = assembled.sightings;
  forms.value = assembled.forms;
  formsSightings.value = assembled.formsSightings;
  selectedFormId.value = forms.value[0]?.id || null;
}

async function updateSelectedWebsiteName(nextWebsiteName) {
  const normalizedName = String(nextWebsiteName || "").trim();
  if (!normalizedName || normalizedName === settings.websiteName) {
    return;
  }

  if (!hasImportedData.value) {
    settings.websiteName = normalizedName;
    return;
  }

  const confirmed = await confirmDialog(
    t("websiteChangeConfirm", {
      currentWebsite: settings.websiteName,
      nextWebsite: normalizedName,
    }),
  );
  if (!confirmed) {
    return;
  }

  clearImportedData();
  settings.websiteName = normalizedName;
}

watch(
  () => settings.defaultNumberObserver,
  (value) => {
    forms.value.forEach((form) => {
      if (!form.number_observer) {
        form.number_observer = value;
      }
    });
  },
);

// The help page lives at #help, or #help/<section> to open one section or FAQ question, so it
// can be linked to from anywhere (?lang=de#help for German). The app stays mounted underneath,
// and the browser's back button returns to it.
const HELP_HASH = /^#help(?:\/([\w-]+))?$/;

function helpSectionFromHash() {
  const match = window.location.hash.match(HELP_HASH);
  return match ? match[1] || "" : null;
}

const helpSection = ref(helpSectionFromHash());
let helpOpenedFromApp = false;
let appScrollY = 0;

function onHashChange() {
  const wasOpen = helpSection.value !== null;
  const section = helpSectionFromHash();
  if (!wasOpen && section !== null) {
    helpOpenedFromApp = true;
    appScrollY = window.scrollY;
  }
  helpSection.value = section;
  if (wasOpen && section === null) {
    helpOpenedFromApp = false;
    nextTick(() => window.scrollTo({ top: appScrollY, behavior: "instant" }));
  }
}

window.addEventListener("hashchange", onHashChange);
onBeforeUnmount(() => window.removeEventListener("hashchange", onHashChange));

function openHelp(section = "") {
  closeSettings();
  window.location.hash = section ? `help/${section}` : "help";
}

function closeHelp() {
  if (helpOpenedFromApp) {
    window.history.back();
    return;
  }
  window.history.pushState(null, "", window.location.pathname + window.location.search);
  onHashChange();
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
      @open-info="openHelp()"
      @open-settings="openSettings()"
    />

    <SettingsPanel
      :open="settingsOpen"
      :settings="settings"
      :focus-section="settingsFocusSection"
      @close="closeSettings"
      @open-info="openHelp($event)"
    />
    <HelpPage v-if="helpSection !== null" :section="helpSection" @close="closeHelp" />

    <main v-show="helpSection === null" class="main-stack">
      <div
        v-if="showNews"
        class="alert alert-info d-flex align-items-start gap-3 mb-0"
        role="status"
      >
        <i class="bi bi-stars fs-5" aria-hidden="true"></i>
        <div class="flex-grow-1">
          <strong>{{ t("newsTitle", { version: NEWS.version }) }}</strong>
          {{ t("newsBody") }}
          <a href="#help/species-matching">{{ t("newsLink") }}</a>
        </div>
        <button
          class="btn-close flex-shrink-0"
          type="button"
          :aria-label="t('close')"
          @click="dismissNews"
        ></button>
      </div>
      <ImportPanel
        :selected-website-name="settings.websiteName"
        @update:selected-website-name="updateSelectedWebsiteName"
        @import-data="importData"
      />

      <AdvancedPanel
        v-if="settings.advancedEnabled && (forms.length > 0 || sightings.length > 0)"
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
        :assignment-map-base-layer="settings.assignmentMapBaseLayer"
        @update:selected-form-id="selectedFormId = $event"
        @update:assignment-map-base-layer="settings.assignmentMapBaseLayer = $event"
        @open-info="openHelp('auto-assignment')"
      />

      <ExportPanel
        v-if="hasImportedData"
        :forms="forms"
        :sightings="sightings"
        :forms-sightings="formsSightings"
        :mapbox-token="settings.mapboxToken"
        :github-token="settings.githubToken"
        :global-static-map="settings.globalStaticMap"
        :species-comment-template="settings.speciesCommentTemplate"
        :customized-species-comments="settings.customizedSpeciesComments"
        @open-settings-section="openSettingsForSection"
      />
    </main>

    <AppFooter :version="version" />
    <AppDialog />
  </div>
</template>

<script setup>
import { computed, defineAsyncComponent, onBeforeUnmount, reactive, ref, toRefs, watch } from "vue";
import { useI18n } from "vue-i18n";
import "./app.css";
import AppHeader from "./components/AppHeader.vue";
import AppFooter from "./components/AppFooter.vue";
import ImportPanel from "./components/ImportPanel.vue";
import {
  APP_STORAGE_PREFIX,
  LANGUAGE_COOKIE_NAME,
  buildSpeciesCommentTemplateFromOptions,
} from "./lib/constants";
import { readStorage, writeCookie, writeStorage } from "./lib/storage";
import {
  defaultWebsiteForLanguage,
  loadSettings,
  normalizeSpeciesCommentTemplate,
  saveSettings,
} from "./lib/settings";
import { setI18nLanguage } from "./i18n";
import { assembleImport } from "./lib/utils";
import { store } from "./lib/store";
import { confirmDialog } from "./lib/dialog";
import AppDialog from "./components/AppDialog.vue";

const SettingsPanel = defineAsyncComponent(() => import("./components/SettingsPanel.vue"));
const HelpPanel = defineAsyncComponent(() => import("./components/HelpPanel.vue"));
const AdvancedPanel = defineAsyncComponent(() => import("./components/AdvancedPanel.vue"));
const ExportPanel = defineAsyncComponent(() => import("./components/ExportPanel.vue"));

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

const { settings: loadedSettings, isReturningUser } = loadSettings();
const settings = reactive(loadedSettings);

const website = ref(null);
const { forms, sightings, formsSightings } = toRefs(store.state);
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
  isReturningUser &&
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
  saveSettings(settings);
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
  store.clear();
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
  store.loadImport(assembled);
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
  (value) => store.fillNumberObserver(value),
);

const infoOpen = ref(false);
const infoSection = ref("");

function openInfo(section = "") {
  infoSection.value = section;
  infoOpen.value = true;
}

// Links can open the help too: #help, or #help/<id> for one section or FAQ question
// (?lang=de#help for German), so eBird's documentation can link to it.
const HELP_HASH = /^#help(?:\/([\w-]+))?$/;

function openInfoFromHash() {
  const match = window.location.hash.match(HELP_HASH);
  if (match) {
    openInfo(match[1] || "");
  }
}

function closeInfo() {
  infoOpen.value = false;
  if (HELP_HASH.test(window.location.hash)) {
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
  }
}

openInfoFromHash();
window.addEventListener("hashchange", openInfoFromHash);
onBeforeUnmount(() => window.removeEventListener("hashchange", openInfoFromHash));

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
    <div
      v-if="infoOpen"
      class="modal-backdrop d-grid p-3 overflow-x-hidden"
      @click.self="closeInfo"
    >
      <section class="modal-panel card border-0 shadow d-flex flex-column overflow-hidden">
        <div class="card-body modal-body-shell d-flex flex-column flex-grow-1 p-4">
          <div class="d-flex flex-shrink-0 justify-content-between align-items-center mb-3">
            <h2 class="modal-title-heading">
              <i class="bi bi-journal-text" aria-hidden="true"></i>
              <span>{{ $t("infoTitle") }}</span>
            </h2>
            <button class="btn btn-outline-secondary btn-sm" type="button" @click="closeInfo">
              {{ $t("close") }}
            </button>
          </div>
          <div class="modal-content-scroll flex-grow-1 overflow-x-hidden overflow-y-auto">
            <HelpPanel :section="infoSection" />
          </div>
        </div>
      </section>
    </div>

    <main class="main-stack">
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
        @open-info="openInfo('auto-assignment')"
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

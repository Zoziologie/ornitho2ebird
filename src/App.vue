<script setup>
import {
  computed,
  defineAsyncComponent,
  onBeforeUnmount,
  provide,
  reactive,
  ref,
  toRefs,
  watch,
} from "vue";
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
  SETTINGS_INJECTION_KEY,
  defaultWebsiteForLanguage,
  loadSettings,
  normalizeSpeciesCommentTemplate,
  saveSettings,
} from "./lib/settings";
import { setI18nLanguage } from "./i18n";
import { assembleImport } from "./lib/utils";
import { resolveBasemap } from "./lib/basemaps";
import { store } from "./lib/store";
import { confirmDialog } from "./lib/dialog";
import { WORKFLOW_STEPS } from "./lib/workflow";
import LinkedText from "./components/LinkedText.vue";
import AppDialog from "./components/AppDialog.vue";
import AnalyticsConsent from "./components/AnalyticsConsent.vue";
import { getAnalytics, trackEvent } from "./lib/analytics";

getAnalytics().start();

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
provide(SETTINGS_INJECTION_KEY, settings);

// Track only selected setting names; never send templates, tokens or typed values.
for (const [name, read] of Object.entries({
  defaultNumberObserver: () => settings.defaultNumberObserver,
  autoAssignDuration: () => settings.autoAssignDuration,
  autoAssignDistance: () => settings.autoAssignDistance,
  customizedSpeciesComments: () => settings.customizedSpeciesComments,
  personalizedComments: () => settings.speciesCommentTemplateOptions.personalized,
  staticMap: () => settings.globalStaticMap.show,
  interactiveMap: () => settings.globalStaticMap.interactive,
})) {
  watch(read, () => trackEvent("setting_change", { setting_name: name }));
}
watch(
  () => settings.uiLanguage,
  (language) => trackEvent("language_change", { language }),
);
watch(
  () => settings.advancedEnabled,
  (enabled) => trackEvent("mode_change", { mode: enabled ? "customized" : "basic" }),
);
watch(
  () => settings.assignmentMapBaseLayer,
  (layer) => trackEvent("map_layer_change", { layer }),
);

const website = ref(null);
const { forms, sightings, formsSightings } = toRefs(store.state);
const selectedFormId = ref(null);
const settingsOpen = ref(false);
const settingsFocusSection = ref("");
const version = __APP_VERSION__;

// One-off announcement of a change returning users should know about. Shown to users who have
// used the app before (they have saved settings) until they dismiss it or NEWS.until passes.
// For a new announcement, change NEWS.id.
const NEWS = { id: "2026-10-scientific-names", until: "2027-03-31" };
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

// The saved basemap, or the national map of the source website when none was chosen.
const basemap = computed(() =>
  resolveBasemap(settings.assignmentMapBaseLayer, settings.websiteName),
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
  assignmentCustomized.value = settings.advancedEnabled;
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

// In Basic mode the grouping limits apply to the current import too, so the export page's "Change
// the grouping" link has a visible effect. Not once Customized mode has been used for this
// import: regrouping would undo the user's own assignments.
const assignmentCustomized = ref(false);
watch(
  () => settings.advancedEnabled,
  (enabled) => {
    if (enabled && hasImportedData.value) {
      assignmentCustomized.value = true;
    }
  },
);
watch(
  () => [settings.autoAssignDuration, settings.autoAssignDistance],
  ([duration, distance]) => {
    if (assignmentCustomized.value || !hasImportedData.value || !(duration > 0 && distance > 0)) {
      return;
    }
    store.resetAssignment();
    store.autoAssign({
      autoAssignDuration: duration,
      autoAssignDistance: distance,
      defaultNumberObserver: settings.defaultNumberObserver,
      speciesCommentTemplate: settings.speciesCommentTemplate,
    });
  },
);

watch(
  () => settings.defaultNumberObserver,
  (value) => store.fillNumberObserver(value),
);

const infoOpen = ref(false);
const infoSection = ref("");

function openInfo(section = "") {
  trackEvent("help_open", { section });
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
  trackEvent("settings_open");
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
      <AnalyticsConsent v-if="!settingsOpen" />
      <div
        v-if="showNews"
        class="alert alert-info d-flex align-items-start gap-3 mb-0"
        role="status"
      >
        <i class="bi bi-stars fs-5" aria-hidden="true"></i>
        <div class="flex-grow-1">
          <strong>{{ t("newsTitle") }}</strong>
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

      <section v-if="!hasImportedData" class="card border-0 shadow-sm rounded-3 mb-3">
        <div class="card-body p-3 p-md-4">
          <h2 class="h5 mb-3">{{ t("infoWorkflowTitle") }}</h2>
          <ol class="instruction-list workflow-overview mb-3">
            <li v-for="step in WORKFLOW_STEPS" :key="step.id" class="instruction-list-item">
              <span class="instruction-list-icon">
                <i :class="['bi', step.icon]" aria-hidden="true"></i>
              </span>
              <span>{{ t(step.labelKey) }}</span>
            </li>
          </ol>
          <p class="small text-muted mb-0">
            <LinkedText :text="t('workflowHelpLink')" :links="['#help']" />
          </p>
        </div>
      </section>

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
        :assignment-map-base-layer="basemap"
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
        :advanced-enabled="settings.advancedEnabled"
        :auto-assign-duration="settings.autoAssignDuration"
        :auto-assign-distance="settings.autoAssignDistance"
        @open-settings-section="openSettingsForSection"
      />
    </main>

    <AppFooter :version="version" @open-privacy="openSettings('privacy')" />
    <AppDialog />
  </div>
</template>

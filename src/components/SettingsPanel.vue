<script setup>
import { computed, nextTick, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { DEFAULT_SPECIES_COMMENT_TEMPLATE, EBIRD_LANGUAGES } from "../lib/constants";
import { speciesComment } from "../lib/utils";

const props = defineProps({
  open: {
    type: Boolean,
    required: true,
  },
  settings: {
    type: Object,
    required: true,
  },
  focusSection: {
    type: String,
    default: "",
  },
});

const emit = defineEmits(["close", "open-info"]);
const { t } = useI18n();
const staticMapStyleOptions = [
  { value: "satellite-v9", label: "Satellite" },
  { value: "streets-v11", label: "Street" },
  { value: "outdoors-v12", label: "Outdoor" },
  { value: "satellite-streets-v12", label: "Satellite-Street" },
];
const markerSymbolOptions = ["circle", "triangle", "square", "star"];
const PERSONALIZED_PRESET_KEY = "personalized";

const previewSightings = [
  {
    id: 36150841,
    source_species_id: "408",
    ebird_species_code: "eurbla",
    source_website_name: "ornitho.ch",
    source_record_url: "https://www.ornitho.ch/index.php?m_id=54&id=36150841",
    location_name: "Leuzigen [602/224]",
    lat: 47.168486,
    lon: 7.465799,
    coordinates: "47.168486, 7.465799",
    google_maps_url: "https://maps.google.com/?q=47.168486,7.465799",
    date: "2026-03-10",
    time: "08:23",
    common_name: "Merle noir",
    scientific_name: "Turdus merula",
    count: 4,
    count_precision: "=",
    atlas_code: "5",
    auditory_contact: "1",
    comment: "Ceci est une remarque<br>1x male 1re annee, 2x type femelle",
  },
];
const repeatedPreviewSightings = Array.from({ length: 12 }, (_, index) => ({
  ...previewSightings[0],
  id: 36150841 + index,
  time: `${String(8 + Math.floor(index / 3)).padStart(2, "0")}:${String((23 + index * 7) % 60).padStart(2, "0")}`,
  comment: ["Ceci est une remarque", "chante", "1x male 1re annee", "2x type femelle", ""][index % 5],
}));

const shortPreviewSightings = computed(() => {
  const limit = Math.max(1, Number(props.settings.speciesCommentTemplate.limit) || 5);
  return repeatedPreviewSightings.slice(0, Math.max(1, Math.min(limit - 1, repeatedPreviewSightings.length - 1)));
});

const longPreviewSightings = computed(() => {
  const limit = Math.max(1, Number(props.settings.speciesCommentTemplate.limit) || 5);
  return repeatedPreviewSightings.slice(0, Math.min(limit + 1, repeatedPreviewSightings.length));
});

const speciesCommentPreview = computed(() => {
  return speciesComment(props.settings.speciesCommentTemplate, shortPreviewSightings.value);
});

const speciesCommentLongPreview = computed(() => {
  return speciesComment(props.settings.speciesCommentTemplate, longPreviewSightings.value);
});

const propertyRows = [
  ["id", "36150841"],
  ["source_species_id", "408"],
  ["ebird_species_code", "eurbla"],
  ["source_website_name", "ornitho.ch"],
  ["source_record_url", "https://www.ornitho.ch/index.php?m_id=54&id=36150841"],
  ["location_name", "Leuzigen [602/224]"],
  ["lat", "47.168486"],
  ["lon", "7.465799"],
  ["coordinates", "47.168486, 7.465799"],
  ["google_maps_url", "https://maps.google.com/?q=47.168486,7.465799"],
  ["date", "2026-03-10"],
  ["time", "08:23"],
  ["common_name", "Merle noir"],
  ["scientific_name", "Turdus merula"],
  ["count", "4"],
  ["count_precision", "="],
  ["atlas_code", "5"],
  ["auditory_contact", "1"],
  ["comment", "Ceci est une remarque<br>1x male 1re annee, 2x type femelle"],
];

const speciesCommentPresets = [
  {
    key: "basic",
    labelKey: "templatePresetBasic",
    short: DEFAULT_SPECIES_COMMENT_TEMPLATE.short,
    long: DEFAULT_SPECIES_COMMENT_TEMPLATE.long,
  },
  {
    key: "source",
    labelKey: "templatePresetOrnitho",
    short:
      '${ s.count_precision }${ s.count } ind.${ s.time ? " - " + s.time : "" }${ s.source_record_url ? \' - <a href="\' + s.source_record_url + \'">\' + s.source_website_name + "</a>" : (s.source_website_name ? " - " + s.source_website_name : "") }${ s.comment ? " - " + s.comment : "" }',
    long:
      '${ s.count_precision }${ s.count }${ s.time ? " - " + s.time : "" }${ s.source_record_url ? \' - <a href="\' + s.source_record_url + \'">\' + s.source_website_name + "</a>" : (s.source_website_name ? " - " + s.source_website_name : "") }${ s.comment ? " - " + s.comment : "" }',
  },
  {
    key: "map",
    labelKey: "templatePresetMap",
    short:
      '${ s.count_precision }${ s.count } ind.${ s.time ? " - " + s.time : "" }${ s.google_maps_url ? \' - <a href="\' + s.google_maps_url + \'">\' + s.coordinates + "</a>" : "" }${ s.source_record_url ? \' - <a href="\' + s.source_record_url + \'">\' + s.source_website_name + "</a>" : (s.source_website_name ? " - " + s.source_website_name : "") }${ s.comment ? " - " + s.comment : "" }',
    long:
      '${ s.count_precision }${ s.count }${ s.time ? " - " + s.time : "" }${ s.google_maps_url ? \' - <a href="\' + s.google_maps_url + \'">\' + s.coordinates + "</a>" : "" }${ s.source_record_url ? \' - <a href="\' + s.source_record_url + \'">\' + s.source_website_name + "</a>" : (s.source_website_name ? " - " + s.source_website_name : "") }${ s.comment ? " - " + s.comment : "" }',
  },
  {
    key: "auditory-atlas",
    labelKey: "templatePresetAuditoryAtlas",
    short:
      '${ s.auditory_contact !== "" ? "Auditory contact: " + s.auditory_contact : "" }${ s.auditory_contact !== "" && s.atlas_code !== "" ? " - " : "" }${ s.atlas_code !== "" ? "Atlas: " + s.atlas_code : "" }${ s.auditory_contact !== "" || s.atlas_code !== "" ? " - " : "" }${ s.count_precision }${ s.count } ind.${ s.time ? " - " + s.time : "" }${ s.comment ? " - " + s.comment : "" }',
    long:
      '${ s.auditory_contact !== "" ? "Auditory contact: " + s.auditory_contact : "" }${ s.auditory_contact !== "" && s.atlas_code !== "" ? " - " : "" }${ s.atlas_code !== "" ? "Atlas: " + s.atlas_code : "" }${ s.auditory_contact !== "" || s.atlas_code !== "" ? " - " : "" }${ s.count_precision }${ s.count }${ s.time ? " - " + s.time : "" }${ s.comment ? " - " + s.comment : "" }',
  },
];

const shortTemplatePresetOptions = computed(() => {
  return [...speciesCommentPresets, { key: PERSONALIZED_PRESET_KEY, labelKey: "templatePresetPersonalized" }];
});

const longTemplatePresetOptions = computed(() => {
  return [...speciesCommentPresets, { key: PERSONALIZED_PRESET_KEY, labelKey: "templatePresetPersonalized" }];
});

function templatePresetKeyFor(field) {
  const property = field === "long" ? "long" : "short";
  const matchedPreset = speciesCommentPresets.find(
    (preset) => preset[property] === props.settings.speciesCommentTemplate[property]
  );
  return matchedPreset?.key || PERSONALIZED_PRESET_KEY;
}

const selectedShortTemplatePresetKey = ref(templatePresetKeyFor("short"));
const selectedLongTemplatePresetKey = ref(templatePresetKeyFor("long"));
const shortTemplateIsPersonalized = computed(() => selectedShortTemplatePresetKey.value === PERSONALIZED_PRESET_KEY);
const longTemplateIsPersonalized = computed(() => selectedLongTemplatePresetKey.value === PERSONALIZED_PRESET_KEY);
const hasPersonalizedTemplate = computed(() => {
  return shortTemplateIsPersonalized.value || longTemplateIsPersonalized.value;
});

const advancedOptionsRef = ref(null);
const speciesCommentRef = ref(null);

const speciesCommentLimitError = computed(() => {
  const limit = Number(props.settings.speciesCommentTemplate.limit);

  if (!Number.isInteger(limit) || limit < 1) {
    return t("switchLimitError");
  }

  return "";
});

function applyTemplatePreset(field, presetKey) {
  if (field === "long") {
    selectedLongTemplatePresetKey.value = presetKey;
  } else {
    selectedShortTemplatePresetKey.value = presetKey;
  }

  if (presetKey === PERSONALIZED_PRESET_KEY) {
    return;
  }

  const property = field === "long" ? "long" : "short";
  const preset = speciesCommentPresets.find((entry) => entry.key === presetKey);
  if (!preset) {
    return;
  }

  props.settings.speciesCommentTemplate[property] = preset[property];
}

watch(
  () => props.settings.speciesCommentTemplate.short,
  () => {
    const matchedPreset = speciesCommentPresets.find(
      (preset) => preset.short === props.settings.speciesCommentTemplate.short
    );
    if (selectedShortTemplatePresetKey.value !== PERSONALIZED_PRESET_KEY || !matchedPreset) {
      selectedShortTemplatePresetKey.value = matchedPreset?.key || PERSONALIZED_PRESET_KEY;
    }
  }
);

watch(
  () => props.settings.speciesCommentTemplate.long,
  () => {
    const matchedPreset = speciesCommentPresets.find(
      (preset) => preset.long === props.settings.speciesCommentTemplate.long
    );
    if (selectedLongTemplatePresetKey.value !== PERSONALIZED_PRESET_KEY || !matchedPreset) {
      selectedLongTemplatePresetKey.value = matchedPreset?.key || PERSONALIZED_PRESET_KEY;
    }
  }
);

watch(
  () => [props.open, props.focusSection],
  async ([isOpen, section]) => {
    if (!isOpen || !section) {
      return;
    }

    await nextTick();
    const sectionMap = {
      "advanced-options": advancedOptionsRef.value,
      "species-comment-template": speciesCommentRef.value,
    };
    sectionMap[section]?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
);
</script>

<template>
  <div v-if="open" class="modal-backdrop" @click.self="emit('close')">
    <section class="modal-panel card border-0 shadow">
      <div class="card-body p-4">
        <div class="d-flex justify-content-between align-items-center mb-3">
          <h2 class="mb-0">{{ t("globalSettings") }}</h2>
          <button class="btn btn-outline-secondary btn-sm" type="button" @click="emit('close')">
            {{ t("close") }}
          </button>
        </div>

        <div class="mt-3">
          <h3 class="h5">{{ t("basicSettingsTitle") }}</h3>
          <div class="d-flex flex-column flex-md-row align-items-md-center gap-2 mb-1">
            <label class="form-label mb-0 flex-shrink-0" for="ebird-language-input">{{ t("ebirdLanguage") }}</label>
            <select id="ebird-language-input" v-model="settings.ebirdLanguage" class="form-select">
              <option
                v-for="language in EBIRD_LANGUAGES"
                :key="language.value"
                :value="language.value"
              >
                {{ language.label }}
              </option>
            </select>
          </div>
          <div class="form-text">
            {{ t("ebirdLanguageHelp") }}
            <a href="https://ebird.org/prefs" target="_blank" rel="noopener">{{
              t("ebirdLanguagePrefsLink")
            }}</a>
          </div>
        </div>

        <div class="mt-3">
          <div class="d-flex flex-column flex-md-row align-items-md-center gap-2 mb-1">
            <label class="form-label mb-0 flex-shrink-0" for="default-observers-input">{{ t("partySize") }}</label>
            <input
              id="default-observers-input"
              v-model.number="settings.defaultNumberObserver"
              class="form-control"
              type="number"
              min="1"
              step="1"
            />
          </div>
          <div class="form-text">{{ t("partySizeHelp") }}</div>
        </div>

        <div ref="advancedOptionsRef" class="mt-4">
          <h3 class="h5">{{ t("advancedOptionsTitle") }}</h3>
          <div class="d-grid gap-3 mt-1">
            <button
              class="btn w-100 text-start p-3 border"
              :class="settings.advancedEnabled ? 'btn-outline-secondary' : 'btn-secondary'"
              type="button"
              @click="settings.advancedEnabled = false"
            >
              <h4 class="h6 mb-1">{{ t("advancedModeSimpleTitle") }}</h4>
              <p class="mb-0 small">{{ t("advancedModeSimpleBody") }}</p>
            </button>
            <button
              class="btn w-100 text-start p-3 border"
              :class="settings.advancedEnabled ? 'btn-secondary' : 'btn-outline-secondary'"
              type="button"
              @click="settings.advancedEnabled = true"
            >
              <h4 class="h6 mb-1">{{ t("advancedModeCustomTitle") }}</h4>
              <p class="mb-0 small">{{ t("advancedModeCustomBody") }}</p>
            </button>
          </div>
        </div>

        <div class="mt-4">
          <h3 class="h5">{{ t("advancedSettingsTitle") }}</h3>
          <p class="small text-muted mb-2">{{ t("aggregationSettingsHelp") }}</p>
          <button
            class="btn btn-link btn-sm p-0 mb-3"
            type="button"
            @click="emit('open-info', 'auto-assignment')"
          >
            {{ t("aggregationSettingsLearnMore") }}
          </button>

          <div class="d-flex flex-column gap-3">
            <div>
              <div class="d-flex flex-column flex-md-row align-items-md-center gap-2 mb-1">
                <label class="form-label mb-0 flex-shrink-0" for="duration-input">{{ t("autoAssignDuration") }}</label>
                <input
                  id="duration-input"
                  v-model.number="settings.autoAssignDuration"
                  class="form-control"
                  type="number"
                  min="0.1"
                  max="24"
                  step="0.5"
                />
              </div>
              <div class="form-text">{{ t("autoAssignDurationHelp") }}</div>
            </div>

            <div>
              <div class="d-flex flex-column flex-md-row align-items-md-center gap-2 mb-1">
                <label class="form-label mb-0 flex-shrink-0" for="distance-input">{{ t("distance") }}</label>
                <input
                  id="distance-input"
                  v-model.number="settings.autoAssignDistance"
                  class="form-control"
                  type="number"
                  min="0.1"
                  step="0.5"
                />
              </div>
              <div class="form-text">{{ t("distanceHelp") }}</div>
            </div>
          </div>
        </div>

        <div ref="speciesCommentRef" class="mt-4">
          <h3 class="h5">{{ t("speciesCommentTemplate") }}</h3>
          <div class="form-check form-switch mb-3">
            <input
              id="customized-species-comments"
              v-model="settings.customizedSpeciesComments"
              class="form-check-input"
              type="checkbox"
            />
            <label class="form-check-label" for="customized-species-comments">
              {{ t("speciesCommentTemplateHelp") }}
            </label>
          </div>

          <div v-if="settings.customizedSpeciesComments">
            <div class="mb-3">
              <label class="form-label" for="short-template-preset">{{ t("template") }}</label>
              <select
                id="short-template-preset"
                class="form-select"
                :value="selectedShortTemplatePresetKey"
                @change="applyTemplatePreset('short', $event.target.value)"
              >
                <option v-for="preset in shortTemplatePresetOptions" :key="`short-${preset.key}`" :value="preset.key">
                  {{ t(preset.labelKey) }}
                </option>
              </select>
            </div>
            <div v-if="shortTemplateIsPersonalized" class="mb-3">
              <p class="small text-muted mb-2">{{ t("speciesCommentTemplateAdvancedHelp") }}</p>
              <textarea v-model="settings.speciesCommentTemplate.short" class="form-control" rows="4" />
            </div>

            <div class="card bg-light border-0 mb-4">
              <div class="card-body">
                <h4 class="h6">{{ t("preview") }}</h4>
                <div class="html-preview" v-html="speciesCommentPreview"></div>
              </div>
            </div>

            <div class="form-text mb-2">{{ t("longTemplateHelp") }}</div>
            <div class="mb-3">
              <div class="d-flex flex-column flex-md-row align-items-md-center gap-2 mb-1">
                <label class="form-label mb-0 flex-shrink-0" for="switch-limit-input">{{ t("switchLimit") }}</label>
                <input
                  id="switch-limit-input"
                  v-model.number="settings.speciesCommentTemplate.limit"
                  class="form-control"
                  :class="{ 'is-invalid': speciesCommentLimitError }"
                  type="number"
                  min="1"
                  step="1"
                />
              </div>
              <div v-if="speciesCommentLimitError" class="invalid-feedback d-block">
                {{ speciesCommentLimitError }}
              </div>
            </div>
            <div class="mb-4">
              <label class="form-label" for="long-template-preset">{{ t("longTemplate") }}</label>
              <select
                id="long-template-preset"
                class="form-select"
                :value="selectedLongTemplatePresetKey"
                @change="applyTemplatePreset('long', $event.target.value)"
              >
                <option v-for="preset in longTemplatePresetOptions" :key="`long-${preset.key}`" :value="preset.key">
                  {{ t(preset.labelKey) }}
                </option>
              </select>
            </div>
            <div v-if="longTemplateIsPersonalized" class="mb-4">
              <p class="small text-muted mb-2">{{ t("speciesCommentTemplateAdvancedHelp") }}</p>
              <textarea v-model="settings.speciesCommentTemplate.long" class="form-control" rows="4" />
            </div>

            <div class="card bg-light border-0 mb-4">
              <div class="card-body">
                <h4 class="h6">{{ t("longTemplatePreview") }}</h4>
                <div class="html-preview" v-html="speciesCommentLongPreview"></div>
              </div>
            </div>

            <div v-if="hasPersonalizedTemplate" class="card bg-light border-0">
              <div class="card-body">
                <h4 class="h6">{{ t("propertiesTitle") }}</h4>
                <div class="table-responsive">
                  <table class="table table-sm mb-0">
                    <thead>
                      <tr>
                        <th>{{ t("property") }}</th>
                        <th>{{ t("value") }}</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="[property, value] in propertyRows" :key="property">
                        <td><code>{{ property }}</code></td>
                        <td>{{ value }}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="mt-4">
          <h3 class="h5">{{ t("staticMapTitle") }}</h3>
          <div class="form-check form-switch mb-3">
            <input
              id="static-map-enabled"
              v-model="settings.globalStaticMap.show"
              class="form-check-input"
              type="checkbox"
            />
            <label class="form-check-label" for="static-map-enabled">
              {{ t("staticMapEnabled") }}
            </label>
          </div>

          <div v-if="settings.globalStaticMap.show">
            <div class="d-flex align-items-center justify-content-between gap-2">
              <label class="form-label mb-0">{{ t("mapboxToken") }}</label>
              <a
                class="small"
                href="https://account.mapbox.com/access-tokens/"
                target="_blank"
                rel="noopener"
              >
                {{ t("mapboxTokenLink") }}
              </a>
            </div>
            <input
              v-model.trim="settings.mapboxToken"
              class="form-control"
              type="text"
              placeholder="pk.ey..."
            />
            <div class="form-text mb-3">{{ t("mapboxTokenHelp") }}</div>

            <div class="mb-3">
              <label class="form-label mb-0">{{ t("staticMapStyle") }}</label>
              <select v-model="settings.globalStaticMap.style" class="form-select">
                <option
                  v-for="option in staticMapStyleOptions"
                  :key="option.value"
                  :value="option.value"
                >
                  {{ option.label }}
                </option>
              </select>
            </div>

            <div class="row g-2 mb-2">
              <div class="col-12">
                <label class="form-label mb-0">{{ t("pathStyle") }}</label>
              </div>
              <div class="col-md-4">
                <input
                  v-model.number="settings.globalStaticMap.pathStyle.strokeWidth"
                  class="form-control"
                  type="number"
                  min="1"
                  step="1"
                  title="line width"
                />
              </div>
              <div class="col-md-4">
                <input
                  v-model="settings.globalStaticMap.pathStyle.strokeColor"
                  class="form-control form-control-color w-100"
                  type="color"
                  title="line color"
                />
              </div>
              <div class="col-md-4">
                <input
                  v-model.number="settings.globalStaticMap.pathStyle.strokeOpacity"
                  class="form-control"
                  type="number"
                  min="0"
                  max="1"
                  step="0.1"
                  title="line opacity"
                />
              </div>
            </div>

            <div class="row g-2 mb-3">
              <div class="col-12">
                <label class="form-label mb-0">{{ t("markerStyle") }}</label>
              </div>
              <div class="col-md-4">
                <select v-model="settings.globalStaticMap.markerStyle.markerSize" class="form-select">
                  <option value="small">{{ t("small") }}</option>
                  <option value="medium">{{ t("medium") }}</option>
                  <option value="large">{{ t("large") }}</option>
                </select>
              </div>
              <div class="col-md-4">
                <select v-model="settings.globalStaticMap.markerStyle.markerSymbol" class="form-select">
                  <option v-for="symbol in markerSymbolOptions" :key="symbol" :value="symbol">
                    {{ symbol }}
                  </option>
                </select>
              </div>
              <div class="col-md-4">
                <input
                  v-model="settings.globalStaticMap.markerStyle.markerColor"
                  class="form-control form-control-color w-100"
                  type="color"
                />
              </div>
            </div>

            <h4 class="h6 mb-2">{{ t("interactiveMapTitle") }}</h4>
            <div class="form-check form-switch mb-2">
              <input
                id="interactive-map-enabled"
                v-model="settings.globalStaticMap.interactive"
                class="form-check-input"
                type="checkbox"
              />
              <label class="form-check-label" for="interactive-map-enabled">
                {{ t("interactiveMapEnabled") }}
              </label>
            </div>

            <div v-if="settings.globalStaticMap.interactive">
              <div class="form-text mb-3">{{ t("interactiveMapHelp") }}</div>
              <div class="d-flex align-items-center justify-content-between gap-2">
                <label class="form-label mb-0">{{ t("githubToken") }}</label>
                <a
                  class="small"
                  href="https://github.com/settings/tokens/new?scopes=gist&description=ornitho2ebird"
                  target="_blank"
                  rel="noopener"
                >
                  {{ t("githubTokenLink") }}
                </a>
              </div>
              <input
                v-model.trim="settings.githubToken"
                class="form-control"
                type="text"
                placeholder="github_pat_..."
              />
              <div class="form-text">{{ t("githubTokenHelp") }}</div>
            </div>
          </div>
        </div>

      </div>
    </section>
  </div>
</template>

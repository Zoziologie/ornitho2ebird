<script setup>
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { EBIRD_LANGUAGES } from "../lib/constants";
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
});

const emit = defineEmits(["close"]);
const { t } = useI18n();
const staticMapStyleOptions = [
  { value: "satellite-v9", label: "Satellite" },
  { value: "streets-v11", label: "Street" },
  { value: "outdoors-v12", label: "Outdoor" },
  { value: "satellite-streets-v12", label: "Satellite-Street" },
  { value: "light-v11", label: "Light" },
  { value: "dark-v11", label: "Dark" },
];
const markerSymbolOptions = ["circle", "triangle", "square", "star"];
const previewSightings = [
  {
    id: 21724328,
    location_name: "La Dullive",
    lat: 46.42315,
    lon: 6.292591,
    date: "2020-12-23",
    time: "14:53",
    common_name: "Ring-necked Duck",
    scientific_name: "",
    count: 1,
    count_precision: "=",
    comment: "",
  },
];

const speciesCommentPreview = computed(() => {
  return speciesComment(props.settings.speciesCommentTemplate, previewSightings);
});

const repeatedSightingsLimit = computed(() => {
  const singleLength = speciesCommentPreview.value.length || 1;
  return Math.floor(8000 / (singleLength + 5));
});

const propertyRows = [
  ["id", "21724328"],
  ["location_name", "La Dullive"],
  ["lat", "46.42315"],
  ["lon", "6.292591"],
  ["date", "2020-12-23"],
  ["time", "14:53"],
  ["common_name", "Ring-necked Duck"],
  ["scientific_name", ""],
  ["count", "1"],
  ["count_precision", "="],
  ["comment", ""],
];
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
          <div class="form-text">{{ t("ebirdLanguageHelp") }}</div>
        </div>

        <div class="mt-3">
          <div class="d-flex flex-column flex-md-row align-items-md-center gap-2 mb-1">
            <label class="form-label mb-0 flex-shrink-0" for="party-size-input">{{ t("partySize") }}</label>
            <input
              id="party-size-input"
              v-model.number="settings.defaultNumberObserver"
              class="form-control"
              type="number"
              min="1"
              step="1"
            />
          </div>
          <div class="form-text">{{ t("partySizeHelp") }}</div>
        </div>

        <div class="mt-4">
          <h3 class="h5">{{ t("advancedOptionsTitle") }}</h3>
          <div class="row g-3 mt-1">
            <div class="col-md-6">
              <button
                class="btn w-100 text-start h-100 p-3 border"
                :class="settings.advancedEnabled ? 'btn-outline-secondary' : 'btn-secondary'"
                type="button"
                @click="settings.advancedEnabled = false"
              >
                <h4 class="h6 mb-1">{{ t("advancedModeSimpleTitle") }}</h4>
                <p class="mb-0 small">{{ t("advancedModeSimpleBody") }}</p>
              </button>
            </div>
            <div class="col-md-6">
              <button
                class="btn w-100 text-start h-100 p-3 border"
                :class="settings.advancedEnabled ? 'btn-secondary' : 'btn-outline-secondary'"
                type="button"
                @click="settings.advancedEnabled = true"
              >
                <h4 class="h6 mb-1">{{ t("advancedModeCustomTitle") }}</h4>
                <p class="mb-0 small">{{ t("advancedModeCustomBody") }}</p>
              </button>
            </div>
          </div>
        </div>

        <div class="mt-4">
          <h3 class="h5">{{ t("advancedSettingsTitle") }}</h3>

          <div class="row g-3">
            <div class="col-md-6">
              <label class="form-label" for="duration-input">{{ t("autoAssignDuration") }}</label>
              <input
                id="duration-input"
                v-model.number="settings.autoAssignDuration"
                class="form-control"
                type="number"
                min="0.1"
                max="24"
                step="0.5"
              />
              <div class="form-text">{{ t("autoAssignDurationHelp") }}</div>
            </div>

            <div class="col-md-6">
              <label class="form-label" for="distance-input">{{ t("distance") }}</label>
              <input
                id="distance-input"
                v-model.number="settings.autoAssignDistance"
                class="form-control"
                type="number"
                min="0.1"
                step="0.5"
              />
              <div class="form-text">{{ t("distanceHelp") }}</div>
            </div>
          </div>
        </div>

        <div class="mt-4">
          <h3 class="h5">{{ t("staticMapTitle") }}</h3>
          <p class="small text-muted mb-3">{{ t("staticMapHelp") }}</p>
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
            <label class="form-label">{{ t("mapboxToken") }}</label>
            <input
              v-model.trim="settings.mapboxToken"
              class="form-control"
              type="text"
              placeholder="pk.ey..."
            />
            <div class="form-text mb-3">{{ t("mapboxTokenHelp") }}</div>

            <div class="mb-3">
              <label class="form-label">{{ t("staticMapStyle") }}</label>
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

            <div class="row g-3 mb-3">
              <div class="col-12">
                <label class="form-label">{{ t("pathStyle") }}</label>
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

            <div class="row g-3 mb-4">
              <div class="col-12">
                <label class="form-label">{{ t("markerStyle") }}</label>
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

            <h4 class="h6">{{ t("interactiveMapTitle") }}</h4>
            <label class="form-label">{{ t("githubToken") }}</label>
            <input
              v-model.trim="settings.githubToken"
              class="form-control"
              type="text"
              placeholder="github_pat_..."
            />
            <div class="form-text">{{ t("githubTokenHelp") }}</div>
          </div>
        </div>

        <div class="mt-4">
          <h3 class="h5">{{ t("speciesCommentTemplate") }}</h3>
          <p class="small text-muted mb-3">{{ t("speciesCommentTemplateHelp") }}</p>
          <div class="form-check form-switch mb-3">
            <input
              id="customized-species-comments"
              v-model="settings.customizedSpeciesComments"
              class="form-check-input"
              type="checkbox"
            />
            <label class="form-check-label" for="customized-species-comments">
              {{ t("customizedSpeciesComments") }}
            </label>
          </div>

          <div v-if="settings.customizedSpeciesComments">
            <div class="mb-3">
              <label class="form-label">{{ t("template") }}</label>
              <textarea v-model="settings.speciesCommentTemplate.short" class="form-control" rows="5" />
            </div>

            <h4 class="h6">{{ t("multipleSightingsTitle") }}</h4>
            <p>{{ t("multipleSightingsBody") }}</p>
            <p>{{ t("multipleSightingsLimitText", { count: repeatedSightingsLimit }) }}</p>

            <p class="mb-2">{{ t("longTemplateHelp") }}</p>
            <div class="mb-3">
              <label class="form-label">{{ t("longTemplate") }}</label>
              <textarea v-model="settings.speciesCommentTemplate.long" class="form-control" rows="5" />
            </div>
            <div class="mb-4">
              <label class="form-label">{{ t("switchLimit") }}</label>
              <input
                v-model.number="settings.speciesCommentTemplate.limit"
                class="form-control"
                type="number"
                min="1"
                step="1"
              />
            </div>

            <div class="row g-4 align-items-start">
              <div class="col-lg-7">
                <div class="card bg-light border-0 h-100">
                  <div class="card-body">
                    <h4 class="h6">{{ t("preview") }}</h4>
                    <div class="html-preview" v-html="speciesCommentPreview"></div>
                  </div>
                </div>
              </div>

              <div class="col-lg-5">
                <div class="card bg-light border-0 h-100">
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
          </div>
        </div>

      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, nextTick, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import websitesList from "/data/websites_list.json";
import { buildSpeciesCommentTemplate } from "../lib/utils";
import { loadOrnithoSpeciesList, loadScientificNameIndex } from "../lib/taxonomy";
import { trackEvent } from "../lib/analytics";
import { fetchJson } from "../lib/http";
import {
  ImportError,
  assignEbirdCodesFromScientificNames,
  needsScientificNameLookup,
} from "../lib/importers";
import { parseImportFiles } from "../lib/observationSessions";

const props = defineProps({
  selectedWebsiteName: {
    type: String,
    default: "",
  },
});

const emit = defineEmits(["import-data", "update:selectedWebsiteName"]);
const { t } = useI18n();

const loadingStatus = ref(null);
const numberImportedForms = ref(0);
const numberImportedSightings = ref(0);
const errorMessage = ref("");
const verificationWarning = ref("");
const skippedWarnings = ref([]);
const files = ref(null);
const fileInput = ref(null);
const dragCounter = ref(0);
const isDragActive = ref(false);
const importQueryDate = ref("offset");
const importQueryDateOffset = ref(1);
const importQueryDateRangeFrom = ref("");
const importQueryDateRangeTo = ref("");

function resetImportState() {
  loadingStatus.value = null;
  numberImportedForms.value = 0;
  numberImportedSightings.value = 0;
  errorMessage.value = "";
  verificationWarning.value = "";
  skippedWarnings.value = [];
  files.value = null;
  dragCounter.value = 0;
  isDragActive.value = false;
  if (fileInput.value) {
    fileInput.value.value = "";
  }
}

const websiteName = computed({
  get: () => props.selectedWebsiteName,
  set: (value) => emit("update:selectedWebsiteName", value),
});

const website = computed(() => {
  return websitesList.find((item) => item.name === websiteName.value) || null;
});

// The parent may ask for confirmation (or refuse) before switching website, so show the
// current value until the prop actually changes.
function onWebsiteChange(event) {
  const select = event.target;
  websiteName.value = select.value;
  nextTick(() => {
    select.value = props.selectedWebsiteName || "";
  });
}

watch(
  () => props.selectedWebsiteName,
  (nextValue, previousValue) => {
    if (nextValue !== previousValue) {
      resetImportState();
    }
  },
);

const importFileLabelKey = computed(() => {
  if (!website.value) {
    return "";
  }

  if (website.value.system === "ornitho") {
    return "importFileOrnitho";
  }
  if (website.value.system === "observation") {
    return "importFileObservation";
  }
  if (website.value.system === "birdlasser") {
    return "importFileBirdlasser";
  }
  if (website.value.system === "ornitho.net") {
    return "importFileOrnithoNet";
  }

  return "";
});

const importSuccessText = computed(() => {
  const listCount = Number(numberImportedForms.value) || 0;
  const sightingCount = Number(numberImportedSightings.value) || 0;

  return t("importSuccess", {
    lists: t("importSuccessLists", listCount),
    sightings: t("importSuccessSightings", sightingCount),
  });
});

const exportLink = computed(() => {
  if (!website.value) {
    return "#";
  }

  // ornitho expects dd.mm.yyyy. Reformat the "yyyy-mm-dd" input value directly: going
  // through Date would parse it as UTC and shift the day for users west of UTC.
  const toOrnithoDate = (value) => (value ? value.split("-").reverse().join(".") : "");
  const rangeFrom = toOrnithoDate(importQueryDateRangeFrom.value);
  const rangeTo = toOrnithoDate(importQueryDateRangeTo.value);

  return `${website.value.website}index.php?m_id=31&sp_DChoice=${importQueryDate.value}&sp_DFrom=${rangeFrom}&sp_DTo=${rangeTo}&sp_DOffset=${importQueryDateOffset.value}&sp_SChoice=all&sp_PChoice=all&sp_OnlyMyData=1`;
});

// Dropping a second file while the first is still loading must not let the first one win.
let importRunId = 0;

watch(files, async (nextFiles) => {
  const runId = ++importRunId;
  if (!nextFiles?.length || !website.value) {
    return;
  }

  const selectedWebsite = website.value;
  const sourceWebsite = selectedWebsite.name;
  trackEvent("import_start", { source_website: sourceWebsite });
  const isStale = () => runId !== importRunId;
  numberImportedForms.value = 0;
  numberImportedSightings.value = 0;
  errorMessage.value = "";
  verificationWarning.value = "";
  skippedWarnings.value = [];
  loadingStatus.value = 0;

  try {
    if (selectedWebsite.system === "ornitho") {
      await loadOrnithoSpeciesList();
    }
    if (isStale()) {
      return;
    }
    const parsed = await parseImportFiles(nextFiles, selectedWebsite);
    if (isStale()) return;
    if (needsScientificNameLookup(parsed)) {
      try {
        await loadScientificNameIndex();
        assignEbirdCodesFromScientificNames(parsed);
      } catch (error) {
        // Not fatal: these sightings keep their source names in the export.
        console.warn("Could not load the eBird scientific names", error);
      }
      if (isStale()) {
        return;
      }
    }
    parsed.website = {
      ...selectedWebsite,
      species_comment_template: buildSpeciesCommentTemplate(selectedWebsite),
    };

    skippedWarnings.value = [
      parsed.skipped.emptyForms > 0 ? t("importSkippedEmptyForms", parsed.skipped.emptyForms) : "",
      parsed.skipped.noCoordinates > 0
        ? t("importSkippedNoCoordinates", parsed.skipped.noCoordinates)
        : "",
      parsed.skipped.nonBirds > 0 ? t("importSkippedNonBirds", parsed.skipped.nonBirds) : "",
      selectedWebsite.system === "observation" && parsed.forms.length
        ? t("importSessionReview")
        : "",
    ].filter(Boolean);
    numberImportedForms.value = parsed.forms.length;
    numberImportedSightings.value = parsed.sightings.length;
    emit("import-data", parsed);
    loadingStatus.value = 1;
    trackEvent("import_file", {
      source_website: sourceWebsite,
      outcome: "success",
      import_profile: parsed.forms.length
        ? parsed.sightings.length
          ? "mixed"
          : "lists"
        : parsed.sightings.length
          ? "casual"
          : "empty",
    });

    // Only a hint, so it does not hold up the import.
    const warning = await checkWebsite(parsed, selectedWebsite);
    if (!isStale()) {
      verificationWarning.value = warning;
    }
  } catch (error) {
    if (isStale()) {
      return;
    }
    loadingStatus.value = -1;
    trackEvent("import_file", {
      source_website: sourceWebsite,
      outcome: "failure",
      failure_reason:
        {
          importErrorMissingColumns: "missing_columns",
          importErrorInvalidJson: "invalid_json",
          importErrorTxtHeader: "txt_header",
          importErrorUnsupported: "unsupported",
        }[error.key] || "unexpected",
    });
    errorMessage.value =
      error instanceof ImportError
        ? t(error.key, error.params)
        : t("importErrorUnexpected", {
            detail: error instanceof Error ? error.message : String(error),
          });
  }
});

function updateSelectedFiles(nextFiles) {
  const selection = Array.from(nextFiles || []);
  files.value = selection.length
    ? website.value.system === "observation"
      ? selection
      : selection.slice(0, 1)
    : null;
}

function openFilePicker() {
  fileInput.value?.click();
}

function onFileInputChange(event) {
  updateSelectedFiles(event.target.files);
}

function hasFilesPayload(event) {
  return Array.from(event.dataTransfer?.types || []).includes("Files");
}

function onDragEnter(event) {
  if (!website.value || !hasFilesPayload(event)) {
    return;
  }

  dragCounter.value += 1;
  isDragActive.value = true;
}

function onDragOver(event) {
  if (!website.value || !hasFilesPayload(event)) {
    return;
  }

  event.dataTransfer.dropEffect = "copy";
}

function onDragLeave(event) {
  if (!website.value || !hasFilesPayload(event)) {
    return;
  }

  dragCounter.value = Math.max(0, dragCounter.value - 1);
  if (dragCounter.value === 0) {
    isDragActive.value = false;
  }
}

function onFileDrop(event) {
  if (!website.value) {
    return;
  }

  dragCounter.value = 0;
  isDragActive.value = false;
  updateSelectedFiles(event.dataTransfer?.files);
}

async function checkWebsite(exportData, selectedWebsite) {
  if (selectedWebsite.osm_level === "world") {
    return "";
  }

  if (!selectedWebsite.osm_level) {
    return "";
  }

  const firstRecord =
    exportData.sightings.length > 0 ? exportData.sightings[0] : exportData.formsSightings[0]?.[0];

  if (!firstRecord) {
    return "";
  }

  try {
    const reverse = await fetchJson(
      `https://nominatim.openstreetmap.org/reverse.php?lat=${firstRecord.lat}&lon=${firstRecord.lon}&zoom=8&format=jsonv2&accept-language=en`,
      { timeoutMs: 8000 },
    );

    if (reverse.address?.[selectedWebsite.osm_level] !== selectedWebsite.osm_region) {
      return t("websiteWarning", {
        website: selectedWebsite.name,
        location: reverse.display_name,
      });
    }
  } catch {
    return "";
  }

  return "";
}
</script>

<template>
  <section class="card border-0 shadow-sm rounded-3 mb-3">
    <div class="card-body p-3 p-md-4">
      <h2 v-analytics-view="'import'" class="border-bottom pb-2 mb-3">{{ t("importTitle") }}</h2>
      <div class="row">
        <div class="col-lg-6 mb-3">
          <label class="form-label" for="import-source-website">{{ t("websiteSelect") }}</label>
          <select
            id="import-source-website"
            :value="websiteName"
            class="form-select form-select-lg"
            @change="onWebsiteChange"
          >
            <option value="" disabled>{{ t("websiteSelectPlaceholder") }}</option>
            <option v-for="entry in websitesList" :key="entry.name" :value="entry.name">
              {{ entry.name }}
            </option>
          </select>
        </div>
      </div>
      <!-- Steps in the order users do them: find/export the data, then upload it. -->
      <div v-if="website" class="row g-4">
        <div class="col-lg-6">
          <div class="feature-panel feature-panel-helper mb-0">
            <div class="feature-panel-header mb-3">
              <span class="feature-panel-icon" aria-hidden="true">
                <i class="bi bi-search"></i>
              </span>
              <div>
                <div class="feature-panel-eyebrow">{{ t("importStep", { n: 1 }) }}</div>
                <h3 class="h6 fw-bold mb-0">{{ t("importHelperTitle") }}</h3>
              </div>
            </div>

            <template v-if="website.system === 'ornitho'">
              <p class="mb-3">{{ t("importHelpOrnitho") }}</p>
              <div class="d-flex flex-column gap-2">
                <div class="row g-2 align-items-center">
                  <div class="col-sm-auto">
                    <div class="form-check m-0">
                      <input
                        id="recent-days"
                        v-model="importQueryDate"
                        class="form-check-input"
                        type="radio"
                        value="offset"
                      />
                      <label class="form-check-label d-block" for="recent-days">
                        {{ t("recentDays") }}
                      </label>
                    </div>
                  </div>
                  <div class="col-sm">
                    <input
                      v-model.number="importQueryDateOffset"
                      class="form-control"
                      type="number"
                      min="0"
                      :aria-label="t('recentDays')"
                      @focus="importQueryDate = 'offset'"
                    />
                  </div>
                </div>
                <div class="row g-2 align-items-center">
                  <div class="col-sm-auto">
                    <div class="form-check m-0">
                      <input
                        id="date-range"
                        v-model="importQueryDate"
                        class="form-check-input"
                        type="radio"
                        value="range"
                      />
                      <label class="form-check-label d-block" for="date-range">
                        {{ t("dateRange") }}
                      </label>
                    </div>
                  </div>
                  <div class="col-sm">
                    <input
                      v-model="importQueryDateRangeFrom"
                      class="form-control"
                      type="date"
                      :aria-label="t('dateRangeFrom')"
                      @focus="importQueryDate = 'range'"
                    />
                  </div>
                  <div class="col-sm">
                    <input
                      v-model="importQueryDateRangeTo"
                      class="form-control"
                      type="date"
                      :aria-label="t('dateRangeTo')"
                      @focus="importQueryDate = 'range'"
                    />
                  </div>
                </div>
              </div>
              <div class="d-flex justify-content-center mt-3">
                <a
                  class="btn btn-primary"
                  :href="exportLink"
                  target="_blank"
                  rel="noopener"
                  @click="trackEvent('workflow_link', { destination: 'source_export' })"
                >
                  {{ t("openExportPage", { website: website.name }) }}
                </a>
              </div>
            </template>

            <template v-else-if="website.system === 'observation'">
              <p class="mb-3">{{ t("importHelpObservation") }}</p>
              <div class="d-flex justify-content-center">
                <a
                  class="btn btn-primary"
                  :href="website.website"
                  target="_blank"
                  rel="noopener"
                  @click="trackEvent('workflow_link', { destination: 'source_export' })"
                >
                  {{ t("openWebsite", { website: website.name }) }}
                </a>
              </div>
            </template>

            <template v-else-if="website.system === 'birdlasser'">
              <p class="mb-3">{{ t("importHelpBirdlasser") }}</p>
              <div class="d-flex justify-content-center">
                <a
                  class="btn btn-primary"
                  :href="website.website"
                  target="_blank"
                  rel="noopener"
                  @click="trackEvent('workflow_link', { destination: 'source_export' })"
                >
                  {{ t("openWebsite", { website: website.name }) }}
                </a>
              </div>
            </template>

            <template v-else-if="website.system === 'ornitho.net'">
              <p class="mb-3">{{ t("importHelpOrnithoNet") }}</p>
              <div class="d-flex justify-content-center">
                <a
                  class="btn btn-primary"
                  :href="website.website"
                  target="_blank"
                  rel="noopener"
                  @click="trackEvent('workflow_link', { destination: 'source_export' })"
                >
                  {{ t("openExportPage", { website: website.name }) }}
                </a>
              </div>
            </template>
          </div>
        </div>

        <div class="col-lg-6">
          <div class="mb-3">
            <div class="feature-panel-eyebrow mb-1">{{ t("importStep", { n: 2 }) }}</div>
            <label class="form-label fw-semibold">{{ t(importFileLabelKey) }}</label>
            <div
              class="import-dropzone"
              :class="{ 'is-drag-active': isDragActive, 'is-compact': files }"
              role="button"
              tabindex="0"
              @click="openFilePicker"
              @keydown.enter.prevent="openFilePicker"
              @keydown.space.prevent="openFilePicker"
              @dragenter.prevent="onDragEnter"
              @dragover.prevent="onDragOver"
              @dragleave.prevent="onDragLeave"
              @drop.prevent="onFileDrop"
            >
              <input
                ref="fileInput"
                class="visually-hidden"
                type="file"
                :accept="website.system === 'observation' ? '.csv,.kml' : website.extension"
                :multiple="website.system === 'observation'"
                @change="onFileInputChange"
              />
              <div class="import-dropzone-body">
                <div class="import-dropzone-main">
                  <div class="import-dropzone-meta">
                    <i
                      class="bi bi-cloud-arrow-up import-dropzone-icon text-secondary"
                      aria-hidden="true"
                    ></i>
                    <div class="import-dropzone-text">
                      <div class="fw-semibold">
                        {{
                          t(
                            website.system === "observation"
                              ? "importDropzoneTitleMultiple"
                              : "importDropzoneTitle",
                          )
                        }}
                      </div>
                      <div class="small text-muted">
                        {{
                          t(
                            website.system === "observation"
                              ? "importDropzoneHintMultiple"
                              : "importDropzoneHint",
                          )
                        }}
                      </div>
                    </div>
                  </div>
                </div>
                <div v-if="files" class="small text-break import-dropzone-selected">
                  {{
                    t(
                      "importDropzoneSelected",
                      { name: files.map((item) => item.name).join(", ") },
                      files.length,
                    )
                  }}
                </div>
              </div>
            </div>
          </div>

          <div
            v-if="loadingStatus === 0"
            class="alert alert-warning d-flex align-items-center gap-2"
          >
            <div class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></div>
            <span>{{ t("loadingData") }}</span>
          </div>
          <div
            v-else-if="loadingStatus === 1"
            class="alert alert-success d-flex align-items-center gap-2"
          >
            <i class="bi bi-check-circle-fill flex-shrink-0" aria-hidden="true"></i>
            <span>{{ importSuccessText }}</span>
          </div>
          <div
            v-else-if="loadingStatus === -1"
            class="alert alert-danger d-flex align-items-center gap-2"
          >
            <i class="bi bi-exclamation-octagon-fill flex-shrink-0" aria-hidden="true"></i>
            <span
              ><strong>{{ t("error") }}.</strong> {{ errorMessage }}</span
            >
          </div>
          <div
            v-for="warning in skippedWarnings"
            :key="warning"
            class="alert alert-warning d-flex align-items-center gap-2"
          >
            <i class="bi bi-exclamation-triangle-fill flex-shrink-0" aria-hidden="true"></i>
            <span>{{ warning }}</span>
          </div>
          <div
            v-if="verificationWarning"
            class="alert alert-warning d-flex align-items-center gap-2"
          >
            <i class="bi bi-exclamation-triangle-fill flex-shrink-0" aria-hidden="true"></i>
            <span>{{ verificationWarning }}</span>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

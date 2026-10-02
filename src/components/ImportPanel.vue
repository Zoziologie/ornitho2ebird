<script setup>
import { computed, nextTick, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import Papa from "papaparse/papaparse.js";
import Wkt from "wicket/wicket.js";
import websitesList from "/data/websites_list.json";
import {
  buildSpeciesCommentTemplate,
  createSighting,
  distanceFromPath,
  mathMode,
} from "../lib/utils";
import { getOrnithoEbirdSpeciesCode, loadOrnithoSpeciesList } from "../lib/taxonomy";

const props = defineProps({
  selectedWebsiteName: {
    type: String,
    default: "",
  },
});

const emit = defineEmits(["import-data", "update:selectedWebsiteName"]);
const { t } = useI18n();

const precisionMatchOrnitho = {
  MINIMUM: ">",
  EXACT_VALUE: "=",
  ESTIMATION: "~",
  NO_VALUE: "",
};

const precisionMatchObservation = {
  "unknown": ">",
  "seen not counted": "",
  "real count": "=",
  "estimated": "~",
  "extrapolated": "~",
  "abundance": "~",
};

const loadingStatus = ref(null);
const numberImportedForms = ref(0);
const numberImportedSightings = ref(0);
const errorMessage = ref("");
const verificationWarning = ref("");
const skippedWarnings = ref([]);
const file = ref(null);
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
  file.value = null;
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
  }
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

// Error whose message is already translated and can be shown as is.
class ImportError extends Error {}

// Each entry is a column name, or a list of alternative names of which one must be present.
function requireColumns(rows, columns) {
  const header = Object.keys(rows[0] || {});
  const missing = columns
    .map((column) => (Array.isArray(column) ? column : [column]))
    .filter((alternatives) => !alternatives.some((name) => header.includes(name)))
    .map((alternatives) => alternatives.join(" / "));
  if (missing.length > 0) {
    throw new ImportError(t("importErrorMissingColumns", { columns: missing.join(", ") }));
  }
}

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

watch(file, async (nextFile) => {
  if (!nextFile || !website.value) {
    return;
  }

  numberImportedForms.value = 0;
  numberImportedSightings.value = 0;
  errorMessage.value = "";
  verificationWarning.value = "";
  skippedWarnings.value = [];
  loadingStatus.value = 0;

  try {
    const rawText = await nextFile.text();
    if (website.value.system === "ornitho") {
      await loadOrnithoSpeciesList();
    }
    const parsed = parseImportFile(rawText, website.value);
    parsed.website = {
      ...website.value,
      species_comment_template: buildSpeciesCommentTemplate(website.value),
    };

    skippedWarnings.value = [
      parsed.skipped.emptyForms > 0 ? t("importSkippedEmptyForms", parsed.skipped.emptyForms) : "",
      parsed.skipped.noCoordinates > 0 ? t("importSkippedNoCoordinates", parsed.skipped.noCoordinates) : "",
    ].filter(Boolean);
    verificationWarning.value = await checkWebsite(parsed, website.value);

    numberImportedForms.value = parsed.forms.length;
    numberImportedSightings.value = parsed.sightings.length;
    emit("import-data", parsed);
    loadingStatus.value = 1;
  } catch (error) {
    loadingStatus.value = -1;
    errorMessage.value =
      error instanceof ImportError
        ? error.message
        : t("importErrorUnexpected", { detail: error instanceof Error ? error.message : String(error) });
  }
});

function updateSelectedFile(nextFile) {
  file.value = nextFile || null;
}

function openFilePicker() {
  fileInput.value?.click();
}

function onFileInputChange(event) {
  updateSelectedFile(event.target.files?.[0]);
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
  updateSelectedFile(event.dataTransfer?.files?.[0]);
}

function formatOrnithoDetails(details) {
  if (!Array.isArray(details) || details.length === 0) {
    return "";
  }

  return details
    .map((detail) => {
      const count = String(detail.count || "x").trim();
      const sex = detail.sex?.["@id"] !== "U" ? String(detail.sex?.["#text"] || "").trim() : "";
      const age = detail.age?.["@id"] !== "U" ? String(detail.age?.["#text"] || "").trim() : "";
      return [`${count}x`, sex, age].filter(Boolean).join(" ").trim();
    })
    .filter(Boolean)
    .join(", ");
}

function ornithoSightingsTransformation(sightings, formId, selectedWebsite) {
  return sightings.map((sighting) => {
    const observer = sighting.observers[0];
    const datetime = observer.timing["@ISO8601"].split("+")[0];

    const baseComment = observer.comment || "";
    const detailsComment = formatOrnithoDetails(observer.details);
    const comment = baseComment && detailsComment
      ? `${baseComment} - ${detailsComment}`
      : baseComment || detailsComment;

    const speciesId = sighting.species["@id"];
    const commonName = sighting.species.name || "";

    return createSighting({
      id: observer.id_sighting,
      form_id: formId,
      website: selectedWebsite.name,
      source_website_name: selectedWebsite.name,
      source_record_url: `${selectedWebsite.website}index.php?m_id=54&id=${observer.id_sighting}`,
      system: selectedWebsite.system,
      permalink: `${selectedWebsite.website}index.php?m_id=54&id=${observer.id_sighting}`,
      date: datetime.split("T")[0],
      time: observer.timing["@notime"] === "1" ? "" : datetime.split("T")[1],
      lat: Number.parseFloat(observer.coord_lat),
      lon: Number.parseFloat(observer.coord_lon),
      location_name: sighting.place.name,
      common_name: commonName,
      scientific_name: sighting.species.latin_name || "",
      source_species_id: speciesId || "",
      ebird_species_code: getOrnithoEbirdSpeciesCode(speciesId),
      count: observer.estimation_code === "NO_VALUE" ? "x" : observer.count,
      count_precision: precisionMatchOrnitho[observer.estimation_code],
      atlas_code: observer.atlas_code?.["#text"] || "",
      auditory_contact: observer.auditory_contact,
      comment,
    });
  });
}

function parseImportFile(rawText, selectedWebsite) {
  const exportData = {
    forms: [],
    sightings: [],
    formsSightings: [],
    skipped: { emptyForms: 0, noCoordinates: 0 },
  };

  if (selectedWebsite.system === "ornitho") {
    let data;
    try {
      data = JSON.parse(rawText).data;
    } catch {
      throw new ImportError(t("importErrorInvalidJson"));
    }
    if (!data || typeof data !== "object") {
      throw new ImportError(t("importErrorInvalidJson"));
    }

    const allForms = data.forms || [];
    // A checklist without sightings has no date and nothing to import.
    data.forms = allForms.filter((form) => form.sightings?.length > 0);
    exportData.skipped.emptyForms = allForms.length - data.forms.length;
    data.sightings = data.sightings || [];

    exportData.sightings = ornithoSightingsTransformation(data.sightings, 0, selectedWebsite);
    exportData.forms = data.forms.map((form, index) => {
      const date = form.sightings[0].observers[0].timing["@ISO8601"].split("T")[0];
      const timeStart = `${date}T${form.time_start}`;
      const timeStop = `${date}T${form.time_stop}`;
      let duration = (new Date(timeStop) - new Date(timeStart)) / 1000 / 60;
      if (duration < 0) {
        // The checklist ended after midnight.
        duration += 24 * 60;
      }

      let path = null;
      let distance = null;
      if (form.protocol?.wkt) {
        const wkt = new Wkt.Wkt();
        wkt.read(form.protocol.wkt);
        path = wkt.toJson().coordinates.map((coordinate) => [coordinate[1], coordinate[0]]);
        if (path.length >= 2) {
          distance = distanceFromPath(path);
        } else {
          path = null;
          distance = null;
        }
      } else if (form.trace) {
        const wkt = new Wkt.Wkt();
        wkt.read(form.trace);
        if (wkt.toJson().coordinates[0]?.length === 2) {
          path = wkt.toJson().coordinates.map((coordinate) => [coordinate[1], coordinate[0]]);
          if (path.length >= 2) {
            distance = distanceFromPath(path);
          } else {
            path = null;
            distance = null;
          }
        } else {
          path = null;
          distance = null;
        }
      }

      return {
        id: index + 1,
        imported: true,
        location_name: mathMode(form.sightings.map((item) => item.place.name)),
        lat: form.lat,
        lon: form.lon,
        date,
        time: form.time_start,
        duration,
        distance,
        number_observer: null,
        full_form: form.full_form === "1",
        primary_purpose: true,
        checklist_comment: form.comment ? form.comment.replace(/\r\n/g, "<br>") : "",
        species_comment_template: buildSpeciesCommentTemplate(selectedWebsite),
        path,
      };
    });

    exportData.formsSightings = data.forms.map((form, index) => {
      return ornithoSightingsTransformation(form.sightings, index + 1, selectedWebsite);
    });
  } else if (selectedWebsite.system === "birdlasser") {
    const rows = Papa.parse(rawText, {
      skipEmptyLines: true,
      header: true,
    }).data;
    requireColumns(rows, ["Date", "Time", "Latitude", "Longitude", ["Species primary name", "Primary language"], "Count"]);

    exportData.sightings = rows.map((sighting, index) => {
      return createSighting({
        id: `s${index}`,
        form_id: 0,
        website: selectedWebsite.name,
        source_website_name: selectedWebsite.name,
        system: selectedWebsite.system,
        date: sighting.Date.replaceAll("/", "-"),
        time: sighting.Time,
        lat: Number.parseFloat(sighting.Latitude),
        lon: Number.parseFloat(sighting.Longitude),
        location_name:
          sighting.Pentad ||
          sighting.Fieldsheet ||
          `New location ${sighting.Latitude}-${sighting.Longitude}`,
        common_name: sighting["Species primary name"] || sighting["Primary language"],
        scientific_name: "",
        count: sighting.Count,
        count_precision: sighting["Count Type"] === "Not specified" ? "" : sighting["Count Type"],
        comment: sighting.Notes,
      });
    });
  } else if (selectedWebsite.system === "observation") {
    const rows = Papa.parse(rawText, {
      skipEmptyLines: true,
      header: true,
    }).data;
    requireColumns(rows, ["id", "date", "time", "lat", "lng", "species name", "number"]);

    exportData.sightings = rows.map((sighting) => {
      return createSighting({
        id: sighting.id,
        form_id: 0,
        website: selectedWebsite.name,
        source_website_name: selectedWebsite.name,
        source_record_url: `${selectedWebsite.website}observation/${sighting.id}`,
        system: selectedWebsite.system,
        permalink: `${selectedWebsite.website}observation/${sighting.id}`,
        date: sighting.date,
        time: sighting.time,
        lat: Number.parseFloat(sighting.lat),
        lon: Number.parseFloat(sighting.lng),
        location_name: sighting.location,
        common_name: sighting["species name"],
        scientific_name: "",
        count: sighting["counting method"] === "seen not counted" ? "x" : sighting.number,
        count_precision: precisionMatchObservation[sighting["counting method"]],
        comment: sighting.notes,
      });
    });
  } else if (selectedWebsite.system === "ornitho.net") {
    const parsed = Papa.parse(rawText, {
      skipEmptyLines: true,
      header: true,
    }).data;

    if (!parsed[0]?.Timing) {
      throw new ImportError(t("importErrorTxtHeader"));
    }

    exportData.sightings = parsed.map((sighting) => {
      const dateSplit = sighting.Date.split(".");
      return createSighting({
        id: sighting["Universal observation ID"],
        form_id: 0,
        website: selectedWebsite.name,
        source_website_name: selectedWebsite.name,
        system: selectedWebsite.system,
        date: `${dateSplit[2]}-${dateSplit[0]}-${dateSplit[1]}`,
        time: sighting.Timing,
        lat: Number.parseFloat(sighting["Latitude (N)"]),
        lon: Number.parseFloat(sighting["Longitude (E)"]),
        location_name: sighting.Site,
        common_name: sighting.Species,
        scientific_name: sighting["Latin name"],
        count: sighting.Estimation === "×" ? "x" : sighting.Number,
        count_precision: sighting.Estimation,
        comment: sighting.Comment,
      });
    });
  } else {
    throw new ImportError(t("importErrorUnsupported"));
  }

  // Without coordinates a sighting cannot be mapped or assigned to a checklist location.
  const hasCoordinates = (sighting) => Number.isFinite(sighting.lat) && Number.isFinite(sighting.lon);
  const sightingCount = exportData.sightings.length;
  exportData.sightings = exportData.sightings.filter(hasCoordinates);
  exportData.skipped.noCoordinates = sightingCount - exportData.sightings.length;

  const sortKey = (sighting) => `${sighting.date || ""} ${sighting.time || ""}`;
  exportData.sightings.sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
  return exportData;
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
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse.php?lat=${firstRecord.lat}&lon=${firstRecord.lon}&zoom=8&format=jsonv2&accept-language=en`,
    );
    const reverse = await response.json();

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
      <h2 class="border-bottom pb-2 mb-3">{{ t("importTitle") }}</h2>
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
                <a class="btn btn-primary" :href="exportLink" target="_blank" rel="noopener">
                  {{ t("openExportPage", { website: website.name }) }}
                </a>
              </div>
            </template>

            <template v-else-if="website.system === 'observation'">
              <p class="mb-3">{{ t("importHelpObservation") }}</p>
              <div class="d-flex justify-content-center">
                <a class="btn btn-primary" :href="website.website" target="_blank" rel="noopener">
                  {{ t("openWebsite", { website: website.name }) }}
                </a>
              </div>
            </template>

            <template v-else-if="website.system === 'birdlasser'">
              <p class="mb-3">{{ t("importHelpBirdlasser") }}</p>
              <div class="d-flex justify-content-center">
                <a class="btn btn-primary" :href="website.website" target="_blank" rel="noopener">
                  {{ t("openWebsite", { website: website.name }) }}
                </a>
              </div>
            </template>

            <template v-else-if="website.system === 'ornitho.net'">
              <p class="mb-3">{{ t("importHelpOrnithoNet") }}</p>
              <div class="d-flex justify-content-center">
                <a class="btn btn-primary" :href="website.website" target="_blank" rel="noopener">
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
              :class="{ 'is-drag-active': isDragActive, 'is-compact': file }"
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
                :accept="website.extension"
                @change="onFileInputChange"
              />
              <div class="import-dropzone-body">
                <div class="import-dropzone-main">
                  <div class="import-dropzone-meta">
                    <i class="bi bi-cloud-arrow-up import-dropzone-icon text-secondary" aria-hidden="true"></i>
                    <div class="import-dropzone-text">
                      <div class="fw-semibold">{{ t("importDropzoneTitle") }}</div>
                      <div class="small text-muted">{{ t("importDropzoneHint") }}</div>
                    </div>
                  </div>
                </div>
                <div v-if="file" class="small text-break import-dropzone-selected">
                  {{ t("importDropzoneSelected", { name: file.name }) }}
                </div>
              </div>
            </div>
          </div>

          <div v-if="loadingStatus === 0" class="alert alert-warning d-flex align-items-center gap-2">
            <div class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></div>
            <span>{{ t("loadingData") }}</span>
          </div>
          <div v-else-if="loadingStatus === 1" class="alert alert-success d-flex align-items-center gap-2">
            <i class="bi bi-check-circle-fill flex-shrink-0" aria-hidden="true"></i>
            <span>{{ importSuccessText }}</span>
          </div>
          <div v-else-if="loadingStatus === -1" class="alert alert-danger d-flex align-items-center gap-2">
            <i class="bi bi-exclamation-octagon-fill flex-shrink-0" aria-hidden="true"></i>
            <span><strong>{{ t("error") }}.</strong> {{ errorMessage }}</span>
          </div>
          <div
            v-for="warning in skippedWarnings"
            :key="warning"
            class="alert alert-warning d-flex align-items-center gap-2"
          >
            <i class="bi bi-exclamation-triangle-fill flex-shrink-0" aria-hidden="true"></i>
            <span>{{ warning }}</span>
          </div>
          <div v-if="verificationWarning" class="alert alert-warning d-flex align-items-center gap-2">
            <i class="bi bi-exclamation-triangle-fill flex-shrink-0" aria-hidden="true"></i>
            <span>{{ verificationWarning }}</span>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

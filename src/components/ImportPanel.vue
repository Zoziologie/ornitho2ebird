<script setup>
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import Papa from "papaparse/papaparse.js";
import Wkt from "wicket/wicket.js";
import websitesList from "/data/websites_list.json";
import ornithoSpeciesList from "/data/ornitho_species_list_short.json";
import {
  buildSpeciesCommentTemplate,
  copyClipboard,
  createSighting,
  distanceFromPath,
  mathMode,
} from "../lib/utils";

const props = defineProps({
  selectedEbirdLanguage: {
    type: String,
    required: true,
  },
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
const taxonomicIssues = ref([]);
const clipboardLabel = ref("copy");
const errorMessage = ref("");
const verificationWarning = ref("");
const file = ref(null);
const importQueryDate = ref("offset");
const importQueryDateOffset = ref(1);
const importQueryDateRangeFrom = ref("");
const importQueryDateRangeTo = ref("");
const taxonomyLookup = ref({ ...ornithoSpeciesList });

const websiteName = computed({
  get: () => props.selectedWebsiteName,
  set: (value) => emit("update:selectedWebsiteName", value),
});

const website = computed(() => {
  return websitesList.find((item) => item.name === websiteName.value) || null;
});

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

const taxonomicIssuesStringify = computed(() => {
  return JSON.stringify(
    taxonomicIssues.value.filter((issue) => issue.ebird_species_code.length > 0),
    null,
    2,
  );
});

const importSuccessText = computed(() => {
  const listCount = Number(numberImportedForms.value) || 0;
  const sightingCount = Number(numberImportedSightings.value) || 0;
  const listLabel = listCount === 1 ? "list" : "lists";
  const sightingLabel = sightingCount === 1 ? "incidental sighting" : "incidental sightings";

  return `Data loaded successfully: ${listCount} ${listLabel} and ${sightingCount} ${sightingLabel}`;
});

const exportLink = computed(() => {
  if (!website.value) {
    return "#";
  }

  const rangeFrom = importQueryDateRangeFrom.value
    ? new Date(importQueryDateRangeFrom.value).toLocaleDateString("fr-CH")
    : "";
  const rangeTo = importQueryDateRangeTo.value
    ? new Date(importQueryDateRangeTo.value).toLocaleDateString("fr-CH")
    : "";

  return `${website.value.website}index.php?m_id=31&sp_DChoice=${importQueryDate.value}&sp_DFrom=${rangeFrom}&sp_DTo=${rangeTo}&sp_DOffset=${importQueryDateOffset.value}&sp_SChoice=all&sp_PChoice=all&sp_OnlyMyData=1`;
});

watch(
  () => props.selectedEbirdLanguage,
  async (language) => {
    try {
      const response = await fetch(
        `https://api.ebird.org/v2/ref/taxonomy/ebird?key=vcs68p4j67pt&fmt=json&locale=${language}`,
      );
      const json = await response.json();
      taxonomyLookup.value = Object.fromEntries(
        Object.entries(ornithoSpeciesList).map(([id, speciesCode]) => {
          const found = json.find((entry) => entry.speciesCode === speciesCode);
          return [id, found ? found.comName : ""];
        }),
      );
    } catch {
      taxonomyLookup.value = { ...ornithoSpeciesList };
    }
  },
  { immediate: true },
);

watch(file, async (nextFile) => {
  if (!nextFile || !website.value) {
    return;
  }

  taxonomicIssues.value = [];
  numberImportedForms.value = 0;
  numberImportedSightings.value = 0;
  errorMessage.value = "";
  verificationWarning.value = "";
  clipboardLabel.value = "copy";
  loadingStatus.value = 0;

  try {
    const rawText = await nextFile.text();
    const parsed = parseImportFile(rawText, website.value);
    parsed.website = {
      ...website.value,
      species_comment_template: buildSpeciesCommentTemplate(website.value),
    };

    verificationWarning.value = await checkWebsite(parsed, website.value);

    numberImportedForms.value = parsed.forms.length;
    numberImportedSightings.value = parsed.sightings.length;
    emit("import-data", parsed);
    loadingStatus.value = 1;
  } catch (error) {
    loadingStatus.value = -1;
    errorMessage.value = error instanceof Error ? error.message : String(error);
  }
});

function ornithoSightingsTransformation(sightings, formId, selectedWebsite) {
  return sightings.map((sighting) => {
    const datetime = sighting.observers[0].timing["@ISO8601"].split("+")[0];

    let comment = sighting.observers[0].comment
      ? sighting.observers[0].comment.replace(/\r\n/g, "<br>")
      : "";

    if (sighting.observers[0].details) {
      comment += sighting.observers[0].details
        .map((detail) => {
          return (
            detail.count +
            "x " +
            (detail.sex["@id"] !== "U" ? `${detail.sex["#text"]} ` : "") +
            (detail.age["@id"] !== "U" ? `${detail.age["#text"]} ` : "")
          );
        })
        .join(", ");
    }

    let commonName = "";
    const speciesId = sighting.species["@id"];

    if (taxonomyLookup.value[speciesId]) {
      commonName = taxonomyLookup.value[speciesId];
    } else {
      commonName = sighting.species.name;
      if (!taxonomicIssues.value.find((issue) => issue.id === speciesId)) {
        taxonomicIssues.value.push({
          id: speciesId,
          ornitho_common: sighting.species.name,
          ornitho_latin: sighting.species.latin_name,
          ebird_species_code: "",
        });
      }
    }

    return createSighting({
      id: sighting.observers[0].id_sighting,
      form_id: formId,
      website: selectedWebsite.name,
      source_website_name: selectedWebsite.name,
      source_record_url: `${selectedWebsite.website}index.php?m_id=54&id=${sighting.observers[0].id_sighting}`,
      system: selectedWebsite.system,
      permalink: `${selectedWebsite.website}index.php?m_id=54&id=${sighting.observers[0].id_sighting}`,
      date: datetime.split("T")[0],
      time: sighting.observers[0].timing["@notime"] === "1" ? "" : datetime.split("T")[1],
      lat: Number.parseFloat(sighting.observers[0].coord_lat),
      lon: Number.parseFloat(sighting.observers[0].coord_lon),
      location_name: sighting.place.name,
      common_name: commonName,
      scientific_name: "",
      count:
        sighting.observers[0].estimation_code === "NO_VALUE" ? "x" : sighting.observers[0].count,
      count_precision: precisionMatchOrnitho[sighting.observers[0].estimation_code],
      comment,
    });
  });
}

function parseImportFile(rawText, selectedWebsite) {
  const exportData = {
    forms: [],
    sightings: [],
    formsSightings: [],
  };

  if (selectedWebsite.system === "ornitho") {
    let data;
    try {
      data = JSON.parse(rawText).data;
    } catch (error) {
      throw new Error(`Invalid JSON file. ${error}`);
    }

    data.forms = data.forms || [];
    data.sightings = data.sightings || [];

    exportData.sightings = ornithoSightingsTransformation(data.sightings, 0, selectedWebsite);
    exportData.forms = data.forms.map((form, index) => {
      const date = form.sightings[0].observers[0].timing["@ISO8601"].split("T")[0];
      const timeStart = `${date}T${form.time_start}`;
      const timeStop = `${date}T${form.time_stop}`;

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
        duration: (new Date(timeStop) - new Date(timeStart)) / 1000 / 60,
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
    exportData.sightings = Papa.parse(rawText, {
      skipEmptyLines: true,
      header: true,
    }).data.map((sighting, index) => {
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
    exportData.sightings = Papa.parse(rawText, {
      skipEmptyLines: true,
      header: true,
    }).data.map((sighting) => {
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
      throw new Error("The TXT header is not recognized. Export the file in English.");
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
    throw new Error("Unsupported import source");
  }

  exportData.sightings = exportData.sightings.sort((a, b) => a.time.localeCompare(b.time));
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

async function copyIssueBlock() {
  const payload = `\`\`\`\n${taxonomicIssuesStringify.value}\n\`\`\``;
  clipboardLabel.value = (await copyClipboard(payload)) ? "copied" : "failed";
}
</script>

<template>
  <section class="card border-0 shadow-sm rounded-3 mb-3">
    <div class="card-body p-3 p-md-4">
      <h2 class="border-bottom pb-2 mb-3">{{ t("importTitle") }}</h2>
      <div class="row g-4">
        <div class="col-lg-6">
          <div class="mb-3">
            <label class="form-label">{{ t("websiteSelect") }}</label>
            <select v-model="websiteName" class="form-select form-select-lg">
              <option v-for="entry in websitesList" :key="entry.name" :value="entry.name">
                {{ entry.name }}
              </option>
            </select>
          </div>

          <div v-if="website" class="mb-3">
            <label class="form-label">{{ t(importFileLabelKey) }}</label>
            <input
              class="form-control form-control-lg"
              type="file"
              :accept="website.extension"
              @change="file = $event.target.files?.[0] || null"
            />
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
          <div v-if="verificationWarning" class="alert alert-warning d-flex align-items-center gap-2">
            <i class="bi bi-exclamation-triangle-fill flex-shrink-0" aria-hidden="true"></i>
            <span>{{ verificationWarning }}</span>
          </div>
        </div>

        <div class="col-lg-6">
          <div v-if="website" class="feature-panel feature-panel-helper mb-0">
            <div class="feature-panel-header mb-3">
              <span class="feature-panel-icon" aria-hidden="true">
                <i class="bi bi-search"></i>
              </span>
              <div>
                <div class="feature-panel-eyebrow">{{ t("importTitle") }}</div>
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
                      :disabled="importQueryDate !== 'offset'"
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
                      :disabled="importQueryDate !== 'range'"
                    />
                  </div>
                  <div class="col-sm">
                    <input
                      v-model="importQueryDateRangeTo"
                      class="form-control"
                      type="date"
                      :disabled="importQueryDate !== 'range'"
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
                  {{ t("openExportPage", { website: website.name }) }}
                </a>
              </div>
            </template>

            <template v-else-if="website.system === 'birdlasser'">
              <p class="mb-3">{{ t("importHelpBirdlasser") }}</p>
              <div class="d-flex justify-content-center">
                <a class="btn btn-primary" :href="website.website" target="_blank" rel="noopener">
                  {{ t("openExportPage", { website: website.name }) }}
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
      </div>

      <div v-if="taxonomicIssues.length > 0" class="alert alert-warning mt-4 mb-0">
        <h4 class="alert-heading">{{ t("taxonomicIssueTitle") }}</h4>
        <p>{{ t("taxonomicIssueBody") }}</p>
        <p>
          <a href="https://ebird.org/map/" target="_blank" rel="noopener">{{ t("ebirdMap") }}</a>
        </p>
        <div class="row g-3">
          <div v-for="issue in taxonomicIssues" :key="issue.id" class="col-12">
            <div class="row g-2 align-items-center">
              <div class="col-md-6">
                <strong>{{ issue.ornitho_common }}</strong>
                <div>
                  <em>{{ issue.ornitho_latin }}</em>
                </div>
              </div>
              <div class="col-md-6">
                <input
                  v-model="issue.ebird_species_code"
                  class="form-control"
                  type="text"
                  :placeholder="t('speciesCodePrompt')"
                />
              </div>
            </div>
          </div>
        </div>
        <div v-if="taxonomicIssuesStringify.length > 6" class="mt-4">
          <textarea class="form-control mb-2" :value="taxonomicIssuesStringify" readonly rows="6" />
          <button class="btn btn-secondary" type="button" @click="copyIssueBlock">
            {{ t("copyIssueBlock") }} ({{ clipboardLabel }})
          </button>
        </div>
      </div>
    </div>
  </section>
</template>

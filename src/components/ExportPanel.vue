<script setup>
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import {
  checklistComment,
  buildSpeciesRows,
  formatDate,
  formatNumber,
  mathRound,
  normalizeLocationName,
  protocol,
} from "../lib/utils";
import { buildStaticMapUrl } from "../lib/staticMap";
import { buildInteractiveMapViewerUrl, createInteractiveMapGist } from "../lib/interactiveMap";
import { getCommonNameBySpeciesCode } from "../lib/taxonomy";

const props = defineProps({
  forms: {
    type: Array,
    required: true,
  },
  sightings: {
    type: Array,
    required: true,
  },
  formsSightings: {
    type: Array,
    required: true,
  },
  selectedEbirdLanguage: {
    type: String,
    required: true,
  },
  mapboxToken: {
    type: String,
    default: "",
  },
  githubToken: {
    type: String,
    default: "",
  },
  globalStaticMap: {
    type: Object,
    default: () => ({}),
  },
  speciesCommentTemplate: {
    type: Object,
    required: true,
  },
  customizedSpeciesComments: {
    type: Boolean,
    required: true,
  },
});
const emit = defineEmits(["open-settings-section"]);
const { t } = useI18n();
const DISTANCE_WARNING_THRESHOLD_KM = 20;
const DISTANCE_WARNING_LIST_LIMIT = 10;
const TAXONOMY_WARNING_LIST_LIMIT = 12;
const TAXONOMY_NEW_ISSUE_URL = "https://github.com/Zoziologie/ornitho2ebird/issues/new";
const TAXONOMY_REPORT_LABEL = "Taxonomy issue";
const EBIRD_MAP_URL = "https://ebird.org/map/";
const EBIRD_COMMENT_MAX_LENGTH = 8000;
const taxonomyCommonNameByCode = ref(new Map());
const taxonomyStatus = ref("idle");
const taxonomyReportCodeByIssue = ref({});
const exportFilename = ref(buildExportFilename());
const exportFilenameDraft = ref("");
const exportFilenameEditing = ref(false);
const interactiveMapPublishing = ref(false);
const interactiveMapError = ref("");
const interactiveMapStatusByFormId = ref({});
let taxonomyRequestId = 0;

const exportableForms = computed(() => {
  return props.forms
    .map((form) => ({ form, protocolState: protocol(form) }))
    .filter(({ form, protocolState }) => form.exportable && protocolState.name !== "Invalid");
});

const activeSpeciesCommentTemplate = computed(() => {
  return props.customizedSpeciesComments ? props.speciesCommentTemplate : null;
});

watch(
  () => props.selectedEbirdLanguage,
  async (language) => {
    const requestId = taxonomyRequestId + 1;
    taxonomyRequestId = requestId;
    taxonomyStatus.value = "loading";

    try {
      const commonNameByCode = await getCommonNameBySpeciesCode(language);
      if (requestId !== taxonomyRequestId) {
        return;
      }

      taxonomyCommonNameByCode.value = commonNameByCode;
      taxonomyStatus.value = "ready";
    } catch {
      if (requestId !== taxonomyRequestId) {
        return;
      }

      taxonomyCommonNameByCode.value = new Map();
      taxonomyStatus.value = "error";
    }
  },
  { immediate: true }
);

function taxonomyMatchedCommonName(sighting) {
  const speciesCode = sighting?.ebird_species_code || "";
  if (!speciesCode) {
    return sighting?.common_name || "";
  }

  return taxonomyCommonNameByCode.value.get(speciesCode) || sighting?.common_name || "";
}

const exportableSightingsByFormId = computed(() => {
  const formIds = new Set(exportableForms.value.map(({ form }) => form.id));
  const sightingsByFormId = new Map();

  const appendSighting = (sighting) => {
    if (!formIds.has(sighting.form_id)) {
      return;
    }

    const groupedSightings = sightingsByFormId.get(sighting.form_id) || [];
    groupedSightings.push(sighting);
    sightingsByFormId.set(sighting.form_id, groupedSightings);
  };

  props.sightings.forEach(appendSighting);
  props.formsSightings.forEach((formSightings) => formSightings.forEach(appendSighting));
  return sightingsByFormId;
});

const taxonomyNeededForExport = computed(() => {
  return [...exportableSightingsByFormId.value.values()].some((group) => {
    return group.some((sighting) => sighting.system === "ornitho");
  });
});

function escapeCsvValue(value) {
  const normalized = value ?? "";
  const stringValue = String(normalized).replace(/\r\n|\r|\n/g, " ");
  const escaped = stringValue.replaceAll('"', '""');
  return /[",]/.test(escaped) ? `"${escaped}"` : escaped;
}

function rowsToCsv(rows) {
  return rows
    .map((row) => {
      return Object.values(row)
        .map((value) => escapeCsvValue(value))
        .join(",");
    })
    .join("\n");
}

function buildExportFilename() {
  const now = new Date();
  const year = String(now.getFullYear());
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const seconds = String(now.getSeconds()).padStart(2, "0");

  return `ornitho2ebird_${year}${month}${day}_${hours}${minutes}${seconds}.csv`;
}

function normalizedExportFilename() {
  const rawValue = String(exportFilename.value || "").trim();
  if (!rawValue) {
    return buildExportFilename();
  }

  return rawValue.toLowerCase().endsWith(".csv") ? rawValue : `${rawValue}.csv`;
}

function startEditingExportFilename() {
  exportFilenameDraft.value = exportFilename.value;
  exportFilenameEditing.value = true;
}

function saveExportFilename() {
  exportFilename.value = String(exportFilenameDraft.value || "").trim() || buildExportFilename();
  exportFilenameEditing.value = false;
}

function cancelEditingExportFilename() {
  exportFilenameDraft.value = exportFilename.value;
  exportFilenameEditing.value = false;
}

function maxStaticMapUrlLengthForComment(form, sightings, importedWithText, interactiveMapUrl = "") {
  const commentWithoutMap = checklistComment(form, sightings, importedWithText, {
    staticMapUrl: "",
    interactiveMapUrl,
  });
  const placeholderUrl = "x";
  const commentWithPlaceholderMap = checklistComment(form, sightings, importedWithText, {
    staticMapUrl: placeholderUrl,
    interactiveMapUrl,
  });
  const staticMapWrapperLength = commentWithPlaceholderMap.length - commentWithoutMap.length - placeholderUrl.length;
  return Math.max(0, EBIRD_COMMENT_MAX_LENGTH - commentWithoutMap.length - staticMapWrapperLength);
}

const exportState = computed(() => {
  const errors = [];
  const sightingsByFormId = exportableSightingsByFormId.value;

  const rows = exportableForms.value.flatMap(({ form, protocolState }) => {
    const formSightings = sightingsByFormId.get(form.id) || [];
    const interactiveMapUrl =
      props.globalStaticMap?.interactive && form.interactive_map_url
        ? buildInteractiveMapViewerUrl(form.interactive_map_url)
        : "";
    const maxStaticMapUrlLength = maxStaticMapUrlLengthForComment(
      form,
      formSightings,
      t("importedWith"),
      interactiveMapUrl
    );
    const staticMapUrl =
      maxStaticMapUrlLength > 0
        ? buildStaticMapUrl({
            form,
            sightings: formSightings,
            token: props.mapboxToken,
            settings: props.globalStaticMap,
            width: 640,
            height: 420,
            maxUrlLength: maxStaticMapUrlLength,
          }).url
        : "";
    const mergedComment = checklistComment(form, formSightings, t("importedWith"), {
      staticMapUrl,
      interactiveMapUrl,
    });
    return buildSpeciesRows(formSightings, activeSpeciesCommentTemplate.value, taxonomyMatchedCommonName).map((speciesRow) => {
      const row = {
        common_name: speciesRow.common_name,
        Genus: "",
        Species: "",
        count: speciesRow.count,
        species_comment: speciesRow.species_comment,
        location_name: normalizeLocationName(form.location_name),
        latitude: form.lat ? Number.parseFloat(form.lat).toFixed(6) : "",
        longitude: form.lon ? Number.parseFloat(form.lon).toFixed(6) : "",
        date: formatDate(form.date, "/"),
        time: form.time ? form.time.substring(0, 5) : "",
        state: "",
        country: "",
        protocol: protocolState.name,
        number_observer: form.number_observer,
        Duration: Number(form.duration) > 0 ? form.duration : "",
        full_form: form.full_form ? "Y" : "N",
        distance: Number(form.distance) > 0 ? mathRound(Number(form.distance) * 0.621371, 3) : "",
        area_covered: "",
        checklist_comment: mergedComment,
      };

      if (!row.common_name) {
        errors.push(row);
      }
      if (row.count !== "X" && Number(row.count) > 999999) {
        errors.push(row);
      }
      if (row.count !== "X" && Number(row.count) < 0) {
        errors.push(row);
      }
      if ((row.species_comment || "").length > EBIRD_COMMENT_MAX_LENGTH) {
        errors.push(row);
      }
      if ((row.checklist_comment || "").length > EBIRD_COMMENT_MAX_LENGTH) {
        errors.push(row);
      }
      if (!row.date) {
        errors.push(row);
      }

      return row;
    });
  });

  if (errors.length > 0) {
    return {
      errors,
      rows,
      csv: "",
      filename: "",
    };
  }

  const csv = rowsToCsv(rows);
  const filename = normalizedExportFilename();

  return {
    errors,
    rows,
    csv,
    filename,
  };
});

const unmatchedTaxonomy = computed(() => {
  if (!taxonomyNeededForExport.value || taxonomyStatus.value !== "ready") {
    return [];
  }

  const issuesByKey = new Map();
  [...exportableSightingsByFormId.value.values()].forEach((group) => {
    group
      .filter((sighting) => sighting.system === "ornitho")
      .forEach((sighting) => {
        const speciesCode = sighting.ebird_species_code || "";
        const hasMatch = speciesCode && taxonomyCommonNameByCode.value.has(speciesCode);
        if (hasMatch) {
          return;
        }

        const speciesId = sighting.source_species_id || "";
        const key =
          speciesId ||
          speciesCode ||
          `name:${sighting.common_name || "?"}|scientific:${sighting.scientific_name || "?"}`;
        if (!issuesByKey.has(key)) {
          issuesByKey.set(key, {
            sourceName: sighting.common_name || "?",
            scientificName: sighting.scientific_name || "-",
            speciesId,
            speciesCode,
          });
        }
      });
  });

  return [...issuesByKey.values()].sort((left, right) => {
    if (left.sourceName !== right.sourceName) {
      return left.sourceName.localeCompare(right.sourceName);
    }
    return left.scientificName.localeCompare(right.scientificName);
  });
});

const displayedUnmatchedTaxonomy = computed(() => {
  return unmatchedTaxonomy.value.slice(0, TAXONOMY_WARNING_LIST_LIMIT);
});

const hiddenUnmatchedTaxonomyCount = computed(() => {
  return Math.max(0, unmatchedTaxonomy.value.length - displayedUnmatchedTaxonomy.value.length);
});

function taxonomyIssueKey(issue) {
  return `${issue.speciesId || issue.speciesCode || issue.sourceName}::${issue.scientificName}`;
}

const taxonomyReportRows = computed(() => {
  return unmatchedTaxonomy.value.map((issue) => ({
    ...issue,
    reportKey: taxonomyIssueKey(issue),
  }));
});

watch(unmatchedTaxonomy, (issues) => {
  const nextCodeByIssue = {};
  issues.forEach((issue) => {
    const key = taxonomyIssueKey(issue);
    nextCodeByIssue[key] = taxonomyReportCodeByIssue.value[key] || "";
  });
  taxonomyReportCodeByIssue.value = nextCodeByIssue;
}, { immediate: true });

watch(
  () => exportableForms.value.length,
  (count, previousCount) => {
    if (count > 0 && previousCount === 0 && !String(exportFilename.value || "").trim()) {
      exportFilename.value = buildExportFilename();
    }
  },
  { immediate: true }
);

const exportSummaryStats = computed(() => {
  const protocolCounts = new Map();

  exportableForms.value.forEach(({ protocolState }) => {
    protocolCounts.set(protocolState.name, (protocolCounts.get(protocolState.name) || 0) + 1);
  });

  const orderedProtocols = ["Traveling", "Stationary", "Historical", "Incidental"];
  const protocolItems = orderedProtocols
    .map((name) => ({
      name,
      count: protocolCounts.get(name) || 0,
    }))
    .filter((item) => item.count > 0);

  const totalSpecies = new Set(exportState.value.rows.map((row) => row.common_name).filter(Boolean)).size;
  const completeChecklists = exportableForms.value.filter(({ form }) => form.full_form).length;
  const completePercent = exportableForms.value.length
    ? Math.round((completeChecklists / exportableForms.value.length) * 100)
    : 0;
  const totalLocations = new Set(
    exportableForms.value.map(({ form }) => {
      const latitude = Number.isFinite(Number(form.lat)) ? Number(form.lat).toFixed(5) : "";
      const longitude = Number.isFinite(Number(form.lon)) ? Number(form.lon).toFixed(5) : "";
      return `${String(form.location_name || "").trim()}|${latitude}|${longitude}`;
    })
  ).size;

  return {
    protocolItems,
    totalChecklists: exportableForms.value.length,
    totalSpecies,
    totalSightings: exportState.value.rows.length,
    completeChecklists,
    completePercent,
    totalLocations,
  };
});

const distanceWarningForms = computed(() => {
  return exportableForms.value
    .map(({ form, protocolState }) => ({
      form,
      protocolState,
      distanceKm: Number(form.distance),
    }))
    .filter(({ distanceKm }) => Number.isFinite(distanceKm) && distanceKm > DISTANCE_WARNING_THRESHOLD_KM)
    .sort((left, right) => right.distanceKm - left.distanceKm);
});

const displayedDistanceWarningForms = computed(() => {
  return distanceWarningForms.value.slice(0, DISTANCE_WARNING_LIST_LIMIT);
});

const hiddenDistanceWarningCount = computed(() => {
  return Math.max(0, distanceWarningForms.value.length - displayedDistanceWarningForms.value.length);
});

function protocolSummaryIcon(name) {
  return (
    {
      Traveling: "bi-sign-turn-right",
      Stationary: "bi-pin-map",
      Historical: "bi-clock-history",
      Incidental: "bi-lightning-charge",
    }[name] || "bi-list-check"
  );
}

function openCustomizedMode() {
  emit("open-settings-section", "advanced-options");
}

function updateTaxonomyReportCode(reportKey, rawValue) {
  taxonomyReportCodeByIssue.value[reportKey] = String(rawValue || "").trim();
}

const taxonomyReportTemplate = computed(() => {
  if (!taxonomyReportRows.value.length) {
    return "";
  }

  const normalizeCell = (value) => String(value || "").replaceAll("|", "\\|");
  const lines = taxonomyReportRows.value.map((issue) => {
    const ebirdCode = taxonomyReportCodeByIssue.value[issue.reportKey] || "";
    return `| ${normalizeCell(issue.speciesId || "?")} | ${normalizeCell(issue.sourceName)} | ${normalizeCell(issue.scientificName)} | ${normalizeCell(ebirdCode)} |`;
  });

  return [
    "| ornitho_id | ornitho_common_name | ornitho_scientific_name | ebird_species_code |",
    "| --- | --- | --- | --- |",
    ...lines,
  ].join("\n");
});

const githubReportUrl = computed(() => {
  const params = new URLSearchParams({
    title: t("exportTaxonomyReportIssueTitle", { count: taxonomyReportRows.value.length }),
    body: taxonomyReportTemplate.value,
    labels: TAXONOMY_REPORT_LABEL,
  });
  return `${TAXONOMY_NEW_ISSUE_URL}?${params.toString()}`;
});

function openTaxonomyIssue() {
  window.open(githubReportUrl.value, "_blank", "noopener");
}

function hasInteractiveMapCoordinates(form, sightings) {
  const hasSightingCoordinates = sightings.some((sighting) => {
    return Number.isFinite(Number(sighting.lat)) && Number.isFinite(Number(sighting.lon));
  });
  const hasPathCoordinates = Array.isArray(form?.path) && form.path.length > 1;
  return hasSightingCoordinates || hasPathCoordinates;
}

async function publishInteractiveMapsForExport() {
  if (!props.globalStaticMap?.interactive) {
    return true;
  }

  const token = String(props.githubToken || "").trim();
  if (!token) {
    interactiveMapError.value = t("interactiveMapTokenMissing");
    window.alert(interactiveMapError.value);
    return false;
  }

  const sightingsByFormId = exportableSightingsByFormId.value;
  const pendingForms = exportableForms.value
    .map(({ form }) => ({ form, sightings: sightingsByFormId.get(form.id) || [] }))
    .filter(({ form, sightings }) => !form.interactive_map_url && hasInteractiveMapCoordinates(form, sightings));

  if (!pendingForms.length) {
    return true;
  }

  interactiveMapPublishing.value = true;
  interactiveMapError.value = "";

  try {
    for (const { form, sightings } of pendingForms) {
      interactiveMapStatusByFormId.value = {
        ...interactiveMapStatusByFormId.value,
        [form.id]: "publishing",
      };

      const result = await createInteractiveMapGist({
        form,
        sightings,
        speciesCommentTemplate: activeSpeciesCommentTemplate.value,
        token,
      });

      form.interactive_map_url = result.rawUrl;
      interactiveMapStatusByFormId.value = {
        ...interactiveMapStatusByFormId.value,
        [form.id]: "ready",
      };
    }
    return true;
  } catch (error) {
    interactiveMapError.value = t("interactiveMapPublishFailed", {
      message: error?.message || "Unknown error",
    });
    window.alert(interactiveMapError.value);
    return false;
  } finally {
    interactiveMapPublishing.value = false;
  }
}

async function downloadFile() {
  if (!exportState.value.csv) {
    return;
  }

  if (taxonomyNeededForExport.value && taxonomyStatus.value === "loading") {
    window.alert(t("exportTaxonomyLoading"));
    return;
  }

  const interactiveMapsReady = await publishInteractiveMapsForExport();
  if (!interactiveMapsReady || !exportState.value.csv) {
    return;
  }

  const blob = new Blob(["\ufeff", exportState.value.csv], { type: "text/csv" });
  const link = document.createElement("a");
  const objectUrl = URL.createObjectURL(blob);
  link.href = objectUrl;
  link.download = normalizedExportFilename();
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(objectUrl);
}
</script>

<template>
  <section class="card border-0 shadow-sm rounded-3 mb-3">
    <div class="card-body p-3 p-md-4">
      <h2 class="border-bottom pb-2 mb-3">{{ t("exportTitle") }}</h2>
      <div v-if="exportableForms.length === 0" class="alert alert-secondary mb-0">
        {{ t("notReady") }}
      </div>

      <div v-else>
        <div v-if="taxonomyNeededForExport && taxonomyStatus === 'loading'" class="alert alert-secondary mb-3">
          <div class="d-flex align-items-center gap-2">
            <div class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></div>
            <span>{{ t("exportTaxonomyLoading") }}</span>
          </div>
        </div>
        <div v-else-if="taxonomyNeededForExport && taxonomyStatus === 'error'" class="alert alert-warning mb-3">
          {{ t("exportTaxonomyLoadFailed") }}
        </div>
        <div v-if="globalStaticMap.interactive && interactiveMapPublishing" class="alert alert-secondary mb-3">
          <div class="d-flex align-items-center gap-2">
            <div class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></div>
            <span>{{ t("interactiveMapPublishing") }}</span>
          </div>
        </div>
        <div v-else-if="globalStaticMap.interactive && interactiveMapError" class="alert alert-warning mb-3">
          {{ interactiveMapError }}
        </div>
        <div v-else-if="unmatchedTaxonomy.length > 0" class="alert alert-warning export-warning-box mb-3">
          <h4 class="alert-heading h6 mb-2 d-flex align-items-center gap-2 export-warning-title">
            <span class="export-warning-icon" aria-hidden="true">
              <i class="bi bi-exclamation-triangle-fill"></i>
            </span>
            <span>{{ t("exportTaxonomyWarningTitle") }}</span>
          </h4>
          <p class="mb-2">{{ t("exportTaxonomyWarningBody") }}</p>
          <ul class="list-unstyled mb-2 export-warning-list">
            <li
              v-for="issue in displayedUnmatchedTaxonomy"
              :key="`${issue.speciesId || issue.speciesCode || issue.sourceName}-${issue.scientificName}`"
              class="export-warning-item"
            >
              <div>
                <div class="fw-semibold">{{ issue.sourceName }}</div>
                <div class="small text-muted fst-italic">{{ issue.scientificName }}</div>
              </div>
            </li>
            <li v-if="hiddenUnmatchedTaxonomyCount > 0" class="small text-muted">
              {{ t("exportTaxonomyWarningMore", { count: hiddenUnmatchedTaxonomyCount }) }}
            </li>
          </ul>
          <p class="mb-0">{{ t("exportTaxonomyWarningContinue") }}</p>
          <details class="mt-2">
            <summary class="small fw-semibold export-report-summary">
              {{ t("exportTaxonomyReportSummary") }}
            </summary>
            <div class="mt-2 small">
              <p class="mb-2">{{ t("exportTaxonomyReportBody") }}</p>
              <ol class="ps-3 mb-2">
                <li>
                  {{ t("exportTaxonomyReportStepMapPrefix") }}
                  <a :href="EBIRD_MAP_URL" target="_blank" rel="noopener">eBird Map</a>
                  {{ t("exportTaxonomyReportStepMapSuffix") }}
                </li>
                <li>
                  {{ t("exportTaxonomyReportStepFillTable") }}
                  <div class="table-responsive mt-2">
                    <table class="table table-sm table-striped align-middle mb-0">
                      <thead>
                        <tr>
                          <th>{{ t("exportTaxonomyReportTableOrnithoId") }}</th>
                          <th>{{ t("exportTaxonomyReportTableEbirdCode") }}</th>
                          <th>{{ t("exportTaxonomyReportTableCommonName") }}</th>
                          <th>{{ t("exportTaxonomyReportTableScientificName") }}</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr v-for="issue in taxonomyReportRows" :key="issue.reportKey">
                          <td><code>{{ issue.speciesId || "?" }}</code></td>
                          <td>
                            <input
                              class="form-control form-control-sm"
                              :class="
                                (taxonomyReportCodeByIssue[issue.reportKey] || '').trim()
                                  ? 'is-valid'
                                  : 'is-invalid'
                              "
                              :value="taxonomyReportCodeByIssue[issue.reportKey] || ''"
                              :placeholder="t('speciesCodePrompt')"
                              @input="updateTaxonomyReportCode(issue.reportKey, $event.target.value)"
                            />
                          </td>
                          <td>{{ issue.sourceName }}</td>
                          <td><em>{{ issue.scientificName }}</em></td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </li>
                <li>
                  {{ t("exportTaxonomyReportStepIssuePrefix") }}
                  <button class="btn btn-outline-danger btn-sm ms-1" type="button" @click="openTaxonomyIssue">
                    {{ t("exportTaxonomyReportCreateIssueAll") }}
                  </button>{{ t("exportTaxonomyReportStepIssueSuffix") }}
                </li>
              </ol>
            </div>
          </details>
        </div>
        <div v-if="distanceWarningForms.length > 0" class="alert alert-warning export-warning-box mb-3">
          <h4 class="alert-heading h6 mb-2 d-flex align-items-center gap-2 export-warning-title">
            <span class="export-warning-icon" aria-hidden="true">
              <i class="bi bi-sign-turn-right-fill"></i>
            </span>
            {{ t("exportDistanceWarningTitle") }}
          </h4>
          <p class="mb-2">
            {{ t("exportDistanceWarningBodyPrefix") }}
            {{ " " }}
            <button class="btn btn-link btn-sm p-0 align-baseline" type="button" @click="openCustomizedMode">
              {{ t("advancedModeCustomTitle") }}
            </button>
            :
          </p>
          <ul class="list-unstyled mb-2 export-warning-list">
            <li
              v-for="{ form, distanceKm } in displayedDistanceWarningForms"
              :key="`distance-${form.id}`"
              class="export-warning-item"
            >
              <div>
                <div class="fw-semibold">{{ t("exportDistanceWarningChecklist", { id: form.id }) }}</div>
                <div class="small text-muted">{{ form.date || "-" }} · {{ form.location_name || "-" }}</div>
              </div>
              <span class="badge rounded-pill text-bg-danger export-warning-distance">
                {{ mathRound(distanceKm, 2) }} km
              </span>
            </li>
            <li v-if="hiddenDistanceWarningCount > 0" class="small text-muted">
              {{ t("exportDistanceWarningMore", { count: hiddenDistanceWarningCount }) }}
            </li>
          </ul>
        </div>

        <div class="export-overview mb-3">
          <section class="export-panel export-panel-protocol">
            <div class="export-panel-eyebrow">{{ t("exportPanelProtocols") }}</div>
            <div class="export-total">
              <span class="export-total-value">{{ formatNumber(exportSummaryStats.totalChecklists) }}</span>
              <span class="export-total-label">{{ t("exportSummaryChecklists") }}</span>
            </div>
            <div class="export-protocol-list">
              <div
                v-for="item in exportSummaryStats.protocolItems"
                :key="item.name"
                class="export-protocol-item"
              >
                <span class="export-protocol-icon">
                  <i :class="['bi', protocolSummaryIcon(item.name)]" aria-hidden="true"></i>
                </span>
                <span class="export-protocol-count">{{ formatNumber(item.count) }}</span>
                <span class="export-protocol-label">{{ t(`protocolLabel${item.name}`) }}</span>
              </div>
            </div>
          </section>

          <section class="export-panel export-panel-stats">
            <div class="export-panel-eyebrow">{{ t("exportPanelSnapshot") }}</div>
            <div class="export-stat-grid">
              <div class="export-stat-tile">
                <span class="export-stat-icon"><i class="bi bi-feather" aria-hidden="true"></i></span>
                <span class="export-stat-value">{{ formatNumber(exportSummaryStats.totalSpecies) }}</span>
                <span class="export-stat-label">{{ t("exportSummarySpecies") }}</span>
              </div>
              <div class="export-stat-tile">
                <span class="export-stat-icon"><i class="bi bi-binoculars" aria-hidden="true"></i></span>
                <span class="export-stat-value">{{ formatNumber(exportSummaryStats.totalSightings) }}</span>
                <span class="export-stat-label">{{ t("exportSummarySightings") }}</span>
              </div>
              <div class="export-stat-tile">
                <span class="export-stat-icon"><i class="bi bi-check2-square" aria-hidden="true"></i></span>
                <span class="export-stat-value">{{ exportSummaryStats.completePercent }}%</span>
                <span class="export-stat-label">{{ t("exportSummaryComplete") }}</span>
              </div>
              <div class="export-stat-tile">
                <span class="export-stat-icon"><i class="bi bi-geo-alt" aria-hidden="true"></i></span>
                <span class="export-stat-value">{{ formatNumber(exportSummaryStats.totalLocations) }}</span>
                <span class="export-stat-label">{{ t("exportSummaryLocations") }}</span>
              </div>
            </div>
          </section>

          <section class="export-panel export-panel-action">
            <div class="export-panel-eyebrow">{{ t("exportPanelAction") }}</div>
            <div class="export-action-icon" aria-hidden="true">
              <i class="bi bi-file-earmark-arrow-down"></i>
            </div>
            <div class="export-filename-field">
              <div class="export-filename-row">
                <template v-if="exportFilenameEditing">
                  <input
                    id="export-filename"
                    v-model="exportFilenameDraft"
                    type="text"
                    class="form-control form-control-sm export-filename-input"
                    :placeholder="t('exportFilenamePlaceholder')"
                    spellcheck="false"
                    autocapitalize="off"
                    autocomplete="off"
                    @keydown.enter.prevent="saveExportFilename"
                    @keydown.esc.prevent="cancelEditingExportFilename"
                  />
                  <button
                    class="btn btn-outline-secondary btn-sm"
                    type="button"
                    :aria-label="t('save')"
                    :title="t('save')"
                    @click="saveExportFilename"
                  >
                    <i class="bi bi-check-lg" aria-hidden="true"></i>
                  </button>
                  <button
                    class="btn btn-link btn-sm export-filename-edit"
                    type="button"
                    :aria-label="t('cancel')"
                    :title="t('cancel')"
                    @click="cancelEditingExportFilename"
                  >
                    <i class="bi bi-x-lg" aria-hidden="true"></i>
                  </button>
                </template>
                <template v-else>
                  <div class="export-filename">{{ normalizedExportFilename() }}</div>
                  <button
                    class="btn btn-link btn-sm export-filename-edit"
                    type="button"
                    :aria-label="t('edit')"
                    :title="t('edit')"
                    @click="startEditingExportFilename"
                  >
                    <i class="bi bi-pen" aria-hidden="true"></i>
                  </button>
                </template>
              </div>
            </div>
            <button
              class="btn btn-primary btn-lg export-download-btn"
              type="button"
              :disabled="
                interactiveMapPublishing ||
                exportState.errors.length > 0 ||
                (taxonomyNeededForExport && taxonomyStatus === 'loading')
              "
              @click="downloadFile"
            >
              {{ interactiveMapPublishing ? t("interactiveMapPublishing") : t("downloadCsv") }}
            </button>
          </section>
        </div>

        <div v-if="exportState.errors.length > 0" class="alert alert-danger">
          <p>{{ t("exportErrors") }}</p>
          <div class="table-responsive">
            <table class="table table-sm table-striped mb-0">
              <thead>
                <tr>
                  <th>Species</th>
                  <th>Date</th>
                  <th>Comment length</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(row, index) in exportState.errors" :key="`${row.common_name}-${index}`">
                  <td>{{ row.common_name || "Missing species" }}</td>
                  <td>{{ row.date || "Missing date" }}</td>
                  <td>{{ Math.max((row.species_comment || "").length, (row.checklist_comment || "").length) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div v-else>
          <section class="feature-panel feature-panel-guide mb-0">
            <div class="feature-panel-header mb-3">
              <span class="feature-panel-icon" aria-hidden="true">
                <i class="bi bi-signpost-split"></i>
              </span>
              <div>
                <div class="feature-panel-eyebrow">{{ t("exportTitle") }}</div>
                <h5 class="mb-0">{{ t("finalStepsTitle") }}</h5>
              </div>
            </div>
            <p>
              {{ t("finalStepsImportPrefix") }}
              <a href="https://ebird.org/ebird/import/upload.form?theme=ebird" target="_blank" rel="noopener">
                {{ t("finalStepsImportLink") }}
              </a>,
              {{ t("finalStepsImportMiddle") }}
              <strong>{{ t("openEbirdImport") }}</strong>
              ,
              {{ t("finalStepsImportSuffix") }}
            </p>
            <p>
              {{ t("finalStepsProcessingPrefix") }}
              <a
                href="https://github.com/Zoziologie/biolovision2ebird/wiki/FAQ#long-processing-time"
                target="_blank"
                rel="noopener"
              >
                {{ t("finalStepsProcessingLink") }}
              </a>,
              {{ t("finalStepsProcessingMiddle") }}
              <a
                href="https://support.ebird.org/en/support/solutions/articles/48000907878-upload-spreadsheet-data-to-ebird#anchorCleanData"
                target="_blank"
                rel="noopener"
              >
                {{ t("finalStepsSpeciesLink") }}
              </a>
              {{ t("finalStepsProcessingSuffix") }}
            </p>
            <p class="mb-0">
              {{ t("finalStepsReviewPrefix") }}
              <a href="https://ebird.org/import/status/all.htm" target="_blank" rel="noopener">
                {{ t("finalStepsReviewLink") }}
              </a>
              {{ t("finalStepsReviewSuffix") }}
            </p>
          </section>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed, ref, shallowRef, watch } from "vue";
import { useI18n } from "vue-i18n";
import {
  checklistReview,
  formatNumber,
  isExportableSighting,
  mortalityStatus,
  mathRound,
} from "../lib/utils";
import {
  buildExportRows,
  exportableFormsOf,
  groupSightingsByForm,
  rowsToCsv,
} from "../lib/exportCsv";
import { getAnalytics, trackEvent } from "../lib/analytics";
import { alertDialog, confirmDialog } from "../lib/dialog";
import LinkedText from "./LinkedText.vue";
import { store } from "../lib/store";
import { createInteractiveMapGist } from "../lib/interactiveMap";
import {
  MANUAL_MATCH_TAXA,
  bundledEbirdTaxa,
  cachedEbirdTaxa,
  getEbirdTaxa,
  loadScientificNameIndex,
} from "../lib/taxonomy";

const props = defineProps({
  matchingHotspots: { type: Boolean, default: false },
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
  personalizedSpeciesComments: {
    type: Boolean,
    default: false,
  },
  advancedEnabled: {
    type: Boolean,
    default: false,
  },
  autoAssignDuration: {
    type: Number,
    default: 0,
  },
  autoAssignDistance: {
    type: Number,
    default: 0,
  },
});
const emit = defineEmits(["open-settings-section"]);
const { t } = useI18n();
const DISTANCE_WARNING_THRESHOLD_KM = 20;
const DISTANCE_WARNING_LIST_LIMIT = 10;
const TAXONOMY_WARNING_LIST_LIMIT = 12;
// eBird species code → taxon, for the codes in the export. Always replaced as a whole.
const taxonByCode = shallowRef(new Map());
const taxonomyStatus = ref("idle");
const exportFilename = ref(buildExportFilename());
const exportFilenameDraft = ref("");
const exportFilenameEditing = ref(false);
const interactiveMapPublishing = ref(false);
const interactiveMapError = ref("");
const interactiveMapStatusByFormId = ref({});
let taxonomyRequestId = 0;

const exportableForms = computed(() => exportableFormsOf(props.forms));

const activeSpeciesCommentTemplate = computed(() => {
  return props.customizedSpeciesComments ? props.speciesCommentTemplate : null;
});

const exportableSightingsByFormId = computed(() =>
  groupSightingsByForm(exportableForms.value, props.sightings, props.formsSightings),
);

const dateReviews = computed(() =>
  exportableForms.value
    .map(({ form }) => ({
      form,
      ...checklistReview(form, exportableSightingsByFormId.value.get(form.id) || []),
    }))
    .filter((review) => review.dateWarning),
);
const excludedSightings = computed(() =>
  [...exportableSightingsByFormId.value.values()]
    .flat()
    .filter((sighting) => !isExportableSighting(sighting)),
);
const uncertainMortality = computed(() =>
  [...exportableSightingsByFormId.value.values()]
    .flat()
    .filter(
      (sighting) => isExportableSighting(sighting) && mortalityStatus(sighting) === "unknown",
    ),
);

async function splitChecklist(formId) {
  if (await confirmDialog(t("splitDatesConfirm"))) store.splitFormByDate(formId);
}

const exportSpeciesCodes = computed(() => {
  const codes = new Set();
  exportableSightingsByFormId.value.forEach((group) => {
    group.filter(isExportableSighting).forEach((sighting) => {
      if (sighting.ebird_species_code) {
        codes.add(sighting.ebird_species_code);
      }
    });
  });
  return [...codes].sort();
});

// Only the scientific names go into the CSV, so the locale does not matter.
const TAXONOMY_LOCALE = "en";

async function loadTaxonomy() {
  const language = TAXONOMY_LOCALE;
  const codes = exportSpeciesCodes.value;
  const requestId = taxonomyRequestId + 1;
  taxonomyRequestId = requestId;

  // Avoid a "loading" flash when only cached codes are needed (e.g. a checklist toggled back on).
  const cached = cachedEbirdTaxa(language, codes);
  if (cached) {
    taxonByCode.value = cached;
    taxonomyStatus.value = "ready";
    return;
  }

  taxonomyStatus.value = "loading";
  try {
    const taxa = await getEbirdTaxa(language, codes);
    if (requestId !== taxonomyRequestId) {
      return;
    }

    taxonByCode.value = taxa;
    taxonomyStatus.value = "ready";
  } catch (error) {
    if (requestId !== taxonomyRequestId) {
      return;
    }

    console.warn("Could not load the eBird taxonomy, using the bundled names", error);
    try {
      await loadScientificNameIndex();
      if (requestId !== taxonomyRequestId) {
        return;
      }
      taxonByCode.value = bundledEbirdTaxa(codes);
      taxonomyStatus.value = "ready";
    } catch (bundledError) {
      if (requestId !== taxonomyRequestId) {
        return;
      }
      console.warn("Could not load the bundled eBird names", bundledError);
      taxonByCode.value = new Map();
      taxonomyStatus.value = "error";
    }
  }
}

watch(() => exportSpeciesCodes.value.join(), loadTaxonomy, { immediate: true });

function taxonomyScientificName(sighting) {
  return taxonByCode.value.get(sighting?.ebird_species_code)?.sciName || "";
}

function taxonomyMatchedCommonName(sighting) {
  const speciesCode = sighting?.ebird_species_code || "";
  if (!speciesCode) {
    return sighting?.common_name || "";
  }

  return taxonByCode.value.get(speciesCode)?.comName || sighting?.common_name || "";
}

const taxonomyNeededForExport = computed(() => exportSpeciesCodes.value.length > 0);

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

const exportState = computed(() => {
  const { rows, errors } = buildExportRows({
    exportableForms: exportableForms.value,
    sightingsByFormId: exportableSightingsByFormId.value,
    speciesCommentTemplate: activeSpeciesCommentTemplate.value,
    commonNameForSighting: taxonomyMatchedCommonName,
    scientificNameForSighting: taxonomyScientificName,
    importedWithText: t("importedWith"),
    mapboxToken: props.mapboxToken,
    globalStaticMap: props.globalStaticMap,
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

// Species eBird's importer will not match on its own, so the user matches them once on its
// "Fix species" page (eBird remembers the match): the two names it cannot resolve (see
// MANUAL_MATCH_TAXA), and sightings without an eBird taxon, which keep their source name.
const speciesToMatchOnce = computed(() => {
  if (!taxonomyNeededForExport.value || taxonomyStatus.value !== "ready") {
    return [];
  }

  const byName = new Map();
  exportableSightingsByFormId.value.forEach((group) => {
    group.filter(isExportableSighting).forEach((sighting) => {
      const code = sighting.ebird_species_code;
      if (code in MANUAL_MATCH_TAXA && taxonByCode.value.has(code)) {
        const { sciName, comName } = MANUAL_MATCH_TAXA[code];
        byName.set(sciName, { name: sciName, hint: comName, scientific: true });
      } else if (!taxonByCode.value.has(code)) {
        const name = sighting.common_name || sighting.scientific_name || "?";
        byName.set(name, { name, hint: "", scientific: !sighting.common_name });
      }
    });
  });
  return [...byName.values()].sort((left, right) => left.name.localeCompare(right.name));
});

const displayedSpeciesToMatchOnce = computed(() =>
  speciesToMatchOnce.value.slice(0, TAXONOMY_WARNING_LIST_LIMIT),
);

watch(
  () => exportableForms.value.length,
  (count, previousCount) => {
    if (count > 0 && previousCount === 0 && !String(exportFilename.value || "").trim()) {
      exportFilename.value = buildExportFilename();
    }
  },
  { immediate: true },
);

const exportSummaryStats = computed(() => {
  const includedForms = exportableForms.value.filter(({ form }) =>
    (exportableSightingsByFormId.value.get(form.id) || []).some(isExportableSighting),
  );
  const protocolCounts = new Map();

  includedForms.forEach(({ protocolState }) => {
    protocolCounts.set(protocolState.name, (protocolCounts.get(protocolState.name) || 0) + 1);
  });

  const orderedProtocols = ["Traveling", "Stationary", "Historical", "Incidental"];
  const protocolItems = orderedProtocols
    .map((name) => ({
      name,
      count: protocolCounts.get(name) || 0,
    }))
    .filter((item) => item.count > 0);

  const totalSpecies = new Set(
    exportState.value.rows
      .map((row) => row.common_name || `${row.Genus} ${row.Species}`.trim())
      .filter(Boolean),
  ).size;
  const completeChecklists = includedForms.filter(
    ({ form }) => form.primary_purpose && form.full_form,
  ).length;
  const completePercent = includedForms.length
    ? Math.round((completeChecklists / includedForms.length) * 100)
    : 0;
  const totalLocations = new Set(
    includedForms.map(({ form }) => {
      const latitude = Number.isFinite(Number(form.lat)) ? Number(form.lat).toFixed(5) : "";
      const longitude = Number.isFinite(Number(form.lon)) ? Number(form.lon).toFixed(5) : "";
      return `${String(form.location_name || "").trim()}|${latitude}|${longitude}`;
    }),
  ).size;

  return {
    protocolItems,
    totalChecklists: includedForms.length,
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
    .filter(
      ({ distanceKm }) => Number.isFinite(distanceKm) && distanceKm > DISTANCE_WARNING_THRESHOLD_KM,
    )
    .sort((left, right) => right.distanceKm - left.distanceKm);
});

const displayedDistanceWarningForms = computed(() => {
  return distanceWarningForms.value.slice(0, DISTANCE_WARNING_LIST_LIMIT);
});

const hiddenDistanceWarningCount = computed(() => {
  return Math.max(
    0,
    distanceWarningForms.value.length - displayedDistanceWarningForms.value.length,
  );
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

// What Basic mode decided on its own, which users would otherwise only discover in eBird.
const basicModeSummary = computed(() => {
  const createdForms = exportableForms.value.filter(({ form }) => !form.imported);
  const createdSightings = createdForms.reduce(
    (total, { form }) => total + (exportableSightingsByFormId.value.get(form.id)?.length || 0),
    0,
  );
  return { createdChecklists: createdForms.length, createdSightings };
});

function openCustomizedMode() {
  emit("open-settings-section", "advanced-options");
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
    alertDialog(interactiveMapError.value);
    return false;
  }

  const sightingsByFormId = exportableSightingsByFormId.value;
  const pendingForms = exportableForms.value
    .map(({ form }) => ({ form, sightings: sightingsByFormId.get(form.id) || [] }))
    .filter(
      ({ form, sightings }) =>
        form.include_static_map !== false &&
        !form.interactive_map_url &&
        hasInteractiveMapCoordinates(form, sightings),
    );

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

      store.updateForm(form.id, { interactive_map_url: result.rawUrl });
      interactiveMapStatusByFormId.value = {
        ...interactiveMapStatusByFormId.value,
        [form.id]: "ready",
      };
    }
    trackEvent("publish_maps", { outcome: "success" });
    return true;
  } catch (error) {
    trackEvent("publish_maps", { outcome: "failure" });
    interactiveMapError.value = t("interactiveMapPublishFailed", {
      message: error?.message || "Unknown error",
    });
    alertDialog(interactiveMapError.value);
    return false;
  } finally {
    interactiveMapPublishing.value = false;
  }
}

const exportReadiness = computed(() =>
  !exportState.value.rows.length
    ? "no_checklists"
    : taxonomyNeededForExport.value && taxonomyStatus.value === "loading"
      ? "loading_taxonomy"
      : exportState.value.errors.length
        ? "invalid_checklists"
        : "ready",
);
watch(
  [exportReadiness, () => getAnalytics().state.choice],
  ([readiness]) => trackEvent("export_state", { readiness }),
  { immediate: true },
);

async function downloadFile() {
  if (!exportState.value.csv || props.matchingHotspots) {
    return;
  }

  if (taxonomyNeededForExport.value && taxonomyStatus.value === "loading") {
    alertDialog(t("exportTaxonomyLoading"));
    return;
  }

  const warnings = [
    ...dateReviews.value.map(({ form }) =>
      t("exportDateWarning", { name: `${form.id}. ${form.location_name}`, date: form.date }),
    ),
    excludedSightings.value.length
      ? t("exportExcludedWarning", { count: excludedSightings.value.length })
      : "",
    uncertainMortality.value.length
      ? t("exportMortalityWarning", { count: uncertainMortality.value.length })
      : "",
  ].filter(Boolean);
  if (
    warnings.length &&
    !(await confirmDialog(`${warnings.join("\n\n")}\n\n${t("exportWarningsConfirm")}`))
  )
    return;

  const interactiveMapsReady = await publishInteractiveMapsForExport();
  if (!interactiveMapsReady || !exportState.value.csv) {
    trackEvent("export_csv", {
      mode: props.advancedEnabled ? "customized" : "basic",
      outcome: "blocked",
    });
    return;
  }

  // eBird reads a UTF-8 BOM as a one-character common name in the first empty cell.
  const blob = new Blob([exportState.value.csv], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  const objectUrl = URL.createObjectURL(blob);
  link.href = objectUrl;
  link.download = normalizedExportFilename();
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(objectUrl);
  trackEvent("export_csv", {
    mode: props.advancedEnabled ? "customized" : "basic",
    outcome: "success",
    comment_mode: !props.customizedSpeciesComments
      ? "disabled"
      : props.personalizedSpeciesComments
        ? "personalized"
        : "options",
    has_species_comments: exportState.value.rows.some((row) => row.species_comment.trim())
      ? "yes"
      : "no",
  });
}
</script>

<template>
  <section class="card border-0 shadow-sm rounded-3 mb-3">
    <div class="card-body p-3 p-md-4">
      <h2 v-analytics-view="'export'" class="border-bottom pb-2 mb-3">{{ t("exportTitle") }}</h2>
      <div v-if="exportableForms.length === 0" class="alert alert-secondary mb-0">
        {{ t("notReady") }}
      </div>

      <div v-else>
        <p v-if="!exportState.rows.length" class="alert alert-secondary">
          {{ t("noEligibleRecords") }}
        </p>
        <div v-for="review in dateReviews" :key="review.form.id" class="alert alert-warning">
          <p>
            {{
              t("exportDateWarning", {
                name: `${review.form.id}. ${review.form.location_name}`,
                date: review.form.date,
              })
            }}
          </p>
          <button
            v-if="review.canSplit"
            type="button"
            class="btn btn-sm btn-outline-dark"
            @click="splitChecklist(review.form.id)"
          >
            {{ t("splitByDate") }}
          </button>
          <p v-else class="small mb-0">{{ t("splitDatesUnavailable") }}</p>
        </div>
        <div
          v-if="excludedSightings.length || uncertainMortality.length"
          class="alert alert-warning"
        >
          <p v-if="excludedSightings.length">
            {{ t("exportExcludedWarning", { count: excludedSightings.length }) }}
          </p>
          <p v-if="uncertainMortality.length">
            {{ t("exportMortalityWarning", { count: uncertainMortality.length }) }}
          </p>
          <ul class="mb-0">
            <li
              v-for="sighting in [...excludedSightings, ...uncertainMortality]"
              :key="`${sighting.form_id}-${sighting.id}`"
            >
              <a
                v-if="sighting.source_record_url"
                :href="sighting.source_record_url"
                target="_blank"
                rel="noopener"
                >{{ sighting.common_name }}</a
              >
              <span v-else>{{ sighting.common_name }}</span>
              — {{ sighting.date }}, {{ sighting.count }}
              <span v-if="sighting.extended_info?.mortality?.comment">
                — {{ sighting.extended_info.mortality.comment }}</span
              >
            </li>
          </ul>
        </div>
        <div
          v-if="taxonomyNeededForExport && taxonomyStatus === 'loading'"
          class="alert alert-secondary mb-3"
        >
          <div class="d-flex align-items-center gap-2">
            <div class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></div>
            <span>{{ t("exportTaxonomyLoading") }}</span>
          </div>
        </div>
        <div
          v-else-if="taxonomyNeededForExport && taxonomyStatus === 'error'"
          class="alert alert-warning mb-3 d-flex flex-wrap align-items-center gap-2"
        >
          <span class="me-auto">{{ t("exportTaxonomyLoadFailed") }}</span>
          <button type="button" class="btn btn-sm btn-outline-dark" @click="loadTaxonomy()">
            <i class="bi bi-arrow-clockwise me-1" aria-hidden="true"></i>{{ t("retry") }}
          </button>
        </div>
        <div
          v-if="globalStaticMap.interactive && interactiveMapPublishing"
          class="alert alert-secondary mb-3"
        >
          <div class="d-flex align-items-center gap-2">
            <div class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></div>
            <span>{{ t("interactiveMapPublishing") }}</span>
          </div>
        </div>
        <div
          v-else-if="globalStaticMap.interactive && interactiveMapError"
          class="alert alert-warning mb-3"
        >
          {{ interactiveMapError }}
        </div>
        <div
          v-if="distanceWarningForms.length > 0"
          class="alert alert-warning export-warning-box mb-3"
        >
          <h4 class="alert-heading h6 mb-2 d-flex align-items-center gap-2 export-warning-title">
            <span class="export-warning-icon" aria-hidden="true">
              <i class="bi bi-sign-turn-right-fill"></i>
            </span>
            {{ t("exportDistanceWarningTitle") }}
          </h4>
          <p class="mb-2">
            {{ t("exportDistanceWarningBodyPrefix") }}
            {{ " " }}
            <button
              class="btn btn-link btn-sm p-0 align-baseline"
              type="button"
              @click="openCustomizedMode"
            >
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
                <div class="fw-semibold">
                  {{ t("exportDistanceWarningChecklist", { id: form.id }) }}
                </div>
                <div class="small text-muted">
                  {{ form.date || "-" }} · {{ form.location_name || "-" }}
                </div>
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
              <span class="export-total-value">{{
                formatNumber(exportSummaryStats.totalChecklists)
              }}</span>
              <span class="export-total-label">{{
                t("exportSummaryChecklists", exportSummaryStats.totalChecklists)
              }}</span>
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
                <span class="export-protocol-label">{{
                  t(`protocolLabel${item.name}`, item.count)
                }}</span>
                <span
                  v-if="item.name === 'Incidental' && basicModeSummary.createdChecklists > 0"
                  class="export-protocol-note"
                >
                  {{
                    t(
                      "exportIncidentalNote",
                      {
                        sightings: formatNumber(basicModeSummary.createdSightings),
                        hours: autoAssignDuration,
                        km: autoAssignDistance,
                      },
                      basicModeSummary.createdSightings,
                    )
                  }}
                  ·
                  <button
                    class="btn btn-link btn-sm p-0 align-baseline"
                    type="button"
                    @click="emit('open-settings-section', 'aggregation')"
                  >
                    {{ t("exportBasicChangeGrouping") }}
                  </button>
                </span>
                <span v-else-if="item.name === 'Historical'" class="export-protocol-note">
                  <LinkedText :text="t('exportHistoricalNote')" :links="['#help/conversion']" />
                </span>
              </div>
            </div>
            <button
              v-if="!advancedEnabled"
              class="btn btn-link btn-sm p-0 align-self-start export-protocol-review"
              type="button"
              @click="openCustomizedMode"
            >
              {{ t("exportBasicReview") }}
            </button>
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
                matchingHotspots ||
                exportState.errors.length > 0 ||
                (taxonomyNeededForExport && taxonomyStatus === 'loading')
              "
              @click="downloadFile"
            >
              {{ interactiveMapPublishing ? t("interactiveMapPublishing") : t("downloadCsv") }}
            </button>
            <p class="export-snapshot small mb-0">
              {{ formatNumber(exportSummaryStats.totalSpecies) }}
              {{ t("exportSummarySpecies", exportSummaryStats.totalSpecies) }} ·
              {{ formatNumber(exportSummaryStats.totalSightings) }}
              {{ t("exportSummarySightings", exportSummaryStats.totalSightings) }} ·
              {{ formatNumber(exportSummaryStats.totalLocations) }}
              {{ t("exportSummaryLocations", exportSummaryStats.totalLocations) }} ·
              {{ exportSummaryStats.completePercent }}% {{ t("exportSummaryComplete") }}
            </p>
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
                  <td>
                    {{
                      Math.max(
                        (row.species_comment || "").length,
                        (row.checklist_comment || "").length,
                      )
                    }}
                  </td>
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
                <h5 v-analytics-view="'next_steps'" class="mb-0">{{ t("finalStepsTitle") }}</h5>
              </div>
            </div>
            <ol class="final-steps-list mb-2">
              <li>
                {{ t("finalStepsImportPrefix") }}
                <a
                  href="https://ebird.org/ebird/import/upload.form?theme=ebird"
                  target="_blank"
                  rel="noopener"
                  @click="trackEvent('workflow_link', { destination: 'ebird_import' })"
                >
                  {{ t("finalStepsImportLink") }} </a
                >,
                {{ t("finalStepsImportMiddle") }}
                <strong>{{ t("openEbirdImport") }}</strong
                >,
                {{ t("finalStepsImportSuffix") }}
                <div v-if="speciesToMatchOnce.length > 0" class="small mt-1">
                  {{ t("exportManualMatchNote") }}
                  <ul class="mb-0">
                    <li v-for="species in displayedSpeciesToMatchOnce" :key="species.name">
                      <i v-if="species.scientific">{{ species.name }}</i
                      ><template v-else>{{ species.name }}</template
                      ><template v-if="species.hint"> → {{ species.hint }}</template>
                    </li>
                    <li v-if="speciesToMatchOnce.length > displayedSpeciesToMatchOnce.length">
                      {{
                        t("exportTaxonomyWarningMore", {
                          count: speciesToMatchOnce.length - displayedSpeciesToMatchOnce.length,
                        })
                      }}
                    </li>
                  </ul>
                </div>
              </li>
              <li>
                {{ t("finalStepsProcessingPrefix") }}
                <a href="#help/processing">{{ t("finalStepsProcessingLink") }}</a
                >,
                {{ t("finalStepsProcessingMiddle") }}
              </li>
              <li>
                {{ t("finalStepsReviewPrefix") }}
                <a
                  href="https://ebird.org/import/status/all.htm"
                  target="_blank"
                  rel="noopener"
                  @click="trackEvent('workflow_link', { destination: 'ebird_status' })"
                >
                  {{ t("finalStepsReviewLink") }}
                </a>
                {{ t("finalStepsReviewSuffix") }}
              </li>
            </ol>
            <p class="mb-0 small">
              <LinkedText :text="t('finalStepsFaq')" :links="['#help/faq']" />
            </p>
          </section>
        </div>
      </div>
    </div>
  </section>
</template>

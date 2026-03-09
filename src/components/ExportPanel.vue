<script setup>
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { checklistComment, formatDate, formatNumber, mathRound, protocol, speciesComment } from "../lib/utils";

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
  speciesCommentTemplate: {
    type: Object,
    required: true,
  },
  customizedSpeciesComments: {
    type: Boolean,
    required: true,
  },
});
const { t } = useI18n();

const exportableForms = computed(() => {
  return props.forms
    .map((form) => ({ form, protocolState: protocol(form) }))
    .filter(({ form, protocolState }) => form.exportable && protocolState.name !== "Invalid");
});

const activeSpeciesCommentTemplate = computed(() => {
  return props.customizedSpeciesComments ? props.speciesCommentTemplate : null;
});

function escapeCsvValue(value) {
  const normalized = value ?? "";
  const stringValue = String(normalized);
  const escaped = stringValue.replaceAll('"', '""');
  return /[",\n\r]/.test(escaped) ? `"${escaped}"` : escaped;
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

const exportState = computed(() => {
  const errors = [];
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

  const rows = exportableForms.value.flatMap(({ form, protocolState }) => {
    const formSightings = sightingsByFormId.get(form.id) || [];
    const mergedComment = checklistComment(form, formSightings, t("importedWith"));
    const speciesGroups = new Map();

    formSightings.forEach((sighting) => {
      const key = sighting.common_name || "";
      const groupedSightings = speciesGroups.get(key) || [];
      groupedSightings.push(sighting);
      speciesGroups.set(key, groupedSightings);
    });

    return [...speciesGroups.values()].map((duplicates) => {
      let numericCount = 0;
      let hasNonNumericCount = false;

      duplicates.forEach((sighting) => {
        const parsedCount = Number.parseInt(sighting.count, 10);
        if (Number.isNaN(parsedCount)) {
          hasNonNumericCount = true;
          return;
        }

        numericCount += parsedCount;
      });

      const count = hasNonNumericCount ? "X" : numericCount;
      const row = {
        common_name: duplicates[0]?.common_name || "",
        Genus: "",
        Species: "",
        count,
        species_comment: speciesComment(activeSpeciesCommentTemplate.value, duplicates),
        location_name: form.location_name,
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
      if ((row.species_comment || "").length > 8000) {
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
  const filename = buildExportFilename();

  return {
    errors,
    rows,
    csv,
    filename,
  };
});

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

function downloadFile() {
  if (!exportState.value.csv) {
    return;
  }

  const blob = new Blob(["\ufeff", exportState.value.csv], { type: "text/csv" });
  const link = document.createElement("a");
  const objectUrl = URL.createObjectURL(blob);
  link.href = objectUrl;
  link.download = exportState.value.filename;
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
            <div class="export-action-title">
              {{ t(exportState.errors.length === 0 ? "exportReady" : "exportBlocked") }}
            </div>
            <button
              class="btn btn-primary btn-lg export-download-btn"
              type="button"
              :disabled="exportState.errors.length > 0"
              @click="downloadFile"
            >
              {{ t("downloadCsv") }}
            </button>
            <div class="export-filename">{{ exportState.filename || "ornitho2ebird.csv" }}</div>
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
                  <td>{{ (row.species_comment || "").length }}</td>
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
              </a>
              {{ t("finalStepsImportMiddle") }}
              <strong>{{ t("openEbirdImport") }}</strong>
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
              </a>
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

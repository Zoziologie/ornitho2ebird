<script setup>
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { checklistComment, formatDate, mathRound, protocol, speciesComment } from "../lib/utils";

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

const formsExportable = computed(() => {
  return props.forms.filter((form) => form.exportable && protocol(form).name !== "Invalid");
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

const exportState = computed(() => {
  const errors = [];
  const formIds = formsExportable.value.map((form) => form.id);
  const allSightings = [
    ...props.sightings.filter((sighting) => formIds.includes(sighting.form_id)),
    ...props.formsSightings.flat().filter((sighting) => formIds.includes(sighting.form_id)),
  ];

  const rows = formsExportable.value
    .map((form) => {
      const filteredSightings = allSightings.filter((sighting) => sighting.form_id === form.id);
      const mergedComment = checklistComment(
        form,
        filteredSightings,
        t("importedWith")
      );

      return Array.from(new Set(filteredSightings.map((sighting) => sighting.common_name))).map((species) => {
        const duplicates = filteredSightings.filter((sighting) => sighting.common_name === species);
        let count = duplicates.reduce((accumulator, sighting) => {
          return Number.parseInt(accumulator, 10) + Number.parseInt(sighting.count, 10);
        }, 0);

        if (Number.isNaN(count)) {
          count = "X";
        }

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
          protocol: protocol(form).name,
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
    })
    .flat();

  if (errors.length > 0) {
    return {
      errors,
      rows,
      csv: "",
      filename: "",
    };
  }

  const csv = rowsToCsv(rows);
  const filename = `ornitho2ebird_${formsExportable.value.length}checklists_${rows.length}records.csv`;

  return {
    errors,
    rows,
    csv,
    filename,
  };
});

function downloadFile() {
  if (!exportState.value.csv) {
    return;
  }

  const blob = new Blob(["\ufeff", exportState.value.csv], { type: "text/csv" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = exportState.value.filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
</script>

<template>
  <section class="card border-0 shadow-sm rounded-3 mb-3">
    <div class="card-body p-3 p-md-4">
      <h2 class="border-bottom pb-2 mb-3">{{ t("exportTitle") }}</h2>
      <div v-if="formsExportable.length === 0" class="alert alert-secondary mb-0">
        {{ t("notReady") }}
      </div>

      <div v-else>
        <div class="alert alert-secondary">
          {{ t("exportReady", { ready: formsExportable.length, total: forms.length }) }}
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

        <div v-else class="d-flex flex-column flex-md-row gap-2 mb-3">
          <button class="btn btn-primary" type="button" @click="downloadFile">
            {{ t("downloadCsv") }}
          </button>
          <a
            class="btn btn-secondary"
            href="https://ebird.org/import/upload.form"
            target="_blank"
            rel="noopener"
          >
            {{ t("openEbirdImport") }}
          </a>
        </div>

        <p>{{ t("finalSteps") }}</p>
      </div>
    </div>
  </section>
</template>

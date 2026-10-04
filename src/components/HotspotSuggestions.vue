<script setup>
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { rankHotspots } from "../lib/hotspotMatching";

const props = defineProps({
  form: { type: Object, required: true },
  evidence: { type: Object, required: true },
  loading: { type: Boolean, default: false },
  failed: { type: Boolean, default: false },
  reporting: { type: Boolean, default: false },
});
const emit = defineEmits(["use-hotspot", "restore", "retry", "report"]);
const { t, n } = useI18n();
const ranking = computed(() => rankHotspots(props.evidence, props.form.hotspots || []));
</script>

<template>
  <article class="border rounded p-3 mt-3">
    <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-2">
      <h3 class="h6 mb-0">{{ t("hotspotSuggestionsTitle") }}</h3>
      <button
        class="btn btn-outline-secondary btn-sm"
        :disabled="reporting"
        @click="emit('report')"
      >
        {{ t(reporting ? "hotspotReportLoading" : "hotspotReportDownload") }}
      </button>
    </div>
    <p class="small text-muted mb-2">{{ t("hotspotSuggestionsHelp") }}</p>
    <p v-if="loading" class="small mb-0" role="status">{{ t("hotspotSuggestionsLoading") }}</p>
    <div v-else-if="failed" class="small" role="alert">
      {{ t("hotspotSuggestionsFailed") }}
      <button class="btn btn-link btn-sm" @click="emit('retry')">
        {{ t("hotspotSuggestionsRetry") }}
      </button>
    </div>
    <template v-else>
      <p class="small mb-2" role="status">{{ t(`hotspotStatus${ranking.status}`) }}</p>
      <p v-if="evidence.points.length" class="small text-muted mb-2">
        {{ t(`hotspotSource${evidence.source}`, { count: evidence.count }) }}
        <template v-if="ranking.margin !== null && ranking.candidates.length > 1">
          {{ t("hotspotScoreMargin", { margin: n(ranking.margin, { maximumFractionDigits: 1 }) }) }}
        </template>
      </p>
      <div v-if="ranking.candidates.length" class="table-responsive">
        <table class="table table-sm align-middle small mb-0">
          <thead>
            <tr>
              <th>{{ t("locationName") }}</th>
              <th>{{ t("hotspotScore") }}</th>
              <th>{{ t("hotspotFit") }}</th>
              <th>{{ t("hotspotDistances") }}</th>
              <th>
                <span class="visually-hidden">{{ t("useHotspotLocation") }}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="candidate in ranking.candidates.slice(0, 5)" :key="candidate.hotspot.locId">
              <td>
                <a
                  :href="`https://ebird.org/hotspot/${candidate.hotspot.locId}`"
                  target="_blank"
                  rel="noopener"
                >
                  {{ candidate.hotspot.locName }}
                </a>
              </td>
              <td>{{ n(candidate.score, { maximumFractionDigits: 1 }) }}/100</td>
              <td>{{ t(`hotspotFit${candidate.interpretation}`) }}</td>
              <td>
                {{
                  t("hotspotDistanceSummary", {
                    median: n(candidate.medianDistance, { maximumFractionDigits: 2 }),
                    upper: n(candidate.upperDistance, { maximumFractionDigits: 2 }),
                  })
                }}
              </td>
              <td>
                <button
                  class="btn btn-outline-primary btn-sm"
                  :disabled="form.hotspot_id === candidate.hotspot.locId"
                  @click="emit('use-hotspot', candidate.hotspot)"
                >
                  {{ t("useHotspotLocation") }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
    <button
      v-if="form.location_before_hotspot"
      class="btn btn-outline-secondary btn-sm mt-2"
      @click="emit('restore')"
    >
      {{ t("hotspotRestoreLocation") }}
    </button>
  </article>
</template>

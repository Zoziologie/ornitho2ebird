<script setup>
import { useI18n } from "vue-i18n";
import { getAnalytics } from "../lib/analytics";

defineProps({ preferences: { type: Boolean, default: false } });
const { t } = useI18n();
const analytics = getAnalytics();
</script>

<template>
  <section
    v-if="preferences || !analytics.state.choice"
    class="card border-0 bg-light p-3"
    :aria-label="t('analyticsTitle')"
  >
    <h3 class="h6">{{ t("analyticsTitle") }}</h3>
    <p class="small mb-2">{{ t("analyticsSummary") }}</p>
    <p v-if="preferences" class="small mb-2">
      {{ t(analytics.state.choice === "accepted" ? "analyticsAccepted" : "analyticsRejected") }}
    </p>
    <details class="small mb-3">
      <summary>{{ t("analyticsDetails") }}</summary>
      <p class="mt-2 mb-1">{{ t("analyticsNotice") }}</p>
      <a href="https://policies.google.com/privacy" target="_blank" rel="noopener">{{
        t("analyticsGooglePrivacy")
      }}</a>
    </details>
    <div class="d-flex flex-wrap gap-2">
      <button
        type="button"
        class="btn btn-outline-secondary btn-sm"
        @click="analytics.choose('accepted')"
      >
        {{ t("analyticsAccept") }}
      </button>
      <button
        type="button"
        class="btn btn-outline-secondary btn-sm"
        @click="analytics.choose('rejected')"
      >
        {{ t("analyticsReject") }}
      </button>
    </div>
  </section>
</template>

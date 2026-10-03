<script setup>
import { nextTick, ref } from "vue";
import { useI18n } from "vue-i18n";
import { getAnalytics } from "../lib/analytics";

defineProps({ preferences: { type: Boolean, default: false } });
const { t } = useI18n();
const analytics = getAnalytics();
const reopened = ref(false);
const heading = ref(null);
const launcher = ref(null);

async function openPreferences() {
  reopened.value = true;
  await nextTick();
  heading.value.focus();
}

async function choose(choice, preferences) {
  analytics.choose(choice);
  reopened.value = false;
  if (!preferences) {
    await nextTick();
    launcher.value.focus();
  }
}

async function closePreferences() {
  reopened.value = false;
  await nextTick();
  launcher.value.focus();
}
</script>

<template>
  <Teleport to="body" :disabled="preferences">
    <section
      v-if="preferences || !analytics.state.choice || reopened"
      :class="preferences ? 'card border-0 bg-light p-3' : 'analytics-box p-3'"
      :aria-label="t('analyticsTitle')"
      @keydown.esc="reopened && closePreferences()"
    >
      <div class="d-flex align-items-start justify-content-between gap-2 mb-2">
        <h3 ref="heading" class="h6 mb-0" tabindex="-1">
          {{ t(preferences ? "analyticsTitle" : "analyticsConsentTitle") }}
        </h3>
        <button
          v-if="reopened"
          type="button"
          class="btn-close"
          :aria-label="t('close')"
          @click="closePreferences"
        />
      </div>
      <p class="small mb-2">{{ t("analyticsSummary") }}</p>
      <p class="small text-secondary mb-2">{{ t("analyticsReassurance") }}</p>
      <p v-if="preferences || reopened" class="small mb-2">
        {{ t(analytics.state.choice === "accepted" ? "analyticsAccepted" : "analyticsRejected") }}
      </p>
      <details class="small mb-3">
        <summary>{{ t("analyticsDetails") }}</summary>
        <p class="mt-2 mb-1">{{ t("analyticsNotice") }}</p>
        <a href="https://policies.google.com/privacy" target="_blank" rel="noopener">{{
          t("analyticsGooglePrivacy")
        }}</a>
      </details>
      <div class="analytics-choices">
        <button
          type="button"
          class="btn btn-outline-secondary btn-sm"
          @click="choose('accepted', preferences)"
        >
          {{ t("analyticsAccept") }}
        </button>
        <button
          type="button"
          class="btn btn-outline-secondary btn-sm"
          @click="choose('rejected', preferences)"
        >
          {{ t("analyticsReject") }}
        </button>
      </div>
    </section>
    <button
      v-else
      ref="launcher"
      type="button"
      class="analytics-launcher btn btn-light btn-sm"
      :aria-expanded="false"
      @click="openPreferences"
    >
      <i class="bi bi-cookie me-1" aria-hidden="true"></i>
      {{ t("analyticsPreferences") }}
    </button>
  </Teleport>
</template>

<style scoped>
.analytics-box,
.analytics-launcher {
  position: fixed;
  left: 1rem;
  bottom: 1rem;
  z-index: 1040;
  border: 1px solid var(--bs-border-color);
  background: var(--bs-body-bg);
  color: var(--bs-body-color);
  box-shadow: 0 0.25rem 1rem #0002;
}
.analytics-box {
  width: min(24rem, calc(100vw - 2rem));
  max-height: calc(100dvh - 2rem);
  overflow: auto;
  border-radius: 0.75rem;
}
.analytics-box h3:focus {
  outline: none;
}
.analytics-launcher {
  border-radius: 0.5rem;
}
.analytics-choices {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
}
@media (max-width: 420px) {
  .analytics-choices {
    grid-template-columns: 1fr;
  }
}
</style>

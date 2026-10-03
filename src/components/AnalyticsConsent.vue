<script setup>
import { nextTick, onBeforeUnmount, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { getAnalytics } from "../lib/analytics";

const props = defineProps({ preferences: { type: Boolean, default: false } });
const { t } = useI18n();
const analytics = getAnalytics();
const panel = ref(null);
const heading = ref(null);
let previousOverflow;

function keepFocus(event) {
  if (props.preferences || event.key !== "Tab") return;
  const controls = [...panel.value.querySelectorAll("summary, a, button")].filter(
    (element) => element.getClientRects().length,
  );
  if (event.shiftKey && [heading.value, controls[0]].includes(document.activeElement)) {
    event.preventDefault();
    controls.at(-1).focus();
  } else if (!event.shiftKey && document.activeElement === controls.at(-1)) {
    event.preventDefault();
    controls[0].focus();
  }
}

watch(
  () => analytics.state.choice,
  async (choice) => {
    if (props.preferences) return;
    await nextTick();
    if (!choice) {
      previousOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      panel.value.showModal();
      heading.value.focus();
    } else {
      panel.value.close();
      if (previousOverflow !== undefined) document.body.style.overflow = previousOverflow;
    }
  },
  { immediate: true },
);
onBeforeUnmount(() => {
  if (!props.preferences && previousOverflow !== undefined)
    document.body.style.overflow = previousOverflow;
});
</script>

<template>
  <Teleport to="body" :disabled="preferences">
    <component
      :is="preferences ? 'section' : 'dialog'"
      ref="panel"
      :class="preferences ? 'card border-0 bg-light p-3' : 'analytics-dialog p-4'"
      :aria-labelledby="preferences ? undefined : 'analytics-consent-title'"
      :aria-label="preferences ? t('analyticsTitle') : undefined"
      @keydown="keepFocus"
      @cancel.prevent="analytics.choose('rejected')"
    >
      <h3
        :id="preferences ? undefined : 'analytics-consent-title'"
        ref="heading"
        :class="preferences ? 'h6' : 'h4'"
        tabindex="-1"
      >
        {{ t(preferences ? "analyticsTitle" : "analyticsConsentTitle") }}
      </h3>
      <p>{{ t("analyticsSummary") }}</p>
      <p class="small text-secondary">{{ t("analyticsReassurance") }}</p>
      <p v-if="preferences" class="small mb-2">
        {{ t(analytics.state.choice === "accepted" ? "analyticsAccepted" : "analyticsRejected") }}
      </p>
      <details class="small mb-4">
        <summary>{{ t("analyticsDetails") }}</summary>
        <p class="mt-2 mb-1">{{ t("analyticsNotice") }}</p>
        <a href="https://policies.google.com/privacy" target="_blank" rel="noopener">{{
          t("analyticsGooglePrivacy")
        }}</a>
      </details>
      <div class="analytics-choices">
        <button
          type="button"
          class="btn btn-outline-secondary"
          @click="analytics.choose('accepted')"
        >
          {{ t("analyticsAccept") }}
        </button>
        <button
          type="button"
          class="btn btn-outline-secondary"
          @click="analytics.choose('rejected')"
        >
          {{ t("analyticsReject") }}
        </button>
      </div>
    </component>
  </Teleport>
</template>

<style scoped>
.analytics-dialog {
  width: min(32rem, calc(100vw - 2rem));
  max-height: calc(100dvh - 2rem);
  overflow: auto;
  border: 0;
  border-radius: 1rem;
  box-shadow: 0 1rem 3rem #0003;
  color: var(--bs-body-color);
}
.analytics-dialog h3:focus {
  outline: none;
}
.analytics-dialog::backdrop {
  background: #21252999;
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

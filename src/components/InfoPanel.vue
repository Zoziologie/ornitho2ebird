<script setup>
import { nextTick, ref, watch } from "vue";
import { useI18n } from "vue-i18n";

const props = defineProps({
  focusSection: {
    type: String,
    default: "",
  },
});

const { t } = useI18n();
const autoAssignmentRef = ref(null);

const workflowSteps = [
  { id: "import", icon: "bi-box-arrow-down", labelKey: "introWorkflowImport" },
  { id: "load", icon: "bi-file-earmark-arrow-up", labelKey: "introWorkflowLoad" },
  { id: "aggregation", icon: "bi-diagram-3", labelKey: "introWorkflowAggregation" },
  { id: "metadata", icon: "bi-sliders", labelKey: "introWorkflowMetadata" },
  { id: "export", icon: "bi-filetype-csv", labelKey: "introWorkflowExport" },
  { id: "ebird", icon: "bi-cloud-arrow-up", labelKey: "introWorkflowEbirdImport" },
  { id: "review", icon: "bi-clipboard-check", labelKey: "introWorkflowReview" },
];

const checklistPoints = [
  { id: "ready", icon: "bi-card-checklist", labelKey: "infoHowItWorksChecklistPointOne" },
  { id: "missing", icon: "bi-signpost-2", labelKey: "infoHowItWorksChecklistPointTwo" },
  { id: "track", icon: "bi-people", labelKey: "infoHowItWorksChecklistPointThree" },
  { id: "purpose", icon: "bi-bullseye", labelKey: "infoHowItWorksChecklistPointFour" },
];

const sightingsPoints = [
  { id: "aggregate", icon: "bi-collection", labelKey: "infoHowItWorksSightingsPointOne" },
  { id: "adjust", icon: "bi-pencil-square", labelKey: "infoHowItWorksSightingsPointTwo" },
  { id: "primary", icon: "bi-bullseye", labelKey: "infoHowItWorksSightingsPointThree" },
  { id: "incomplete", icon: "bi-square", labelKey: "infoHowItWorksSightingsPointFour" },
];

const autoAssignmentPoints = [
  { id: "non-assigned", icon: "bi-box-arrow-in-down", labelKey: "infoAutoAssignPointOne" },
  { id: "same-day", icon: "bi-calendar-day", labelKey: "infoAutoAssignPointTwo" },
  { id: "transitive", icon: "bi-diagram-3", labelKey: "infoAutoAssignPointThree" },
  { id: "existing", icon: "bi-lock", labelKey: "infoAutoAssignPointFour" },
  { id: "default-time", icon: "bi-clock", labelKey: "infoAutoAssignPointFive" },
  { id: "settings", icon: "bi-sliders", labelKey: "infoAutoAssignPointSix" },
];

const learnMoreLinks = [
  {
    id: "rules",
    href: "https://ebird.freshdesk.com/en/support/solutions/articles/48000795623#eBird-Checklist-Basics",
    labelKey: "prerequisiteRules",
  },
  {
    id: "protocols",
    href: "https://support.ebird.org/en/support/solutions/articles/48000950859-guide-to-ebird-protocols#anchorQuickProtocols",
    labelKey: "prerequisiteProtocols",
  },
  {
    id: "purpose",
    href: "https://support.ebird.org/en/support/solutions/articles/48000967748-birding-as-your-primary-purpose-and-complete-checklists",
    labelKey: "prerequisitePurpose",
  },
];

watch(
  () => props.focusSection,
  async (value) => {
    if (value !== "auto-assignment") {
      return;
    }

    await nextTick();
    autoAssignmentRef.value?.scrollIntoView({ behavior: "smooth", block: "start" });
  },
  { immediate: true }
);
</script>

<template>
  <div>
    <p class="mb-4">{{ t("infoDescription") }}</p>

    <section class="mb-4">
      <h3 class="h5">{{ t("infoWorkflowTitle") }}</h3>
      <p>{{ t("infoWorkflowIntro") }}</p>
      <ol class="instruction-list">
        <li v-for="step in workflowSteps" :key="step.id" class="instruction-list-item">
          <span class="instruction-list-icon">
            <i :class="['bi', step.icon]" aria-hidden="true"></i>
          </span>
          <span>{{ t(step.labelKey) }}</span>
        </li>
      </ol>
    </section>

    <section class="mb-4">
      <h3 class="h5">{{ t("infoHowItWorksTitle") }}</h3>
      <p>{{ t("infoHowItWorksIntro") }}</p>
      <div class="conversion-grid">
        <article class="conversion-card conversion-card-preferred">
          <div class="conversion-card-badge">
            <i class="bi bi-stars" aria-hidden="true"></i>
            <span>{{ t("infoHowItWorksPreferred") }}</span>
          </div>
          <h4 class="h6 mb-2">{{ t("infoHowItWorksChecklistTitle") }}</h4>
          <p>{{ t("infoHowItWorksChecklistIntro") }}</p>
          <ul class="instruction-icon-list mb-0">
            <li v-for="item in checklistPoints" :key="item.id" class="instruction-icon-list-item">
              <span class="instruction-icon-list-icon">
                <i :class="['bi', item.icon]" aria-hidden="true"></i>
              </span>
              <span>{{ t(item.labelKey) }}</span>
            </li>
          </ul>
        </article>

        <article class="conversion-card">
          <h4 class="h6 mb-2">{{ t("infoHowItWorksSightingsTitle") }}</h4>
          <p>{{ t("infoHowItWorksSightingsIntro") }}</p>
          <ul class="instruction-icon-list mb-0">
            <li v-for="item in sightingsPoints" :key="item.id" class="instruction-icon-list-item">
              <span class="instruction-icon-list-icon">
                <i :class="['bi', item.icon]" aria-hidden="true"></i>
              </span>
              <span>{{ t(item.labelKey) }}</span>
            </li>
          </ul>
        </article>
      </div>
    </section>

    <section ref="autoAssignmentRef">
      <h3 class="h5">{{ t("infoAutoAssignTitle") }}</h3>
      <p>{{ t("infoAutoAssignIntro") }}</p>
      <ul class="instruction-icon-list mb-0">
        <li
          v-for="item in autoAssignmentPoints"
          :key="item.id"
          class="instruction-icon-list-item"
        >
          <span class="instruction-icon-list-icon">
            <i :class="['bi', item.icon]" aria-hidden="true"></i>
          </span>
          <span>{{ t(item.labelKey) }}</span>
        </li>
      </ul>
    </section>

    <section class="alert alert-info border-0 shadow-sm mt-4 mb-0">
      <div class="d-flex align-items-center gap-2 mb-2">
        <i class="bi bi-bookmark-star-fill text-primary" aria-hidden="true"></i>
        <h3 class="h6 mb-0">{{ t("infoLearnMoreTitle") }}</h3>
      </div>
      <ul class="mb-0">
        <li v-for="item in learnMoreLinks" :key="item.id">
          <a :href="item.href" target="_blank" rel="noopener">{{ t(item.labelKey) }}</a>
        </li>
      </ul>
    </section>
  </div>
</template>

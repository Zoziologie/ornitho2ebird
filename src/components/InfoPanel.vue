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
  {
    id: "primary",
    icon: "bi-bullseye",
    labelKey: "infoHowItWorksSightingsPointThree",
    linkText: "primary purpose",
    href: "https://support.ebird.org/en/support/solutions/articles/48000967748-birding-as-your-primary-purpose-and-complete-checklists",
  },
  {
    id: "incomplete",
    icon: "bi-square",
    labelKey: "infoHowItWorksSightingsPointFour",
    linkText: "complete",
    href: "https://support.ebird.org/en/support/solutions/articles/48000967748-birding-as-your-primary-purpose-and-complete-checklists",
  },
];

const autoAssignmentPoints = [
  { id: "same-day", icon: "bi-calendar-day", labelKey: "infoAutoAssignPointTwo" },
  { id: "transitive", icon: "bi-diagram-3", labelKey: "infoAutoAssignPointThree" },
  { id: "existing", icon: "bi-lock", labelKey: "infoAutoAssignPointFour" },
  { id: "default-time", icon: "bi-clock", labelKey: "infoAutoAssignPointFive" },
  { id: "settings", icon: "bi-sliders", labelKey: "infoAutoAssignPointSix" },
];

function linkedLabelParts(item) {
  const label = t(item.labelKey);
  const linkText = item.linkText || "";
  const index = label.toLowerCase().indexOf(linkText.toLowerCase());

  if (!item.href || !linkText || index === -1) {
    return { hasLink: false, label };
  }

  return {
    hasLink: true,
    before: label.slice(0, index),
    link: label.slice(index, index + linkText.length),
    after: label.slice(index + linkText.length),
  };
}

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

    <section class="instruction-section">
      <h3 class="modal-section-title">{{ t("infoWorkflowTitle") }}</h3>
      <ol class="instruction-list">
        <li v-for="step in workflowSteps" :key="step.id" class="instruction-list-item">
          <span class="instruction-list-icon">
            <i :class="['bi', step.icon]" aria-hidden="true"></i>
          </span>
          <span>{{ t(step.labelKey) }}</span>
        </li>
      </ol>
    </section>

    <section class="instruction-section">
      <h3 class="modal-section-title">{{ t("infoHowItWorksTitle") }}</h3>
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
              <span>
                <template v-if="linkedLabelParts(item).hasLink">
                  {{ linkedLabelParts(item).before
                  }}<a :href="item.href" target="_blank" rel="noopener">{{
                    linkedLabelParts(item).link
                  }}</a
                  >{{ linkedLabelParts(item).after }}
                </template>
                <template v-else>{{ t(item.labelKey) }}</template>
              </span>
            </li>
          </ul>
        </article>
      </div>
    </section>

    <section ref="autoAssignmentRef" class="instruction-section">
      <h3 class="modal-section-title">{{ t("infoAutoAssignTitle") }}</h3>
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

    <section class="instruction-section">
      <h3 class="modal-section-title">{{ t("infoCustomizeTitle") }}</h3>
      <p>{{ t("infoCustomizeBody") }}</p>
      <p class="mb-0">{{ t("infoCustomizeSpeciesComments") }}</p>
    </section>

    <section class="instruction-section instruction-section-alert">
      <div class="alert alert-info border-0 shadow-sm mb-0">
        <div class="d-flex align-items-center gap-2 mb-2">
          <i class="bi bi-bookmark-star-fill text-primary" aria-hidden="true"></i>
          <h3 class="h6 mb-0">{{ t("infoLearnMoreTitle") }}</h3>
        </div>
        <ul class="mb-0">
          <li v-for="item in learnMoreLinks" :key="item.id">
            <a :href="item.href" target="_blank" rel="noopener">{{ t(item.labelKey) }}</a>
          </li>
        </ul>
      </div>
    </section>
  </div>
</template>

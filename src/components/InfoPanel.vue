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
      <ol>
        <li>{{ t("introWorkflowImport") }}</li>
        <li>{{ t("introWorkflowAdvanced") }}</li>
        <li>{{ t("introWorkflowExport") }}</li>
        <li>{{ t("introWorkflowReview") }}</li>
      </ol>
      <p class="mb-2">{{ t("infoLearnMoreIntro") }}</p>
      <ul class="mb-0">
        <li v-for="item in learnMoreLinks" :key="item.id">
          <a :href="item.href" target="_blank" rel="noopener">{{ t(item.labelKey) }}</a>
        </li>
      </ul>
    </section>

    <section class="mb-4">
      <h3 class="h5">{{ t("infoHowItWorksTitle") }}</h3>
      <p>{{ t("infoHowItWorksIntro") }}</p>
      <ul>
        <li>{{ t("infoHowItWorksPointOne") }}</li>
        <li>{{ t("infoHowItWorksPointTwo") }}</li>
        <li>{{ t("infoHowItWorksPointThree") }}</li>
        <li>{{ t("importantRuleOne") }}</li>
        <li>{{ t("importantRuleTwo") }}</li>
        <li>{{ t("importantRuleThree") }}</li>
      </ul>
    </section>

    <section ref="autoAssignmentRef">
      <h3 class="h5">{{ t("infoAutoAssignTitle") }}</h3>
      <p>{{ t("infoAutoAssignIntro") }}</p>
      <ul class="mb-0">
        <li>{{ t("infoAutoAssignPointOne") }}</li>
        <li>{{ t("infoAutoAssignPointTwo") }}</li>
        <li>{{ t("infoAutoAssignPointThree") }}</li>
        <li>{{ t("infoAutoAssignPointFour") }}</li>
        <li>{{ t("infoAutoAssignPointFive") }}</li>
        <li>{{ t("infoAutoAssignPointSix") }}</li>
      </ul>
    </section>
  </div>
</template>

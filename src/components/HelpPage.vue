<script setup>
import { nextTick, watch } from "vue";
import { useI18n } from "vue-i18n";
import LinkedText from "./LinkedText.vue";

const props = defineProps({
  // Section or FAQ question to scroll to (the part after #help/ in the address).
  section: {
    type: String,
    default: "",
  },
});

const emit = defineEmits(["close"]);
const { t } = useI18n();

const EBIRD_PURPOSE_URL =
  "https://support.ebird.org/en/support/solutions/articles/48000967748-birding-as-your-primary-purpose-and-complete-checklists";
const EBIRD_IMPORTS_URL = "https://ebird.org/import/status/all.htm";

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
    links: [EBIRD_PURPOSE_URL],
  },
  {
    id: "incomplete",
    icon: "bi-square",
    labelKey: "infoHowItWorksSightingsPointFour",
    links: [EBIRD_PURPOSE_URL],
  },
];

const autoAssignmentPoints = [
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
    href: EBIRD_PURPOSE_URL,
    labelKey: "prerequisitePurpose",
  },
];

// Pitfalls and unusual cases only; the normal workflow is described above. Each question's
// text is faq<key>Question / faq<key>Answer, with links as in LinkedText. The id is the address of the question: #help/<id>.
const faqGroups = [
  {
    id: "before",
    titleKey: "faqBeforeTitle",
    questions: [
      { id: "duplicates", key: "Duplicates", links: ["https://ebird.org/mychecklists"] },
      {
        id: "large-imports",
        key: "LargeImports",
        links: ["https://support.ebird.org/en/support/tickets/new"],
      },
      {
        id: "not-for-ebird",
        key: "NotForEbird",
        links: [
          "https://support.ebird.org/en/support/solutions/articles/48000795623-ebird-rules-and-best-practices",
        ],
      },
    ],
  },
  {
    id: "during",
    titleKey: "faqDuringTitle",
    questions: [
      { id: "species-matching", key: "SpeciesMatching", links: [] },
      {
        id: "hotspots",
        key: "Hotspots",
        links: [
          "https://support.ebird.org/en/support/solutions/articles/48000850891-choosing-and-managing-locations-in-ebird#anchorMergeLocation",
        ],
      },
    ],
  },
  {
    id: "after",
    titleKey: "faqAfterTitle",
    questions: [
      { id: "processing", key: "Processing", links: [EBIRD_IMPORTS_URL] },
      { id: "mistakes", key: "Mistakes", links: [EBIRD_IMPORTS_URL] },
      { id: "rarities", key: "Rarities", links: [] },
      { id: "distance", key: "Distance", links: [] },
    ],
  },
];
const FAQ_ISSUE_URL = "https://github.com/Zoziologie/ornitho2ebird/issues";

// Jump straight to the section when the page opens; scroll smoothly between sections.
watch(
  () => props.section,
  async (section, previousSection) => {
    await nextTick();
    const behavior = previousSection === undefined ? "instant" : "smooth";
    const target = section ? document.getElementById(`help-${section}`) : null;
    if (!target) {
      window.scrollTo({ top: 0, behavior });
      return;
    }
    if (target.tagName === "DETAILS") {
      target.open = true;
    }
    target.scrollIntoView({ behavior, block: "start" });
  },
  { immediate: true },
);
</script>

<template>
  <section class="card border-0 shadow-sm help-page">
    <div class="card-body p-4">
      <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
        <h2 class="modal-title-heading">
          <i class="bi bi-journal-text" aria-hidden="true"></i>
          <span>{{ t("infoTitle") }}</span>
        </h2>
        <button class="btn btn-outline-secondary btn-sm" type="button" @click="emit('close')">
          <i class="bi bi-arrow-left" aria-hidden="true"></i>
          {{ t("helpBack") }}
        </button>
      </div>

      <p class="mb-3">{{ t("infoDescription") }}</p>
      <nav class="help-toc mb-4" :aria-label="t('infoTitle')">
        <a href="#help/workflow">{{ t("infoWorkflowTitle") }}</a>
        <a href="#help/conversion">{{ t("infoHowItWorksTitle") }}</a>
        <a href="#help/auto-assignment">{{ t("infoAutoAssignTitle") }}</a>
        <a href="#help/customize">{{ t("infoCustomizeTitle") }}</a>
        <a href="#help/faq">{{ t("faqTitle") }}</a>
      </nav>

      <section id="help-workflow" class="instruction-section">
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

      <section id="help-conversion" class="instruction-section">
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
                  <LinkedText :text="t(item.labelKey)" :links="item.links" />
                </span>
              </li>
            </ul>
          </article>
        </div>
      </section>

      <section id="help-auto-assignment" class="instruction-section">
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

      <section id="help-customize" class="instruction-section">
        <h3 class="modal-section-title">{{ t("infoCustomizeTitle") }}</h3>
        <p>{{ t("infoCustomizeBody") }}</p>
        <p class="mb-0">{{ t("infoCustomizeSpeciesComments") }}</p>
      </section>

      <section id="help-faq" class="instruction-section">
        <h3 class="modal-section-title">{{ t("faqTitle") }}</h3>
        <div v-for="group in faqGroups" :key="group.id" class="help-faq-group">
          <h4 class="h6 text-uppercase text-secondary mb-2">{{ t(group.titleKey) }}</h4>
          <details
            v-for="question in group.questions"
            :id="`help-${question.id}`"
            :key="question.id"
            class="help-faq-item"
          >
            <summary>{{ t(`faq${question.key}Question`) }}</summary>
            <p class="mb-0">
              <LinkedText :text="t(`faq${question.key}Answer`)" :links="question.links" />
            </p>
          </details>
        </div>
        <p class="mb-0">
          <LinkedText :text="t('faqMore')" :links="[FAQ_ISSUE_URL]" />
        </p>
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
  </section>
</template>

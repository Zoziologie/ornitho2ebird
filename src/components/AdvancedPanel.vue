<script setup>
import { computed, markRaw, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import { trackEvent } from "../lib/analytics";
import { useI18n } from "vue-i18n";
import AssignmentMap from "./AssignmentMap.vue";
import ReviewMap from "./ReviewMap.vue";
import {
  CHECKLIST_COLORS,
  UNASSIGNED_COLOR,
  buildAssignmentOptions,
  buildReviewOptions,
  checklistColor,
  protocolBadgeClass,
  requiredNumberStateClass,
  requiredStateClass,
  requiredTimeStateClass,
} from "../lib/advancedPanel";
import { alertDialog, confirmDialog } from "../lib/dialog";
import {
  buildChecklistPayloadFromSightings,
  buildSpeciesRows,
  uniqueDistanceFromPath,
  checklistReview,
  normalizeLocationName,
  protocol,
} from "../lib/utils";
import { buildStaticMapUrl } from "../lib/staticMap";
import { EBIRD_API_KEY, LOCATION_NAME_MAX_LENGTH } from "../lib/constants";
import { fetchJson } from "../lib/http";
import { store } from "../lib/store";

const props = defineProps({
  forms: { type: Array, required: true },
  sightings: { type: Array, required: true },
  formsSightings: { type: Array, required: true },
  mapboxToken: { type: String, default: "" },
  globalStaticMap: { type: Object, default: () => ({}) },
  selectedFormId: { type: Number, default: null },
  defaultSpeciesCommentTemplate: { type: Object, required: true },
  defaultNumberObserver: { type: Number, default: 1 },
  defaultAssignDuration: { type: Number, default: 24 },
  defaultAssignDistance: { type: Number, default: 3 },
  assignmentMapBaseLayer: { type: String, default: "OpenStreetMap" },
});

const emit = defineEmits(["update:selectedFormId", "update:assignmentMapBaseLayer", "open-info"]);
const { t } = useI18n();

const assignDuration = ref(props.defaultAssignDuration || 1);
const assignDistance = ref(props.defaultAssignDistance || 3);
const assignFormId = ref(0);
let creatingChecklist = false;
const assignmentMap = ref(null);
const reviewMap = ref(null);
const assignSelectorOpen = ref(false);
const reviewSelectorOpen = ref(false);
const assignSelectorRef = ref(null);
const reviewSelectorRef = ref(null);
const observationsModalOpen = ref(false);

const unassignedColor = UNASSIGNED_COLOR;
const checklistColors = CHECKLIST_COLORS;

const selectedForm = computed(() => {
  return props.forms.find((form) => form.id === props.selectedFormId) || null;
});

const selectedSightings = computed(() => {
  if (!selectedForm.value) {
    return [];
  }

  return [
    ...(props.formsSightings[selectedForm.value.id - 1] || []),
    ...props.sightings.filter((sighting) => sighting.form_id === selectedForm.value.id),
  ];
});

const unassignedSightings = computed(() => {
  return props.sightings.filter((sighting) => sighting.form_id === 0);
});

const assignableForms = computed(() => {
  return props.forms.filter((form) => !form.imported);
});

const assignmentOptions = computed(() => {
  return buildAssignmentOptions(assignableForms.value, t, checklistColors, unassignedColor);
});

const selectedAssignmentOption = computed(() => {
  return (
    assignmentOptions.value.find((option) => option.value === assignFormId.value) ||
    assignmentOptions.value[0]
  );
});

const reviewOptions = computed(() => {
  return buildReviewOptions(props.forms, checklistColors, unassignedColor);
});

const clusterAssignmentOptions = computed(() => {
  return [
    {
      value: 0,
      label: t("nonAssigned"),
    },
    ...reviewOptions.value.map((option) => ({
      value: option.value,
      label: option.label,
    })),
  ];
});

const selectedReviewOption = computed(() => {
  return (
    reviewOptions.value.find((option) => option.value === props.selectedFormId) ||
    reviewOptions.value[0] ||
    null
  );
});

const orderedSightings = computed(() => {
  return [...selectedSightings.value]
    .filter((sighting) => sighting.date)
    .map((sighting) => ({
      ...sighting,
      _datetime: new Date(`${sighting.date}T${sighting.time || "00:00"}`),
    }))
    .sort((left, right) => left._datetime - right._datetime);
});

const computedDuration = computed(() => {
  if (orderedSightings.value.length < 2) {
    return Number(selectedForm.value?.duration) || 0;
  }

  const first = orderedSightings.value[0]._datetime;
  const last = orderedSightings.value[orderedSightings.value.length - 1]._datetime;
  return Math.round((last - first) / 1000 / 60);
});

const spansMultipleDays = computed(() => {
  return (
    selectedForm.value && checklistReview(selectedForm.value, selectedSightings.value).dateWarning
  );
});

const selectedProtocol = computed(() => {
  return selectedForm.value ? protocol(selectedForm.value) : null;
});

const selectedSpeciesCommentTemplate = computed(() => {
  return selectedForm.value?.species_comment_template || props.defaultSpeciesCommentTemplate;
});

const checklistObservationRows = computed(() => {
  return buildSpeciesRows(selectedSightings.value, selectedSpeciesCommentTemplate.value);
});

const isInvalid = computed(() => {
  return selectedProtocol.value?.name === "Invalid";
});

const showStaticMapPanel = computed(() => {
  return Boolean(props.globalStaticMap?.show);
});

const staticMapPreview = computed(() => {
  if (!selectedForm.value) {
    return { url: "", reason: "no_coordinates" };
  }

  if (!selectedForm.value.include_static_map) {
    return { url: "", reason: "disabled" };
  }

  return buildStaticMapUrl({
    form: selectedForm.value,
    sightings: selectedSightings.value,
    token: props.mapboxToken,
    settings: props.globalStaticMap,
    width: 640,
    height: 420,
  });
});

// The checklist editor's fields. The form is read-only here: v-model writes through the store.
const EDITABLE_FORM_FIELDS = [
  "exportable",
  "location_name",
  "date",
  "number_observer",
  "time",
  "duration",
  "distance",
  "primary_purpose",
  "full_form",
  "include_static_map",
  "static_map_zoom_mode",
  "static_map_zoom",
];
const selectedFormModel = reactive(
  Object.fromEntries(
    EDITABLE_FORM_FIELDS.map((key) => [
      key,
      computed({
        get: () => selectedForm.value?.[key],
        set: (value) => store.updateForm(selectedForm.value?.id, { [key]: value }),
      }),
    ]),
  ),
);

function selectStyle() {
  return {
    borderColor: "var(--ebird-blue)",
    color: "#212529",
  };
}

function selectFormByOffset(offset) {
  if (!selectedForm.value) {
    return;
  }

  const index = props.forms.findIndex((form) => form.id === selectedForm.value.id);
  const nextIndex = Math.min(props.forms.length - 1, Math.max(0, index + offset));
  emit("update:selectedFormId", props.forms[nextIndex]?.id || selectedForm.value.id);
}

function earliestSighting() {
  return orderedSightings.value[0] || null;
}

function earliestTimedSighting() {
  return orderedSightings.value.find((sighting) => sighting.time) || null;
}

function computeDateFromSightings() {
  if (!selectedForm.value) {
    return;
  }

  store.updateForm(selectedForm.value.id, { date: earliestSighting()?.date || "" });
  trackEvent("checklist_action", { action: "compute_date", panel: "checklist" });
}

function computeTimeFromSightings() {
  if (!selectedForm.value) {
    return;
  }

  store.updateForm(selectedForm.value.id, { time: earliestTimedSighting()?.time || "" });
  trackEvent("checklist_action", { action: "compute_time", panel: "checklist" });
}

function computeDurationFromSightings() {
  if (!selectedForm.value) {
    return;
  }

  store.updateForm(selectedForm.value.id, { duration: computedDuration.value || "" });
  trackEvent("checklist_action", { action: "compute_duration", panel: "checklist" });
}

async function loadHotspotsForSelectedForm() {
  // Keep a reference: the selection may change while the request is in flight.
  const form = selectedForm.value;
  // Not `!form.lat`: latitude or longitude 0 is a valid position.
  const isCoordinate = (value) => value !== "" && value != null && Number.isFinite(Number(value));
  if (!form || !isCoordinate(form.lat) || !isCoordinate(form.lon)) {
    return;
  }

  const hotspotKey = `${Number(form.lat).toFixed(3)},${Number(form.lon).toFixed(3)}`;
  if (form.hotspot_key === hotspotKey && Array.isArray(form.hotspots)) {
    return;
  }

  try {
    const json = await fetchJson(
      `https://api.ebird.org/v2/ref/hotspot/geo?lat=${form.lat}&lng=${form.lon}&dist=10&fmt=json&key=${EBIRD_API_KEY}`,
    );
    store.updateForm(form.id, {
      hotspots: markRaw(Array.isArray(json) ? json : []),
      hotspot_key: hotspotKey,
    });
  } catch (error) {
    // Not cached, so selecting the checklist again retries.
    console.warn("Could not load eBird hotspots", error);
  }
}

function focusReviewMap() {
  reviewMap.value?.focus();
  trackEvent("checklist_action", { action: "focus_map", panel: "checklist" });
}

function startPathDraw() {
  reviewMap.value?.startPathDraw();
  trackEvent("checklist_action", { action: "draw_path", panel: "checklist" });
}

async function updatePath(path) {
  const form = selectedForm.value;
  if (!form) {
    return;
  }

  const newDistance = uniqueDistanceFromPath(path);
  const currentDistance = form.distance === "" ? null : form.distance;

  const confirmed = await confirmDialog(
    currentDistance !== null
      ? t("updatePathConfirmReplace", { previous: currentDistance, next: newDistance })
      : t("updatePathConfirm", { next: newDistance }),
  );

  if (!confirmed) {
    return;
  }

  store.setFormPath(form.id, path);
  trackEvent("checklist_action", { action: "path" });
}

function startRectangleDraw(mode) {
  creatingChecklist = mode === "create";
  assignmentMap.value?.startSelection();
  trackEvent("checklist_action", { action: "select_rectangle", panel: "assignment" });
}

function assignSightings(sightings, formId) {
  store.assignSightings(sightings, formId);
  trackEvent("checklist_action", { action: "assign" });
}

function moveChecklist(formId, lat, lon) {
  store.moveForm(formId, lat, lon);
  trackEvent("checklist_action", { action: "move" });
}

function applyAssignmentSelection(matchedSightings) {
  const isCreateMode = creatingChecklist;
  creatingChecklist = false;

  if (!matchedSightings.length) {
    alertDialog(t("assignNoSightingsInSelection"));
    return;
  }

  if (isCreateMode) {
    const newFormId = createChecklistFromSightings(matchedSightings);
    if (newFormId) {
      assignSightings(matchedSightings, newFormId);
    }
    return;
  }

  assignSightings(matchedSightings, assignFormId.value);
}

function selectAssignmentForm(value) {
  assignFormId.value = value;
  assignSelectorOpen.value = false;
}

function selectReviewForm(value) {
  trackEvent("checklist_action", { action: "select" });
  emit("update:selectedFormId", value);
  reviewSelectorOpen.value = false;
}

function handleDocumentClick(event) {
  if (assignSelectorRef.value && !assignSelectorRef.value.contains(event.target)) {
    assignSelectorOpen.value = false;
  }

  if (reviewSelectorRef.value && !reviewSelectorRef.value.contains(event.target)) {
    reviewSelectorOpen.value = false;
  }
}

watch(
  () => props.forms.map((form) => form.id),
  (formIds) => {
    if (!formIds.length) {
      return;
    }

    if (!formIds.includes(props.selectedFormId)) {
      emit("update:selectedFormId", formIds[0]);
    }
  },
  { immediate: true },
);

watch(
  () => props.selectedFormId,
  (value) => {
    assignFormId.value = assignableForms.value.some((form) => form.id === value) ? value : 0;
  },
  { immediate: true },
);

watch(
  () => props.defaultAssignDuration,
  (value) => {
    if (value > 0) {
      assignDuration.value = value;
    }
  },
);

watch(
  () => props.defaultAssignDistance,
  (value) => {
    if (value > 0) {
      assignDistance.value = value;
    }
  },
);

// On change, not on every keystroke: normalising while typing would drop a space typed at the
// end ("Le Pont" typed key by key became "LePont").
function normalizeSelectedLocationName() {
  const value = selectedForm.value?.location_name;
  if (typeof value !== "string") {
    return;
  }

  const normalized = normalizeLocationName(value);
  if (normalized !== value) {
    store.updateForm(selectedForm.value.id, { location_name: normalized });
  }
}

// Returns the id of the new checklist.
function buildNewChecklist(payload) {
  const formId = store.createForm(payload, {
    defaultNumberObserver: props.defaultNumberObserver,
    speciesCommentTemplate: props.defaultSpeciesCommentTemplate,
  });
  emit("update:selectedFormId", formId);
  trackEvent("checklist_action", { action: "create" });
  assignFormId.value = formId;
  return formId;
}

function createChecklistFromSightings(targetSightings) {
  if (!targetSightings.length) {
    return null;
  }

  return buildNewChecklist(buildChecklistPayloadFromSightings(targetSightings) || {});
}

function assignClean() {
  store.deleteUnusedForms();
  trackEvent("checklist_action", { action: "clean" });
}

async function deleteSelectedChecklist() {
  const formToDelete = selectedForm.value;
  if (!formToDelete || !(await confirmDialog(t("deleteChecklistConfirm")))) {
    return;
  }

  const formIndex = store.deleteForm(formToDelete.id);
  trackEvent("checklist_action", { action: "delete" });
  if (formIndex < 0) {
    return;
  }

  if (!props.forms.length) {
    emit("update:selectedFormId", null);
    return;
  }

  const nextForm = props.forms[Math.min(formIndex, props.forms.length - 1)] || props.forms[0];
  emit("update:selectedFormId", nextForm?.id || null);
}

async function assignReset() {
  if (!(await confirmDialog(t("assignResetConfirm")))) {
    return;
  }

  store.resetAssignment();
  trackEvent("checklist_action", { action: "reset" });
  assignFormId.value = 0;
  emit("update:selectedFormId", props.forms[0]?.id || null);
}

async function assignMagic() {
  if (assignDuration.value > 24) {
    alertDialog(t("assignDurationTooLong"));
    return;
  }

  if (assignDistance.value > 10 && assignDistance.value < 80) {
    if (!(await confirmDialog(t("assignDistanceLongConfirm")))) {
      return;
    }
  } else if (assignDistance.value >= 80) {
    alertDialog(t("assignDistanceTooLong"));
    return;
  }

  const availableSightings = unassignedSightings.value;
  if (!availableSightings.length) {
    alertDialog(t("assignNoSightings"));
    return;
  }

  store.autoAssign({
    autoAssignDuration: assignDuration.value,
    autoAssignDistance: assignDistance.value,
    defaultNumberObserver: props.defaultNumberObserver,
    speciesCommentTemplate: props.defaultSpeciesCommentTemplate,
  });
  trackEvent("checklist_action", { action: "auto_assign" });
}

// The hotspot's own coordinates, not rounded like a dragged marker.
function useHotspot(hotspot) {
  if (!selectedForm.value) {
    return;
  }

  store.updateForm(selectedForm.value.id, {
    location_name: hotspot.locName,
    lat: hotspot.lat,
    lon: hotspot.lng,
    hotspot_key: "",
  });
  trackEvent("checklist_action", { action: "hotspot" });
  loadHotspotsForSelectedForm();
}

function selectChecklistOnMap(formId) {
  assignFormId.value = formId;
  emit("update:selectedFormId", formId);
}

watch(
  () => [selectedForm.value?.id, selectedForm.value?.lat, selectedForm.value?.lon],
  async () => {
    if (!selectedForm.value) {
      return;
    }
    await loadHotspotsForSelectedForm();
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  document.removeEventListener("click", handleDocumentClick);
});

onMounted(() => {
  document.addEventListener("click", handleDocumentClick);
});
</script>

<template>
  <div class="d-flex flex-column gap-3">
    <section v-if="sightings.length > 0" class="card border-0 shadow-sm rounded-3">
      <div class="card-body p-3 p-md-4">
        <h2 v-analytics-view="'assignment'" class="border-bottom pb-2 mb-3">
          {{ t("assignmentTitle") }}
        </h2>
        <p class="mb-3">{{ t("assignmentIntro") }}</p>

        <div class="assignment-map-shell mb-3">
          <AssignmentMap
            ref="assignmentMap"
            class="assignment-map rounded border"
            :aria-label="t('assignmentMapAria')"
            :sightings="sightings"
            :forms="forms"
            :assign-options="clusterAssignmentOptions"
            :selected-form-id="assignFormId"
            :base-layer="assignmentMapBaseLayer"
            @update:base-layer="emit('update:assignmentMapBaseLayer', $event)"
            @select-form="selectChecklistOnMap"
            @move-form="moveChecklist"
            @assign="assignSightings"
            @selection="applyAssignmentSelection"
          />

          <div class="assignment-map-controls">
            <button
              v-tooltip:top="t('createChecklistTooltip')"
              class="btn btn-success w-100 mb-2 d-inline-flex align-items-center justify-content-center gap-2"
              type="button"
              :aria-label="t('createChecklistTooltip')"
              @click="startRectangleDraw('create')"
            >
              <i class="bi bi-plus-square" aria-hidden="true"></i>
              <span>{{ t("createChecklist") }}</span>
            </button>
            <div class="input-group mb-2">
              <div ref="assignSelectorRef" class="custom-checklist-select flex-grow-1">
                <button
                  class="custom-checklist-select-toggle"
                  type="button"
                  :style="selectStyle()"
                  @click="assignSelectorOpen = !assignSelectorOpen"
                >
                  <span class="checklist-option-label">
                    <span
                      class="checklist-color-dot"
                      :style="{
                        backgroundColor: selectedAssignmentOption?.color || checklistColor(0),
                      }"
                    ></span>
                    <span
                      v-if="selectedAssignmentOption?.protocolCode"
                      class="checklist-protocol-badge badge"
                      :class="selectedAssignmentOption.protocolClass"
                    >
                      {{ selectedAssignmentOption.protocolCode }}
                    </span>
                    <span>{{ selectedAssignmentOption?.label }}</span>
                  </span>
                  <span class="custom-checklist-caret" aria-hidden="true">▾</span>
                </button>
                <div v-if="assignSelectorOpen" class="custom-checklist-select-menu shadow-sm">
                  <button
                    v-for="option in assignmentOptions"
                    :key="option.value"
                    class="custom-checklist-select-item"
                    type="button"
                    @click="selectAssignmentForm(option.value)"
                  >
                    <span class="checklist-option-label">
                      <span
                        class="checklist-color-dot"
                        :style="{ backgroundColor: option.color }"
                      ></span>
                      <span
                        v-if="option.protocolCode"
                        class="checklist-protocol-badge badge"
                        :class="option.protocolClass"
                      >
                        {{ option.protocolCode }}
                      </span>
                      <span>{{ option.label }}</span>
                    </span>
                  </button>
                </div>
              </div>
              <button
                v-tooltip:top="t('assignToChecklistTooltip')"
                class="btn btn-primary btn-icon"
                type="button"
                :aria-label="t('assignToChecklistTooltip')"
                @click="startRectangleDraw('assign')"
              >
                <i class="bi bi-bounding-box-circles" aria-hidden="true"></i>
              </button>
            </div>
            <div class="assignment-map-secondary-actions">
              <button
                v-tooltip:top="t('assignCleanTooltip')"
                class="btn btn-outline-secondary btn-sm"
                type="button"
                @click="assignClean"
              >
                <i class="bi bi-eraser" aria-hidden="true"></i>
                <span>{{ t("assignClean") }}</span>
              </button>
              <button
                v-tooltip:top="t('assignResetTooltip')"
                class="btn btn-outline-danger btn-sm"
                type="button"
                @click="assignReset"
              >
                <i class="bi bi-arrow-counterclockwise" aria-hidden="true"></i>
                <span>{{ t("assignReset") }}</span>
              </button>
            </div>
          </div>
        </div>

        <div class="p-3 text-white rounded shadow-sm bg-secondary">
          <div class="assignment-magic-row">
            <div class="d-flex align-items-center gap-2 flex-shrink-0">
              <h3 class="h5 mb-0">{{ t("assignmentMagicTitle") }}</h3>
              <button
                class="btn btn-outline-light btn-sm btn-icon"
                type="button"
                :aria-label="t('assignmentMagicInfoTooltip')"
                @click="emit('open-info')"
              >
                <i class="bi bi-journal-text" aria-hidden="true"></i>
              </button>
            </div>
            <p class="assignment-magic-help mb-0">{{ t("assignmentMagicHelp") }}</p>

            <div class="assignment-magic-inputs">
              <label class="assignment-magic-field">
                <span class="assignment-magic-label">{{ t("assignmentDurationHours") }}</span>
                <input
                  v-model.number="assignDuration"
                  class="form-control form-control-sm"
                  type="number"
                  step="0.1"
                  min="0.1"
                  max="24"
                />
              </label>

              <label class="assignment-magic-field">
                <span class="assignment-magic-label">{{ t("assignmentDistanceKm") }}</span>
                <input
                  v-model.number="assignDistance"
                  class="form-control form-control-sm"
                  type="number"
                  step="0.1"
                  min="0.1"
                  max="80"
                />
              </label>
            </div>

            <button
              v-tooltip:top="t('assignmentMagicTooltip')"
              class="btn btn-primary assignment-magic-action d-inline-flex align-items-center justify-content-center gap-2"
              type="button"
              :aria-label="t('assignmentMagicTooltip')"
              @click="assignMagic"
            >
              <i class="bi bi-magic" aria-hidden="true"></i>
              <span>{{ t("assignmentMagicAction") }}</span>
            </button>
          </div>
        </div>
      </div>
    </section>

    <section v-if="forms.length > 0" class="card border-0 shadow-sm rounded-3">
      <div class="card-body p-3 p-md-4">
        <h2 v-analytics-view="'checklist'" class="border-bottom pb-2 mb-3">
          {{ t("advancedTitle") }}
        </h2>
        <p>{{ t("advancedIntro") }}</p>

        <div v-if="selectedForm" class="row align-items-center g-3 mb-3">
          <div class="col-lg-3 text-center">
            <span class="badge fs-6 px-3 py-2" :class="protocolBadgeClass(selectedForm)">
              {{ selectedProtocol.name.toUpperCase() }}
            </span>
          </div>
          <div class="col-lg-6">
            <div class="input-group input-group-lg">
              <button
                class="btn btn-outline-secondary"
                type="button"
                @click="selectFormByOffset(-1)"
              >
                &lsaquo;
              </button>
              <div ref="reviewSelectorRef" class="custom-checklist-select flex-grow-1">
                <button
                  class="custom-checklist-select-toggle custom-checklist-select-toggle-lg"
                  type="button"
                  :style="selectStyle()"
                  @click="reviewSelectorOpen = !reviewSelectorOpen"
                >
                  <span class="checklist-option-label">
                    <span
                      class="checklist-color-dot"
                      :style="{ backgroundColor: selectedReviewOption?.color || checklistColor(0) }"
                    ></span>
                    <span
                      v-if="selectedReviewOption?.protocolCode"
                      class="checklist-protocol-badge badge"
                      :class="selectedReviewOption.protocolClass"
                    >
                      {{ selectedReviewOption.protocolCode }}
                    </span>
                    <span>{{ selectedReviewOption?.label }}</span>
                  </span>
                  <span class="custom-checklist-caret" aria-hidden="true">▾</span>
                </button>
                <div v-if="reviewSelectorOpen" class="custom-checklist-select-menu shadow-sm">
                  <button
                    v-for="option in reviewOptions"
                    :key="option.value"
                    class="custom-checklist-select-item"
                    type="button"
                    @click="selectReviewForm(option.value)"
                  >
                    <span class="checklist-option-label">
                      <span
                        class="checklist-color-dot"
                        :style="{ backgroundColor: option.color }"
                      ></span>
                      <span
                        v-if="option.protocolCode"
                        class="checklist-protocol-badge badge"
                        :class="option.protocolClass"
                      >
                        {{ option.protocolCode }}
                      </span>
                      <span>{{ option.label }}</span>
                    </span>
                  </button>
                </div>
              </div>
              <button
                class="btn btn-outline-secondary"
                type="button"
                @click="selectFormByOffset(1)"
              >
                &rsaquo;
              </button>
            </div>
          </div>
          <div class="col-lg-3">
            <div class="d-grid gap-2">
              <button
                class="btn btn-outline-secondary btn-sm d-inline-flex align-items-center justify-content-center gap-2"
                type="button"
                @click="
                  observationsModalOpen = true;
                  trackEvent('checklist_action', { action: 'view_observations' });
                "
              >
                <i class="bi bi-list-ul" aria-hidden="true"></i>
                <span>{{
                  t("viewChecklistObservations", { count: selectedSightings.length })
                }}</span>
              </button>
            </div>
            <div class="form-check form-switch mt-2">
              <input
                id="export-ready"
                v-model="selectedFormModel.exportable"
                class="form-check-input"
                type="checkbox"
                :disabled="isInvalid"
                @change="trackEvent('checklist_action', { action: 'edit' })"
              />
              <label class="form-check-label" for="export-ready">{{ t("readyForExport") }}</label>
            </div>
          </div>
        </div>

        <section v-if="selectedForm" class="border rounded-3 p-3 p-md-4 mt-3">
          <div v-if="selectedSightings.length === 0 || isInvalid || spansMultipleDays" class="mb-3">
            <div v-if="spansMultipleDays" class="alert alert-danger mb-3">
              <h4 class="alert-heading">{{ t("checklistWarnings") }}</h4>
              <p class="mb-0">{{ t("warningMultipleDays") }}</p>
            </div>
            <div v-if="selectedSightings.length === 0 || isInvalid" class="alert alert-danger mb-0">
              <h4 class="alert-heading">{{ t("checklistWarnings") }}</h4>
              <div
                v-if="selectedSightings.length === 0"
                class="d-flex flex-column flex-sm-row align-items-sm-center justify-content-between gap-2"
              >
                <p class="mb-0">{{ t("warningNoSightings") }}</p>
                <button
                  class="btn btn-outline-danger btn-sm flex-shrink-0"
                  type="button"
                  @click="deleteSelectedChecklist"
                >
                  {{ t("deleteChecklist") }}
                </button>
              </div>
              <p v-if="isInvalid" class="mb-0">{{ t("warningInvalid") }}</p>
            </div>
          </div>

          <div class="row g-3">
            <div class="col-lg-5 col-sm-6">
              <label class="form-label">{{ t("locationName") }}</label>
              <div class="input-group">
                <input
                  v-model="selectedFormModel.location_name"
                  class="form-control"
                  :class="requiredStateClass(selectedForm.location_name)"
                  type="text"
                  :maxlength="LOCATION_NAME_MAX_LENGTH"
                  @change="
                    normalizeSelectedLocationName();
                    trackEvent('checklist_action', { action: 'edit' });
                  "
                />
                <button
                  v-tooltip:top="t('focusMapTooltip')"
                  class="btn btn-outline-secondary btn-icon"
                  type="button"
                  :aria-label="t('focusMapTooltip')"
                  @click="focusReviewMap"
                >
                  <i class="bi bi-map" aria-hidden="true"></i>
                </button>
              </div>
              <div
                class="form-text"
                :class="{
                  'text-warning':
                    (selectedForm.location_name || '').length >= LOCATION_NAME_MAX_LENGTH,
                }"
              >
                {{
                  t("locationNameLimitHint", {
                    count: (selectedForm.location_name || "").length,
                    max: LOCATION_NAME_MAX_LENGTH,
                  })
                }}
              </div>
            </div>
            <div class="col-lg-4 col-sm-6">
              <label class="form-label">{{ t("date") }}</label>
              <div class="input-group">
                <input
                  v-model="selectedFormModel.date"
                  class="form-control"
                  :class="requiredStateClass(selectedForm.date)"
                  type="date"
                  @change="trackEvent('checklist_action', { action: 'edit' })"
                />
                <button
                  v-tooltip:top="t('computeDateTooltip')"
                  class="btn btn-outline-secondary btn-icon"
                  type="button"
                  :aria-label="t('computeDateTooltip')"
                  @click="computeDateFromSightings"
                >
                  <i class="bi bi-arrow-repeat" aria-hidden="true"></i>
                </button>
              </div>
            </div>
            <div class="col-lg-3 col-sm-6">
              <label class="form-label">{{ t("observers") }}</label>
              <input
                v-model.number="selectedFormModel.number_observer"
                class="form-control"
                :class="requiredNumberStateClass(selectedForm.number_observer, 1, 100)"
                type="number"
                min="1"
                max="100"
                step="1"
                @change="trackEvent('checklist_action', { action: 'edit' })"
              />
            </div>
            <div class="col-lg-3 col-sm-6">
              <label class="form-label">{{ t("time") }}</label>
              <div class="input-group">
                <input
                  v-model="selectedFormModel.time"
                  class="form-control"
                  :class="requiredTimeStateClass(selectedForm.time)"
                  type="time"
                  step="60"
                  @change="trackEvent('checklist_action', { action: 'edit' })"
                />
                <button
                  v-tooltip:top="t('computeTimeTooltip')"
                  class="btn btn-outline-secondary btn-icon"
                  type="button"
                  :aria-label="t('computeTimeTooltip')"
                  @click="computeTimeFromSightings"
                >
                  <i class="bi bi-arrow-repeat" aria-hidden="true"></i>
                </button>
              </div>
            </div>
            <div class="col-lg-3 col-sm-6">
              <label class="form-label">{{ t("durationMinutes") }}</label>
              <div class="input-group">
                <input
                  v-model.number="selectedFormModel.duration"
                  class="form-control"
                  :class="requiredNumberStateClass(selectedForm.duration, 1, 1440)"
                  type="number"
                  min="1"
                  max="1440"
                  @change="trackEvent('checklist_action', { action: 'edit' })"
                />
                <button
                  v-tooltip:top="t('computeDurationTooltip')"
                  class="btn btn-outline-secondary btn-icon"
                  type="button"
                  :aria-label="t('computeDurationTooltip')"
                  @click="computeDurationFromSightings"
                >
                  <i class="bi bi-arrow-repeat" aria-hidden="true"></i>
                </button>
              </div>
            </div>
            <div class="col-lg-3 col-sm-6">
              <label class="form-label">{{ t("checklistDistance") }}</label>
              <div class="input-group">
                <input
                  v-model.number="selectedFormModel.distance"
                  class="form-control"
                  :class="requiredNumberStateClass(selectedForm.distance, 0, 80)"
                  type="number"
                  min="0"
                  max="80"
                  step="0.1"
                  @change="trackEvent('checklist_action', { action: 'edit' })"
                />
                <button
                  v-tooltip:top="t('drawPathTooltip')"
                  class="btn btn-outline-secondary btn-icon"
                  type="button"
                  :aria-label="t('drawPathTooltip')"
                  @click="startPathDraw"
                >
                  <i class="bi bi-bezier" aria-hidden="true"></i>
                </button>
              </div>
              <p v-if="selectedForm.path" class="small text-muted mt-1 mb-0">
                {{ t("uniqueDistanceHelp") }}
              </p>
            </div>
            <div class="col-lg-3 col-sm-12">
              <div class="d-flex align-items-center gap-2">
                <label class="form-label mb-0">{{ t("effort") }}</label>
                <a
                  v-tooltip:top="'eBird effort help'"
                  href="https://support.ebird.org/en/support/solutions/articles/48000967748-birding-as-your-primary-purpose-and-complete-checklists"
                  target="_blank"
                  rel="noopener"
                  class="d-inline-flex align-items-center text-primary text-decoration-none"
                  aria-label="eBird effort help"
                >
                  <i class="bi bi-question-circle-fill" aria-hidden="true"></i>
                </a>
              </div>
              <div class="form-check form-switch mb-0">
                <input
                  id="primary-purpose"
                  v-model="selectedFormModel.primary_purpose"
                  class="form-check-input"
                  type="checkbox"
                  @change="trackEvent('checklist_action', { action: 'edit' })"
                />
                <label class="form-check-label" for="primary-purpose">{{
                  t("primaryPurpose")
                }}</label>
              </div>
              <div class="form-check form-switch mb-0">
                <input
                  id="complete-checklist"
                  v-model="selectedFormModel.full_form"
                  class="form-check-input"
                  type="checkbox"
                  @change="trackEvent('checklist_action', { action: 'edit' })"
                />
                <label class="form-check-label" for="complete-checklist">{{
                  t("completeChecklist")
                }}</label>
              </div>
            </div>
          </div>

          <div class="row g-3 mt-1">
            <div :class="showStaticMapPanel ? 'col-xl-8 col-lg-7' : 'col-12'">
              <ReviewMap
                ref="reviewMap"
                :form="selectedForm"
                :sightings="selectedSightings"
                :base-layer="assignmentMapBaseLayer"
                @update:base-layer="emit('update:assignmentMapBaseLayer', $event)"
                @move-form="moveChecklist"
                @path="updatePath"
                @use-hotspot="useHotspot"
              />
            </div>
            <div v-if="showStaticMapPanel" class="col-xl-4 col-lg-5">
              <article class="card h-100 static-map-preview-card">
                <div class="card-body p-3">
                  <div class="d-flex align-items-center justify-content-between gap-2 mb-3">
                    <h3 class="h6 mb-0">{{ t("staticMapPreviewTitle") }}</h3>
                  </div>

                  <div class="form-check form-switch mb-3">
                    <input
                      id="include-static-map"
                      v-model="selectedFormModel.include_static_map"
                      class="form-check-input"
                      type="checkbox"
                      @change="trackEvent('checklist_action', { action: 'edit' })"
                    />
                    <label class="form-check-label" for="include-static-map">
                      {{ t("staticMapChecklistEnabled") }}
                    </label>
                  </div>

                  <div v-if="staticMapPreview.url" class="d-block">
                    <img
                      class="img-fluid rounded border static-map-preview-image"
                      :src="staticMapPreview.url"
                      :alt="t('staticMapPreviewAlt')"
                    />
                  </div>
                  <div
                    v-else-if="staticMapPreview.reason !== 'disabled'"
                    class="alert alert-warning small mb-0"
                  >
                    <span v-if="staticMapPreview.reason === 'token_missing'">
                      {{ t("staticMapPreviewTokenMissing") }}
                    </span>
                    <span v-else-if="staticMapPreview.reason === 'url_too_long'">
                      {{ t("staticMapPreviewTooLarge") }}
                    </span>
                    <span v-else>
                      {{ t("staticMapPreviewUnavailable") }}
                    </span>
                  </div>

                  <div
                    class="static-map-preview-controls mt-3"
                    :class="{
                      'static-map-preview-controls-with-zoom':
                        selectedForm.static_map_zoom_mode === 'manual',
                    }"
                  >
                    <div class="static-map-preview-control">
                      <label class="form-label mb-1">{{ t("staticMapZoomMode") }}</label>
                      <select
                        v-model="selectedFormModel.static_map_zoom_mode"
                        class="form-select form-select-sm"
                        @change="trackEvent('checklist_action', { action: 'edit' })"
                      >
                        <option value="auto">{{ t("staticMapZoomModeAuto") }}</option>
                        <option value="manual">{{ t("staticMapZoomModeManual") }}</option>
                      </select>
                    </div>

                    <div
                      v-if="selectedForm.static_map_zoom_mode === 'manual'"
                      class="static-map-preview-control static-map-preview-control-zoom"
                    >
                      <label class="form-label mb-1">{{ t("staticMapZoom") }}</label>
                      <input
                        v-model.number="selectedFormModel.static_map_zoom"
                        class="form-control form-control-sm"
                        type="number"
                        min="0"
                        max="22"
                        step="0.5"
                        @change="trackEvent('checklist_action', { action: 'edit' })"
                      />
                    </div>
                  </div>
                  <p
                    v-if="selectedForm.static_map_zoom_mode === 'manual'"
                    class="small text-body-secondary mt-2 mb-0 static-map-preview-note"
                  >
                    {{ t("staticMapCenterHint") }}
                  </p>
                </div>
              </article>
            </div>
          </div>
        </section>
      </div>
    </section>

    <div
      v-if="observationsModalOpen && selectedForm"
      class="modal-backdrop d-grid p-3 overflow-x-hidden"
      @click.self="observationsModalOpen = false"
    >
      <section class="modal-panel card border-0 shadow d-flex flex-column overflow-hidden">
        <div class="card-body modal-body-shell d-flex flex-column flex-grow-1 p-4">
          <div class="d-flex flex-shrink-0 justify-content-between align-items-center mb-3">
            <h2 class="modal-title-heading">
              <i class="bi bi-list-ul" aria-hidden="true"></i>
              <span>{{ t("checklistObservationsTitle") }}</span>
            </h2>
            <button
              class="btn btn-outline-secondary btn-sm"
              type="button"
              @click="observationsModalOpen = false"
            >
              {{ t("close") }}
            </button>
          </div>

          <div class="modal-content-scroll flex-grow-1 overflow-x-hidden overflow-y-auto">
            <div
              class="d-flex flex-column flex-md-row align-items-md-center justify-content-between gap-2 mb-3"
            >
              <div class="fw-semibold">
                {{ selectedReviewOption?.label || selectedForm.location_name }}
              </div>
              <div class="badge bg-secondary">
                {{ t("checklistObservationCount", selectedSightings.length) }}
              </div>
            </div>

            <p v-if="selectedSightings.length === 0" class="text-muted mb-0">
              {{ t("checklistObservationsEmpty") }}
            </p>
            <div v-else class="table-responsive checklist-observations-table">
              <table class="table table-sm align-middle mb-0">
                <thead>
                  <tr>
                    <th class="text-nowrap">{{ t("observationTableCount") }}</th>
                    <th>{{ t("observationTableSpecies") }}</th>
                    <th>{{ t("observationTableSpeciesComment") }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="row in checklistObservationRows"
                    :key="`${row.common_name}-${row.sightings[0]?.id || row.count}`"
                  >
                    <td class="text-nowrap">{{ row.count }}</td>
                    <td>{{ row.common_name || t("observationTableMissingSpecies") }}</td>
                    <!-- eslint-disable-next-line vue/no-v-html -- built from escaped data, see templateSighting() -->
                    <td class="checklist-observations-comment" v-html="row.species_comment"></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

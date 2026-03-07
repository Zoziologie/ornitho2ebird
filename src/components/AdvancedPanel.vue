<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import L from "leaflet";
import "leaflet-draw/dist/leaflet.draw-src.js";
import markerColors from "/data/marker_color.json";
import {
  applyDefaultAutomaticAssignment,
  buildChecklistPayloadFromSightings,
  buildForm,
  distanceFromPath,
  protocol,
} from "../lib/utils";

const props = defineProps({
  forms: { type: Array, required: true },
  sightings: { type: Array, required: true },
  formsSightings: { type: Array, required: true },
  selectedFormId: { type: Number, default: null },
  defaultSpeciesCommentTemplate: { type: Object, required: true },
  defaultNumberObserver: { type: Number, default: 1 },
  defaultAssignDuration: { type: Number, default: 24 },
  defaultAssignDistance: { type: Number, default: 3 },
});

const emit = defineEmits(["update:selectedFormId", "open-info"]);
const { t } = useI18n();

const assignDuration = ref(props.defaultAssignDuration || 1);
const assignDistance = ref(props.defaultAssignDistance || 3);
const assignFormId = ref(0);
const creatingChecklist = ref(false);
const assignmentMapElement = ref(null);
const reviewMapElement = ref(null);
const assignSelectorOpen = ref(false);
const reviewSelectorOpen = ref(false);
const assignSelectorRef = ref(null);
const reviewSelectorRef = ref(null);

let assignmentMap = null;
let assignmentSightingsLayer = null;
let assignmentFormsLayer = null;
let assignmentDrawRectangle = null;
let assignmentMapHasInitialView = false;

let reviewMap = null;
let reviewSightingsLayer = null;
let reviewMarkerLayer = null;
let reviewPathLayer = null;
let reviewDrawPolyline = null;

const unassignedColor = "#6c757d";
const checklistColors = markerColors.slice(1).filter((color) => color.toLowerCase() !== "#999999");

const selectedForm = computed(() => {
  return props.forms.find((form) => form.id === props.selectedFormId) || null;
});

const selectedSightings = computed(() => {
  if (!selectedForm.value) {
    return [];
  }

  return selectedForm.value.imported
    ? props.formsSightings[selectedForm.value.id - 1] || []
    : props.sightings.filter((sighting) => sighting.form_id === selectedForm.value.id);
});

const unassignedSightings = computed(() => {
  return props.sightings.filter((sighting) => sighting.form_id === 0);
});

const assignableForms = computed(() => {
  return props.forms.filter((form) => !form.imported);
});

const assignmentOptions = computed(() => {
  return [
    {
      value: 0,
      label: t("nonAssigned"),
      color: checklistColor(0),
      textClass: optionTextClass(0),
    },
    ...assignableForms.value.map((form) => ({
      value: form.id,
      label: `${form.id}. ${form.location_name}`,
      color: checklistColor(form.id),
      textClass: optionTextClass(form.id),
    })),
  ];
});

const selectedAssignmentOption = computed(() => {
  return assignmentOptions.value.find((option) => option.value === assignFormId.value) || assignmentOptions.value[0];
});

const reviewOptions = computed(() => {
  return props.forms.map((form) => ({
    value: form.id,
    label: `${form.id}. ${form.location_name}`,
    color: checklistColor(form.id),
  }));
});

const selectedReviewOption = computed(() => {
  return reviewOptions.value.find((option) => option.value === props.selectedFormId) || reviewOptions.value[0] || null;
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
  return new Set(selectedSightings.value.filter((sighting) => sighting.date).map((sighting) => sighting.date))
    .size > 1;
});

const selectedProtocol = computed(() => {
  return selectedForm.value ? protocol(selectedForm.value) : null;
});

const isInvalid = computed(() => {
  return selectedProtocol.value?.name === "Invalid";
});

function protocolBadgeClass(form) {
  const state = protocol(form);
  return {
    danger: "bg-danger",
    warning: "bg-warning text-dark",
    success: "bg-success",
  }[state.variant] || "bg-secondary";
}

function checklistColor(formId) {
  if (Number(formId) === 0) {
    return unassignedColor;
  }

  return checklistColors[((Number(formId) - 1) % checklistColors.length + checklistColors.length) % checklistColors.length];
}

function optionTextClass(formId) {
  return checklistColor(formId) === "#ffff33" ? "text-dark" : "";
}

function checklistMarkerHtml(formId) {
  const color = checklistColor(formId);
  const textColor = color === "#ffff33" ? "#212529" : "#ffffff";
  return `<span style="background:${color};color:${textColor};border-color:${color}">${formId}</span>`;
}

function selectStyle(formId) {
  return {
    borderColor: "#ced4da",
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

function requiredStateClass(value) {
  return String(value || "").trim() ? "is-valid" : "is-invalid";
}

function optionalNumberStateClass(value, min, max) {
  if (value === "" || value === null || value === undefined) {
    return "";
  }

  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? "is-valid" : "is-invalid";
}

function optionalTimeStateClass(value) {
  if (!value) {
    return "";
  }

  return /^\d{2}:\d{2}$/.test(value) ? "is-valid" : "is-invalid";
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

  selectedForm.value.date = earliestSighting()?.date || "";
}

function computeTimeFromSightings() {
  if (!selectedForm.value) {
    return;
  }

  selectedForm.value.time = earliestTimedSighting()?.time || "";
}

function computeDurationFromSightings() {
  if (!selectedForm.value) {
    return;
  }

  selectedForm.value.duration = computedDuration.value || "";
}

function applyObserversToEmpty() {
  if (!selectedForm.value) {
    return;
  }

  const targetForms = props.forms.filter(
    (form) => form.id !== selectedForm.value.id && !(Number(form.number_observer) > 0)
  );

  if (!targetForms.length) {
    window.alert(t("applyObserversNone"));
    return;
  }

  if (
    !window.confirm(
      t("applyObserversConfirm", {
        count: targetForms.length,
        value: selectedForm.value.number_observer,
      })
    )
  ) {
    return;
  }

  targetForms.forEach((form) => {
    form.number_observer = selectedForm.value.number_observer;
  });
}

function focusReviewMap() {
  if (!reviewMap || !selectedForm.value) {
    return;
  }

  reviewMapElement.value?.scrollIntoView({ behavior: "smooth", block: "center" });
  reviewMap.flyTo([selectedForm.value.lat, selectedForm.value.lon], Math.max(reviewMap.getZoom(), 13));
}

function startPathDraw() {
  if (!reviewDrawPolyline) {
    return;
  }

  reviewDrawPolyline.enable();
}

function updatePath(path) {
  if (!selectedForm.value) {
    return;
  }

  const newDistance = distanceFromPath(path);
  const currentDistance = Array.isArray(selectedForm.value.path)
    ? distanceFromPath(selectedForm.value.path)
    : null;

  const confirmed = window.confirm(
    currentDistance !== null
      ? t("updatePathConfirmReplace", { previous: currentDistance, next: newDistance })
      : t("updatePathConfirm", { next: newDistance })
  );

  if (!confirmed) {
    return;
  }

  selectedForm.value.path = path;
  selectedForm.value.distance = newDistance;
  refreshReviewMap();
}

function startRectangleDraw(mode) {
  if (!assignmentDrawRectangle) {
    return;
  }

  creatingChecklist.value = mode === "create";
  assignmentDrawRectangle.enable();
}

function selectAssignmentForm(value) {
  assignFormId.value = value;
  assignSelectorOpen.value = false;
}

function selectReviewForm(value) {
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
  () => props.forms,
  (forms) => {
    if (!forms.length) {
      return;
    }

    const stillExists = forms.some((form) => form.id === props.selectedFormId);
    if (!stillExists) {
      emit("update:selectedFormId", forms[0].id);
    }
  },
  { immediate: true, deep: true }
);

watch(
  () => props.selectedFormId,
  (value) => {
    assignFormId.value = assignableForms.value.some((form) => form.id === value) ? value : 0;
    nextTick(() => refreshReviewMap());
  },
  { immediate: true }
);

watch(
  () => props.defaultAssignDuration,
  (value) => {
    if (value > 0) {
      assignDuration.value = value;
    }
  }
);

watch(
  () => props.defaultAssignDistance,
  (value) => {
    if (value > 0) {
      assignDistance.value = value;
    }
  }
);

watch(
  () => [props.sightings, props.forms],
  async () => {
    await nextTick();
    refreshAssignmentMap();
    refreshReviewMap();
  },
  { deep: true }
);

function buildNewChecklist(payload) {
  const nextId = Math.max(0, ...props.forms.map((form) => form.id)) + 1;
  const form = buildForm(
    {
      ...payload,
      imported: false,
      exportable: true,
      species_comment_template: structuredClone(props.defaultSpeciesCommentTemplate),
      primary_purpose: true,
      full_form: false,
    },
    nextId,
    { defaultNumberObserver: props.defaultNumberObserver }
  );
  props.forms.push(form);
  emit("update:selectedFormId", form.id);
  assignFormId.value = form.id;
  return form;
}

function createChecklistFromSightings(targetSightings) {
  if (!targetSightings.length) {
    return null;
  }

  return buildNewChecklist(buildChecklistPayloadFromSightings(targetSightings) || {});
}

function assignClean() {
  const usedFormIds = new Set(props.sightings.map((sighting) => sighting.form_id).filter((id) => id > 0));
  for (let index = props.forms.length - 1; index >= 0; index -= 1) {
    const form = props.forms[index];
    if (!form.imported && !usedFormIds.has(form.id)) {
      props.forms.splice(index, 1);
    }
  }
}

function assignReset() {
  if (!window.confirm(t("assignResetConfirm"))) {
    return;
  }

  props.sightings.forEach((sighting) => {
    sighting.form_id = 0;
  });

  for (let index = props.forms.length - 1; index >= 0; index -= 1) {
    if (!props.forms[index].imported) {
      props.forms.splice(index, 1);
    }
  }

  assignFormId.value = 0;
  emit("update:selectedFormId", props.forms[0]?.id || null);
}

function assignMagic() {
  if (assignDuration.value > 24) {
    window.alert(t("assignDurationTooLong"));
    return;
  }

  if (assignDistance.value > 10 && assignDistance.value < 80) {
    if (!window.confirm(t("assignDistanceLongConfirm"))) {
      return;
    }
  } else if (assignDistance.value >= 80) {
    window.alert(t("assignDistanceTooLong"));
    return;
  }

  const availableSightings = unassignedSightings.value;
  if (!availableSightings.length) {
    window.alert(t("assignNoSightings"));
    return;
  }

  applyDefaultAutomaticAssignment({
    forms: props.forms,
    sightings: props.sightings,
    autoAssignDuration: assignDuration.value,
    autoAssignDistance: assignDistance.value,
    defaultNumberObserver: props.defaultNumberObserver,
    speciesCommentTemplate: props.defaultSpeciesCommentTemplate,
  });
}

function onAssignmentDrawCreated(event) {
  if (event.layerType !== "rectangle") {
    return;
  }

  const bounds = event.layer.getBounds();
  const matchedSightings = props.sightings.filter((sighting) =>
    bounds.contains(L.latLng(sighting.lat, sighting.lon))
  );

  if (!matchedSightings.length) {
    creatingChecklist.value = false;
    window.alert(t("assignNoSightingsInSelection"));
    return;
  }

  if (event.layer && assignmentMap?.hasLayer(event.layer)) {
    assignmentMap.removeLayer(event.layer);
  }

  if (creatingChecklist.value) {
    const newForm = createChecklistFromSightings(matchedSightings);
    if (newForm) {
      matchedSightings.forEach((sighting) => {
        sighting.form_id = newForm.id;
      });
    }
  } else {
    matchedSightings.forEach((sighting) => {
      sighting.form_id = assignFormId.value;
    });
  }

  creatingChecklist.value = false;
}

function markerColor(formId) {
  return checklistColor(formId);
}

function refreshAssignmentMap({ refit = false } = {}) {
  if (!assignmentMap || !assignmentSightingsLayer || !assignmentFormsLayer) {
    return;
  }

  assignmentSightingsLayer.clearLayers();
  assignmentFormsLayer.clearLayers();

  props.sightings.forEach((sighting) => {
    const marker = L.circleMarker([sighting.lat, sighting.lon], {
      radius: 8,
      color: markerColor(sighting.form_id),
      fillColor: markerColor(sighting.form_id),
      fillOpacity: 0.85,
      weight: 1,
    });
    marker.bindPopup(
      `<strong>${sighting.common_name || t("records")}</strong><br>${sighting.location_name}<br>${sighting.date} ${sighting.time || ""}`
    );
    assignmentSightingsLayer.addLayer(marker);
  });

  props.forms
    .filter((form) => !form.imported)
    .forEach((form) => {
      const marker = L.marker([form.lat, form.lon], {
        draggable: true,
        icon: L.divIcon({
          className: "assignment-checklist-icon",
          html: checklistMarkerHtml(form.id),
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        }),
      });
      marker.on("click", () => {
        assignFormId.value = form.id;
        emit("update:selectedFormId", form.id);
      });
      marker.on("dragend", (drawEvent) => {
        const latlng = drawEvent.target.getLatLng();
        form.lat = latlng.lat;
        form.lon = latlng.lng;
      });
      assignmentFormsLayer.addLayer(marker);
    });

  const points = [
    ...props.sightings.map((sighting) => [sighting.lat, sighting.lon]),
    ...props.forms.filter((form) => !form.imported).map((form) => [form.lat, form.lon]),
  ];
  if (points.length && (refit || !assignmentMapHasInitialView)) {
    assignmentMap.fitBounds(points, { padding: [20, 20], maxZoom: 12 });
    assignmentMapHasInitialView = true;
  }
}

function initializeAssignmentMap() {
  if (assignmentMap || !assignmentMapElement.value) {
    return;
  }

  assignmentMap = L.map(assignmentMapElement.value);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors",
  }).addTo(assignmentMap);

  assignmentSightingsLayer = L.layerGroup().addTo(assignmentMap);
  assignmentFormsLayer = L.layerGroup().addTo(assignmentMap);

  assignmentDrawRectangle = new L.Draw.Rectangle(assignmentMap, {
    repeatMode: false,
    shapeOptions: {
      color: "#0d6efd",
      weight: 2,
    },
  });

  assignmentMap.on(L.Draw.Event.CREATED, onAssignmentDrawCreated);
  refreshAssignmentMap({ refit: true });
  setTimeout(() => assignmentMap?.invalidateSize(), 100);
}

function refreshReviewMap() {
  if (!reviewMap || !selectedForm.value || !reviewSightingsLayer || !reviewMarkerLayer || !reviewPathLayer) {
    return;
  }

  reviewSightingsLayer.clearLayers();
  reviewMarkerLayer.clearLayers();
  reviewPathLayer.clearLayers();

  selectedSightings.value.forEach((sighting) => {
    const marker = L.circleMarker([sighting.lat, sighting.lon], {
      radius: 8,
      color: markerColor(sighting.form_id),
      fillColor: markerColor(sighting.form_id),
      fillOpacity: 0.85,
      weight: 1,
    });
    marker.bindPopup(
      `<strong>${sighting.common_name || t("records")}</strong><br>${sighting.location_name}<br>${sighting.date} ${sighting.time || ""}`
    );
    reviewSightingsLayer.addLayer(marker);
  });

  const checklistMarker = L.marker([selectedForm.value.lat, selectedForm.value.lon], {
    draggable: true,
        icon: L.divIcon({
          className: "assignment-checklist-icon",
          html: checklistMarkerHtml(selectedForm.value.id),
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        }),
  });
  checklistMarker.on("dragend", (drawEvent) => {
    const latlng = drawEvent.target.getLatLng();
    selectedForm.value.lat = latlng.lat;
    selectedForm.value.lon = latlng.lng;
  });
  reviewMarkerLayer.addLayer(checklistMarker);

  if (Array.isArray(selectedForm.value.path) && selectedForm.value.path.length > 1) {
    reviewPathLayer.addLayer(
      L.polyline(selectedForm.value.path, {
        color: "#8b5e3c",
        weight: 4,
      })
    );
  }

  const points = [
    ...selectedSightings.value.map((sighting) => [sighting.lat, sighting.lon]),
    [selectedForm.value.lat, selectedForm.value.lon],
    ...((selectedForm.value.path || []).map((point) => [point[0], point[1]])),
  ];

  if (points.length) {
    reviewMap.fitBounds(points, { padding: [20, 20], maxZoom: 13 });
  }
}

function initializeReviewMap() {
  if (reviewMap || !reviewMapElement.value) {
    return;
  }

  reviewMap = L.map(reviewMapElement.value);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors",
  }).addTo(reviewMap);

  reviewSightingsLayer = L.layerGroup().addTo(reviewMap);
  reviewMarkerLayer = L.layerGroup().addTo(reviewMap);
  reviewPathLayer = L.layerGroup().addTo(reviewMap);

  reviewDrawPolyline = new L.Draw.Polyline(reviewMap, {
    repeatMode: false,
    shapeOptions: {
      color: "#8b5e3c",
      weight: 4,
    },
  });

  reviewMap.on(L.Draw.Event.CREATED, (drawEvent) => {
    if (drawEvent.layerType !== "polyline") {
      return;
    }

    const path = drawEvent.layer.getLatLngs().map((latlng) => [latlng.lat, latlng.lng]);
    if (path.length > 1) {
      updatePath(path);
    }
  });

  refreshReviewMap();
  setTimeout(() => reviewMap?.invalidateSize(), 100);
}

watch(
  assignmentMapElement,
  async (value) => {
    if (!value) {
      return;
    }
    await nextTick();
    initializeAssignmentMap();
  },
  { immediate: true }
);

watch(
  reviewMapElement,
  async (value) => {
    if (!value) {
      return;
    }
    await nextTick();
    initializeReviewMap();
  },
  { immediate: true }
);

onBeforeUnmount(() => {
  document.removeEventListener("click", handleDocumentClick);
  if (assignmentMap) {
    assignmentMap.off();
    assignmentMap.remove();
  }
  assignmentMapHasInitialView = false;
  if (reviewMap) {
    reviewMap.off();
    reviewMap.remove();
  }
});

onMounted(() => {
  document.addEventListener("click", handleDocumentClick);
});
</script>

<template>
  <div class="d-flex flex-column gap-3">
    <section class="card border-0 shadow-sm rounded-3">
      <div class="card-body p-3 p-md-4">
        <h2 class="border-bottom pb-2 mb-3">{{ t("assignmentTitle") }}</h2>
        <p class="mb-3">
          {{ t("assignmentIntro") }}
          {{ t("assignmentWarning") }}
        </p>

        <div class="assignment-map-shell mb-3">
          <div
            ref="assignmentMapElement"
            class="assignment-map rounded border"
            :aria-label="t('assignmentMapAria')"
          ></div>

          <div class="assignment-map-controls">
            <button class="btn btn-success w-100 mb-2" type="button" @click="startRectangleDraw('create')">
              {{ t("createChecklist") }}
            </button>
            <div class="input-group mb-2">
              <div ref="assignSelectorRef" class="custom-checklist-select flex-grow-1">
                <button
                  class="custom-checklist-select-toggle"
                  type="button"
                  :style="selectStyle(assignFormId)"
                  @click="assignSelectorOpen = !assignSelectorOpen"
                >
                  <span class="checklist-option-label">
                    <span
                    class="checklist-color-dot"
                      :style="{ backgroundColor: selectedAssignmentOption?.color || checklistColor(0) }"
                    ></span>
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
                      <span class="checklist-color-dot" :style="{ backgroundColor: option.color }"></span>
                      <span>{{ option.label }}</span>
                    </span>
                  </button>
                </div>
              </div>
              <button class="btn btn-primary" type="button" @click="startRectangleDraw('assign')">
                {{ t("assignToChecklist") }}
              </button>
            </div>
            <div class="btn-group w-100">
              <button class="btn btn-outline-warning" type="button" @click="assignClean">
                {{ t("assignCleanShort") }}
              </button>
              <button class="btn btn-outline-danger" type="button" @click="assignReset">
                {{ t("assignResetShort") }}
              </button>
            </div>
          </div>
        </div>

        <div class="p-3 text-white rounded shadow-sm bg-secondary">
          <div class="d-flex align-items-center justify-content-between gap-2 mb-3">
            <h3 class="h5 mb-0">{{ t("assignmentMagicTitle") }}</h3>
            <button class="btn btn-outline-light btn-sm" type="button" @click="emit('open-info')">
              i
            </button>
          </div>
          <div class="row g-2 align-items-end">
            <div class="col-sm-4">
              <label class="form-label">{{ t("assignmentDurationHours") }}</label>
              <input
                v-model.number="assignDuration"
                class="form-control"
                type="number"
                step="0.1"
                min="0.1"
                max="24"
              />
            </div>
            <div class="col-sm-4">
              <label class="form-label">{{ t("assignmentDistanceKm") }}</label>
              <input
                v-model.number="assignDistance"
                class="form-control"
                type="number"
                step="0.1"
                min="0.1"
                max="80"
              />
            </div>
            <div class="col-sm-4">
              <button class="btn btn-primary w-100" type="button" @click="assignMagic">
                {{ t("assignmentMagicAction") }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section class="card border-0 shadow-sm rounded-3">
      <div class="card-body p-3 p-md-4">
        <h2 class="border-bottom pb-2 mb-3">{{ t("advancedTitle") }}</h2>
        <p>{{ t("advancedIntro") }}</p>

        <div v-if="selectedForm" class="row align-items-center g-3 mb-3">
          <div class="col-lg-3 text-center">
            <span class="badge fs-6 px-3 py-2" :class="protocolBadgeClass(selectedForm)">
              {{ selectedProtocol.name.toUpperCase() }}
            </span>
          </div>
          <div class="col-lg-6">
            <div class="input-group input-group-lg">
              <button class="btn btn-outline-secondary" type="button" @click="selectFormByOffset(-1)">
                &lsaquo;
              </button>
              <div ref="reviewSelectorRef" class="custom-checklist-select flex-grow-1">
                <button
                  class="custom-checklist-select-toggle custom-checklist-select-toggle-lg"
                  type="button"
                  :style="selectStyle(selectedFormId ?? 0)"
                  @click="reviewSelectorOpen = !reviewSelectorOpen"
                >
                  <span class="checklist-option-label">
                    <span
                      class="checklist-color-dot"
                      :style="{ backgroundColor: selectedReviewOption?.color || checklistColor(0) }"
                    ></span>
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
                      <span class="checklist-color-dot" :style="{ backgroundColor: option.color }"></span>
                      <span>{{ option.label }}</span>
                    </span>
                  </button>
                </div>
              </div>
              <button class="btn btn-outline-secondary" type="button" @click="selectFormByOffset(1)">
                &rsaquo;
              </button>
            </div>
          </div>
          <div class="col-lg-3">
            <div class="form-check form-switch">
              <input
                id="export-ready"
                v-model="selectedForm.exportable"
                class="form-check-input"
                type="checkbox"
                :disabled="isInvalid"
              />
              <label class="form-check-label" for="export-ready">{{ t("readyForExport") }}</label>
            </div>
          </div>
        </div>

        <div v-if="selectedForm" class="card border">
          <div class="card-body">
            <div v-if="selectedSightings.length === 0 || isInvalid || spansMultipleDays" class="mb-3">
              <div v-if="spansMultipleDays" class="alert alert-danger mb-3">
                <h4 class="alert-heading">{{ t("checklistWarnings") }}</h4>
                <p class="mb-0">{{ t("warningMultipleDays") }}</p>
              </div>
              <div v-if="selectedSightings.length === 0 || isInvalid" class="alert alert-danger mb-0">
                <h4 class="alert-heading">{{ t("checklistWarnings") }}</h4>
                <p v-if="selectedSightings.length === 0">{{ t("warningNoSightings") }}</p>
                <p v-if="isInvalid" class="mb-0">{{ t("warningInvalid") }}</p>
              </div>
            </div>

            <div class="row g-3">
              <div class="col-lg-5 col-sm-6">
                <label class="form-label">{{ t("locationName") }}</label>
                <div class="input-group">
                  <input
                    v-model="selectedForm.location_name"
                    class="form-control"
                    :class="requiredStateClass(selectedForm.location_name)"
                    type="text"
                  />
                  <button class="btn btn-outline-secondary" type="button" @click="focusReviewMap">
                    {{ t("mapButtonLabel") }}
                  </button>
                </div>
              </div>
              <div class="col-lg-4 col-sm-6">
                <label class="form-label">{{ t("date") }}</label>
                <div class="input-group">
                  <input
                    v-model="selectedForm.date"
                    class="form-control"
                    :class="requiredStateClass(selectedForm.date)"
                    type="date"
                  />
                  <button class="btn btn-outline-secondary" type="button" @click="computeDateFromSightings">
                    {{ t("autoShort") }}
                  </button>
                </div>
              </div>
              <div class="col-lg-3 col-sm-6">
                <label class="form-label">{{ t("observers") }}</label>
                <div class="input-group">
                  <input
                    v-model.number="selectedForm.number_observer"
                    class="form-control"
                    :class="optionalNumberStateClass(selectedForm.number_observer, 1, 100)"
                    type="number"
                    min="1"
                    max="100"
                    step="1"
                  />
                  <button class="btn btn-outline-secondary" type="button" @click="applyObserversToEmpty">
                    {{ t("applyAllShort") }}
                  </button>
                </div>
              </div>
              <div class="col-lg-3 col-sm-6">
                <label class="form-label">{{ t("time") }}</label>
                <div class="input-group">
                  <input
                    v-model="selectedForm.time"
                    class="form-control"
                    :class="optionalTimeStateClass(selectedForm.time)"
                    type="time"
                    step="60"
                  />
                  <button class="btn btn-outline-secondary" type="button" @click="computeTimeFromSightings">
                    {{ t("autoShort") }}
                  </button>
                </div>
              </div>
              <div class="col-lg-3 col-sm-6">
                <label class="form-label">{{ t("durationMinutes") }}</label>
                <div class="input-group">
                  <input
                    v-model.number="selectedForm.duration"
                    class="form-control"
                    :class="optionalNumberStateClass(selectedForm.duration, 1, 1440)"
                    type="number"
                    min="1"
                    max="1440"
                  />
                  <button class="btn btn-outline-secondary" type="button" @click="computeDurationFromSightings">
                    {{ t("autoShort") }}
                  </button>
                </div>
              </div>
              <div class="col-lg-3 col-sm-6">
                <label class="form-label">{{ t("checklistDistance") }}</label>
                <div class="input-group">
                  <input
                    v-model.number="selectedForm.distance"
                    class="form-control"
                    :class="optionalNumberStateClass(selectedForm.distance, 0, 80)"
                    type="number"
                    min="0"
                    max="80"
                    step="0.1"
                  />
                  <button class="btn btn-outline-secondary" type="button" @click="startPathDraw">
                    {{ t("drawPath") }}
                  </button>
                </div>
              </div>
              <div class="col-lg-3 col-sm-12">
                <label class="form-label">{{ t("effort") }}</label>
                <div class="border rounded p-2 h-100 bg-light">
                  <div class="form-check form-switch">
                    <input
                      id="primary-purpose"
                      v-model="selectedForm.primary_purpose"
                      class="form-check-input"
                      type="checkbox"
                    />
                    <label class="form-check-label" for="primary-purpose">{{ t("primaryPurpose") }}</label>
                  </div>
                  <div class="form-check form-switch mt-2">
                    <input
                      id="complete-checklist"
                      v-model="selectedForm.full_form"
                      class="form-check-input"
                      type="checkbox"
                    />
                    <label class="form-check-label" for="complete-checklist">{{ t("completeChecklist") }}</label>
                  </div>
                </div>
              </div>
            </div>

            <div class="row g-3 mt-1">
              <div class="col-lg-8">
                <div class="review-map-shell">
                  <div ref="reviewMapElement" class="review-map rounded border"></div>
                  <div class="review-map-controls">
                    <button class="btn btn-primary btn-sm" type="button" @click="startPathDraw">
                      {{ t("drawPath") }}
                    </button>
                  </div>
                </div>
              </div>
              <div class="col-lg-4">
                <div class="card bg-light h-100">
                  <div class="card-body">
                    <h3 class="h5">{{ t("checklistSummary") }}</h3>
                    <ul class="mb-0 ps-3">
                      <li>{{ selectedSightings.length }} {{ t("records") }}</li>
                      <li>{{ selectedProtocol.name }}</li>
                      <li>{{ selectedForm.lat }}, {{ selectedForm.lon }}</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>

            <div class="mb-3 mt-3">
              <label class="form-label">{{ t("checklistComment") }}</label>
              <textarea v-model="selectedForm.checklist_comment" class="form-control" rows="4" />
            </div>

          </div>
        </div>
      </div>
    </section>
  </div>
</template>

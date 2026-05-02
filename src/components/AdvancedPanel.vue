<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import L from "leaflet";
import "leaflet-draw/dist/leaflet.draw-src.js";
import "leaflet.markercluster/dist/leaflet.markercluster.js";
import "leaflet.markercluster/dist/MarkerCluster.css";
import markerColors from "/data/marker_color.json";
import hotspotMarkerUrl from "../assets/map-marker-hotspot.png";
import {
  addBaseLayerControl,
  buildAssignmentOptions,
  buildReviewOptions,
  checklistColor,
  checklistMarkerHtml,
  escapeHtml,
  formatSightingPopup,
  protocolBadgeClass,
  requiredNumberStateClass,
  requiredStateClass,
  requiredTimeStateClass,
  sightingMarkerHtml,
} from "../lib/advancedPanel";
import {
  applyDefaultAutomaticAssignment,
  buildChecklistPayloadFromSightings,
  buildForm,
  buildSpeciesRows,
  distanceFromPath,
  haversineDistanceKm,
  normalizeLocationName,
  protocol,
} from "../lib/utils";
import { buildStaticMapUrl } from "../lib/staticMap";
import { LOCATION_NAME_MAX_LENGTH } from "../lib/constants";

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

const emit = defineEmits([
  "update:selectedFormId",
  "update:assignmentMapBaseLayer",
  "open-info",
]);
const { t } = useI18n();

const assignDuration = ref(props.defaultAssignDuration || 1);
const assignDistance = ref(props.defaultAssignDistance || 3);
const assignFormId = ref(0);
let creatingChecklist = false;
const assignmentMapShellElement = ref(null);
const assignmentMapElement = ref(null);
const reviewMapElement = ref(null);
const assignSelectorOpen = ref(false);
const reviewSelectorOpen = ref(false);
const assignSelectorRef = ref(null);
const reviewSelectorRef = ref(null);
const observationsModalOpen = ref(false);
const assignmentMapFullscreen = ref(false);

let assignmentMap = null;
let assignmentSightingsLayer = null;
let assignmentFormsLayer = null;
let assignmentBaseLayers = null;
let assignmentActiveBaseLayer = null;
let assignmentMapHasInitialView = false;
let assignmentDrawCaptureEnabled = false;
let assignmentSelectionActive = false;
let assignmentSelectionStart = null;
let assignmentSelectionLayer = null;
let assignmentSelectionDragging = false;
let assignmentClusterPopupLatLng = null;

let reviewMap = null;
let reviewSightingsLayer = null;
let reviewMarkerLayer = null;
let reviewPathLayer = null;
let reviewHotspotLayer = null;
let reviewDrawPolyline = null;

const unassignedColor = "#6c757d";
const checklistColors = markerColors.slice(1).filter((color) => color.toLowerCase() !== "#999999");
const ASSIGNMENT_LOCATION_CLUSTER_DISTANCE_METERS = 5;
const EARTH_CIRCUMFERENCE_METERS = 40075016.686;
const ASSIGNMENT_SIGHTINGS_PANE = "assignmentSightingsPane";
const ASSIGNMENT_CLUSTER_PANE = "assignmentClusterPane";
const ASSIGNMENT_CHECKLIST_PANE = "assignmentChecklistPane";

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
    new Set(
      selectedSightings.value.filter((sighting) => sighting.date).map((sighting) => sighting.date),
    ).size > 1
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

  return buildStaticMapUrl({
    form: selectedForm.value,
    sightings: selectedSightings.value,
    token: props.mapboxToken,
    settings: props.globalStaticMap,
    width: 640,
    height: 420,
  });
});

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

async function loadHotspotsForSelectedForm() {
  if (!selectedForm.value?.lat || !selectedForm.value?.lon) {
    return;
  }

  const hotspotKey = `${Number(selectedForm.value.lat).toFixed(3)},${Number(selectedForm.value.lon).toFixed(3)}`;
  if (selectedForm.value.hotspot_key === hotspotKey && Array.isArray(selectedForm.value.hotspots)) {
    return;
  }

  try {
    const response = await fetch(
      `https://api.ebird.org/v2/ref/hotspot/geo?lat=${selectedForm.value.lat}&lng=${selectedForm.value.lon}&dist=10&fmt=json&key=vcs68p4j67pt`,
    );
    const json = await response.json();
    selectedForm.value.hotspots = Array.isArray(json) ? json : [];
    selectedForm.value.hotspot_key = hotspotKey;
    refreshReviewMap();
  } catch {
    selectedForm.value.hotspots = [];
    selectedForm.value.hotspot_key = hotspotKey;
  }
}

function focusReviewMap() {
  if (!reviewMap || !selectedForm.value) {
    return;
  }

  reviewMapElement.value?.scrollIntoView({ behavior: "smooth", block: "center" });
  reviewMap.flyTo(
    [selectedForm.value.lat, selectedForm.value.lon],
    Math.max(reviewMap.getZoom(), 13),
  );
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
      : t("updatePathConfirm", { next: newDistance }),
  );

  if (!confirmed) {
    return;
  }

  selectedForm.value.path = path;
  selectedForm.value.distance = newDistance;
  refreshReviewMap();
}

function startRectangleDraw(mode) {
  if (!assignmentMap) {
    return;
  }

  creatingChecklist = mode === "create";
  assignmentSelectionActive = true;
  assignmentSelectionStart = null;
  assignmentSelectionDragging = false;
  clearAssignmentSelectionLayer();
  setAssignmentDrawCaptureMode(true);
  setAssignmentSelectionInteraction(true);
}

function stopRectangleDraw() {
  assignmentSelectionActive = false;
  assignmentSelectionStart = null;
  assignmentSelectionDragging = false;
  clearAssignmentSelectionLayer();
  setAssignmentSelectionInteraction(false);
  setAssignmentDrawCaptureMode(false);
  creatingChecklist = false;
}

function clearAssignmentSelectionLayer() {
  if (assignmentSelectionLayer && assignmentMap?.hasLayer(assignmentSelectionLayer)) {
    assignmentMap.removeLayer(assignmentSelectionLayer);
  }
  assignmentSelectionLayer = null;
}

function setAssignmentSelectionInteraction(enabled) {
  if (!assignmentMap) {
    return;
  }

  const container = assignmentMap.getContainer();
  container.style.cursor = enabled ? "crosshair" : "";

  if (enabled) {
    assignmentMap.dragging?.disable();
    assignmentMap.doubleClickZoom?.disable();
  } else {
    assignmentMap.dragging?.enable();
    assignmentMap.doubleClickZoom?.enable();
  }
}

function setAssignmentDrawCaptureMode(enabled) {
  if (!assignmentMap || assignmentDrawCaptureEnabled === enabled) {
    return;
  }

  const markerPane = assignmentMap.getPane("markerPane");
  const overlayPane = assignmentMap.getPane("overlayPane");
  const panePointerEvents = enabled ? "none" : "";

  if (markerPane) {
    markerPane.style.pointerEvents = panePointerEvents;
  }
  if (overlayPane) {
    overlayPane.style.pointerEvents = panePointerEvents;
  }

  assignmentDrawCaptureEnabled = enabled;
}

function updateAssignmentSelectionLayer(bounds) {
  if (!assignmentMap) {
    return;
  }

  if (!assignmentSelectionLayer) {
    assignmentSelectionLayer = L.rectangle(bounds, {
      color: "#0d6efd",
      weight: 2,
      fillOpacity: 0.08,
      interactive: false,
    }).addTo(assignmentMap);
    return;
  }

  assignmentSelectionLayer.setBounds(bounds);
}

function applyAssignmentSelection(bounds) {
  const isCreateMode = creatingChecklist;
  const matchedSightings = props.sightings.filter((sighting) =>
    bounds.contains(L.latLng(sighting.lat, sighting.lon)),
  );

  stopRectangleDraw();

  if (!matchedSightings.length) {
    window.alert(t("assignNoSightingsInSelection"));
    return;
  }

  if (isCreateMode) {
    const newForm = createChecklistFromSightings(matchedSightings);
    if (newForm) {
      matchedSightings.forEach((sighting) => {
        sighting.form_id = newForm.id;
      });
    }
    return;
  }

  matchedSightings.forEach((sighting) => {
    sighting.form_id = assignFormId.value;
  });
}

function onAssignmentSelectionMouseDown(event) {
  if (!assignmentSelectionActive) {
    return;
  }

  const button = event?.originalEvent?.button;
  if (typeof button === "number" && button !== 0) {
    return;
  }

  assignmentSelectionDragging = true;
  assignmentSelectionStart = event.latlng;
  updateAssignmentSelectionLayer(L.latLngBounds(event.latlng, event.latlng));
}

function onAssignmentSelectionMouseMove(event) {
  if (!assignmentSelectionActive || !assignmentSelectionDragging || !assignmentSelectionStart) {
    return;
  }

  updateAssignmentSelectionLayer(L.latLngBounds(assignmentSelectionStart, event.latlng));
}

function onAssignmentSelectionMouseUp(event) {
  if (!assignmentSelectionActive || !assignmentSelectionDragging || !assignmentSelectionStart) {
    return;
  }

  assignmentSelectionDragging = false;
  const startPoint = assignmentMap?.latLngToContainerPoint(assignmentSelectionStart);
  const endPoint = assignmentMap?.latLngToContainerPoint(event.latlng);

  if (!startPoint || !endPoint || startPoint.distanceTo(endPoint) < 4) {
    stopRectangleDraw();
    return;
  }

  applyAssignmentSelection(L.latLngBounds(assignmentSelectionStart, event.latlng));
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

function fullscreenElement() {
  return document.fullscreenElement || document.webkitFullscreenElement || null;
}

function syncAssignmentMapFullscreenState() {
  assignmentMapFullscreen.value = fullscreenElement() === assignmentMapShellElement.value;
  setTimeout(() => assignmentMap?.invalidateSize(), 100);
}

async function toggleAssignmentMapFullscreen() {
  const shell = assignmentMapShellElement.value;
  if (!shell) {
    return;
  }

  try {
    if (fullscreenElement() === shell) {
      if (document.exitFullscreen) {
        await document.exitFullscreen();
      } else {
        document.webkitExitFullscreen?.();
      }
      return;
    }

    if (shell.requestFullscreen) {
      await shell.requestFullscreen();
    } else {
      shell.webkitRequestFullscreen?.();
    }
  } catch {
    syncAssignmentMapFullscreenState();
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
  { immediate: true, deep: true },
);

watch(
  () => props.selectedFormId,
  (value) => {
    assignFormId.value = assignableForms.value.some((form) => form.id === value) ? value : 0;
    nextTick(() => refreshReviewMap());
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

watch(
  () => [props.sightings, props.forms],
  async () => {
    await nextTick();
    refreshAssignmentMap();
    refreshReviewMap();
  },
  { deep: true },
);

watch(
  () => props.assignmentMapBaseLayer,
  (value) => {
    applyAssignmentBaseLayer(value);
  },
);

watch(
  () => selectedForm.value?.location_name,
  (value) => {
    if (!selectedForm.value || typeof value !== "string") {
      return;
    }

    const normalized = normalizeLocationName(value);
    if (normalized !== value) {
      selectedForm.value.location_name = normalized;
    }
  },
);

function buildNewChecklist(payload) {
  const nextId = Math.max(0, ...props.forms.map((form) => form.id)) + 1;
  const speciesCommentTemplate = {
    short: props.defaultSpeciesCommentTemplate?.short || "",
    long: props.defaultSpeciesCommentTemplate?.long || "",
    limit: Number(props.defaultSpeciesCommentTemplate?.limit) || 5,
  };
  const form = buildForm(
    {
      ...payload,
      imported: false,
      exportable: true,
      species_comment_template: speciesCommentTemplate,
      primary_purpose: false,
      full_form: false,
    },
    nextId,
    { defaultNumberObserver: props.defaultNumberObserver },
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
  const usedFormIds = new Set(
    props.sightings.map((sighting) => sighting.form_id).filter((id) => id > 0),
  );
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

function markerColor(formId) {
  return checklistColor(formId, checklistColors, unassignedColor);
}

function assignmentSightingIcon(formId) {
  return L.divIcon({
    className: "assignment-sighting-icon",
    html: sightingMarkerHtml(formId, checklistColors, unassignedColor),
    iconSize: [16, 16],
    iconAnchor: [8, 8],
    popupAnchor: [0, -8],
  });
}

function assignmentClusterIcon(cluster) {
  const formIds = cluster
    .getAllChildMarkers()
    .map((marker) => Number(marker.options.formId))
    .filter((value) => Number.isFinite(value));
  const uniqueFormIds = [...new Set(formIds)];
  const clusterColor =
    uniqueFormIds.length === 1 ? markerColor(uniqueFormIds[0]) : "#89a0b1";
  const clusterTextColor = clusterColor === "#ffff33" ? "#223846" : "#ffffff";

  return L.divIcon({
    className: "assignment-cluster-icon",
    html: `<span class="assignment-cluster-icon-dot" style="background:${clusterColor};color:${clusterTextColor};border-color:${clusterColor}">+</span>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
}

function pixelsForMetersAtZoom(meters, zoom) {
  const latitude = assignmentMap?.getCenter?.().lat || 0;
  const metersPerPixel =
    (EARTH_CIRCUMFERENCE_METERS * Math.cos((latitude * Math.PI) / 180)) / Math.pow(2, zoom + 8);

  if (!Number.isFinite(metersPerPixel) || metersPerPixel <= 0) {
    return 0.01;
  }

  return Math.max(0.01, meters / metersPerPixel);
}

function assignmentSightingsNearLatLng(latlng) {
  return props.sightings
    .filter((sighting) => {
      return (
        haversineDistanceKm(latlng.lat, latlng.lng, Number(sighting.lat), Number(sighting.lon)) * 1000 <=
        ASSIGNMENT_LOCATION_CLUSTER_DISTANCE_METERS
      );
    })
    .sort((left, right) => {
      const leftKey = `${left.date || ""} ${left.time || ""} ${left.common_name || ""}`;
      const rightKey = `${right.date || ""} ${right.time || ""} ${right.common_name || ""}`;
      return leftKey.localeCompare(rightKey);
    });
}

function assignmentClusterPopupContent(latlng) {
  const sameLocationSightings = assignmentSightingsNearLatLng(latlng);
  if (sameLocationSightings.length <= 1) {
    assignmentClusterPopupLatLng = null;
    assignmentMap?.closePopup();
    return null;
  }

  assignmentClusterPopupLatLng = latlng;

  const container = document.createElement("div");
  container.className = "map-popup map-popup-cluster";
  L.DomEvent.disableClickPropagation(container);

  const title = document.createElement("div");
  title.className = "map-popup-heading";
  title.textContent = t("assignmentClusterTitle", { count: sameLocationSightings.length });
  container.appendChild(title);

  const list = document.createElement("div");
  list.className = "map-popup-stack";

  sameLocationSightings.forEach((sighting) => {
    const row = document.createElement("div");
    row.className = "map-popup-card";

    const details = document.createElement("div");
    details.className = "map-popup-card-body";

    const species = document.createElement("div");
    species.className = "map-popup-card-title";
    if (sighting.common_name || sighting.scientific_name) {
      if (sighting.common_name) {
        species.appendChild(document.createTextNode(sighting.common_name));
      }
      if (sighting.scientific_name) {
        if (sighting.common_name) {
          species.appendChild(document.createTextNode(" "));
        }
        const scientificName = document.createElement("span");
        scientificName.className = "map-popup-species-scientific";
        scientificName.textContent = sighting.scientific_name;
        species.appendChild(scientificName);
      }
    } else {
      species.textContent = t("records");
    }
    details.appendChild(species);

    const meta = document.createElement("div");
    meta.className = "map-popup-compact-meta";

    const datetimeValue = document.createElement("span");
    datetimeValue.className = "map-popup-compact-item";
    datetimeValue.textContent = [sighting.date, sighting.time].filter(Boolean).join(" ") || "—";
    meta.appendChild(datetimeValue);

    const countValue = document.createElement("span");
    countValue.className = "map-popup-compact-item";
    const countParts = [sighting.count_precision, sighting.count].filter(
      (value) => value !== null && value !== ""
    );
    countValue.textContent = countParts.length ? countParts.join("") : "—";
    meta.appendChild(countValue);

    const permalinkValue = document.createElement("span");
    permalinkValue.className = "map-popup-compact-item";
    if (sighting.permalink) {
      const permalink = document.createElement("a");
      permalink.href = sighting.permalink;
      permalink.target = "_blank";
      permalink.rel = "noopener";
      permalink.textContent = String(sighting.id ?? "—");
      permalinkValue.appendChild(permalink);
    } else {
      permalinkValue.textContent = String(sighting.id ?? "—");
    }
    meta.appendChild(permalinkValue);

    details.appendChild(meta);

    const select = document.createElement("select");
    select.className = "form-select form-select-sm map-popup-select";
    clusterAssignmentOptions.value.forEach((option) => {
      const optionElement = document.createElement("option");
      optionElement.value = String(option.value);
      optionElement.textContent = option.label;
      optionElement.selected = Number(option.value) === Number(sighting.form_id);
      select.appendChild(optionElement);
    });
    select.addEventListener("change", (event) => {
      sighting.form_id = Number(event.target.value);
      refreshAssignmentMap();
      openAssignmentClusterPopup(latlng);
    });
    details.appendChild(select);

    row.appendChild(details);

    list.appendChild(row);
  });

  container.appendChild(list);
  return container;
}

function openAssignmentClusterPopup(latlng) {
  if (!assignmentMap) {
    return;
  }

  const content = assignmentClusterPopupContent(latlng);
  if (!content) {
    return;
  }

  L.popup({ maxWidth: 420 })
    .setLatLng(latlng)
    .setContent(content)
    .openOn(assignmentMap);
}

function onAssignmentClusterClick(event) {
  openAssignmentClusterPopup(event.layer.getLatLng());
}

function createAssignmentSightingsLayer() {
  if (!assignmentMap) {
    return null;
  }

  if (assignmentSightingsLayer && assignmentMap.hasLayer(assignmentSightingsLayer)) {
    assignmentMap.removeLayer(assignmentSightingsLayer);
  }

  assignmentSightingsLayer = L.markerClusterGroup({
    maxClusterRadius: (zoom) =>
      pixelsForMetersAtZoom(ASSIGNMENT_LOCATION_CLUSTER_DISTANCE_METERS, zoom),
    chunkedLoading: true,
    zoomToBoundsOnClick: false,
    spiderfyOnMaxZoom: true,
    showCoverageOnHover: false,
    clusterPane: ASSIGNMENT_CLUSTER_PANE,
    iconCreateFunction: assignmentClusterIcon,
  });
  assignmentSightingsLayer.on("clusterclick", onAssignmentClusterClick);

  assignmentSightingsLayer.addTo(assignmentMap);
  return assignmentSightingsLayer;
}

function applyAssignmentBaseLayer(layerName) {
  if (!assignmentMap || !assignmentBaseLayers) {
    return;
  }

  const nextLayer = assignmentBaseLayers[layerName] || assignmentBaseLayers.OpenStreetMap;
  if (!nextLayer || assignmentActiveBaseLayer === nextLayer) {
    return;
  }

  if (assignmentActiveBaseLayer && assignmentMap.hasLayer(assignmentActiveBaseLayer)) {
    assignmentMap.removeLayer(assignmentActiveBaseLayer);
  }

  nextLayer.addTo(assignmentMap);
  assignmentActiveBaseLayer = nextLayer;
}

function rebuildAssignmentSightingsLayer() {
  if (!assignmentMap) {
    return;
  }

  createAssignmentSightingsLayer();
  refreshAssignmentMap();
}

function hotspotPopupContent(hotspot) {
  const container = document.createElement("div");
  container.className = "map-popup";

  const title = document.createElement("a");
  title.href = `https://ebird.org/hotspot/${hotspot.locId}`;
  title.target = "_blank";
  title.rel = "noopener";
  title.className = "fw-semibold d-inline-block mb-2";
  title.textContent = hotspot.locName;
  container.appendChild(title);

  const species = document.createElement("div");
  species.innerHTML = `<strong>${t("hotspotSpeciesCount")}:</strong> ${escapeHtml(hotspot.numSpeciesAllTime ?? "—")}`;
  container.appendChild(species);

  const latest = document.createElement("div");
  latest.innerHTML = `<strong>${t("hotspotLatestChecklist")}:</strong> ${escapeHtml(hotspot.latestObsDt ?? "—")}`;
  container.appendChild(latest);

  const button = document.createElement("button");
  button.type = "button";
  button.className = "btn btn-primary btn-sm mt-2";
  button.textContent = t("useHotspotLocation");
  button.addEventListener("click", () => {
    if (!selectedForm.value) {
      return;
    }

    selectedForm.value.location_name = hotspot.locName;
    selectedForm.value.lat = hotspot.lat;
    selectedForm.value.lon = hotspot.lng;
    selectedForm.value.hotspot_key = "";
    reviewMap?.closePopup();
    loadHotspotsForSelectedForm();
    refreshReviewMap();
  });
  container.appendChild(button);

  return container;
}

function refreshAssignmentMap({ refit = false } = {}) {
  if (!assignmentMap || !assignmentSightingsLayer || !assignmentFormsLayer) {
    return;
  }

  assignmentSightingsLayer.clearLayers();
  assignmentFormsLayer.clearLayers();

  props.sightings.forEach((sighting) => {
    const marker = L.marker([sighting.lat, sighting.lon], {
      formId: sighting.form_id,
      pane: ASSIGNMENT_SIGHTINGS_PANE,
      icon: assignmentSightingIcon(sighting.form_id),
    });
    marker.bindPopup(formatSightingPopup(sighting, t));
    assignmentSightingsLayer.addLayer(marker);
  });

  props.forms
    .filter((form) => !form.imported)
    .forEach((form) => {
      const marker = L.marker([form.lat, form.lon], {
        draggable: true,
        pane: ASSIGNMENT_CHECKLIST_PANE,
        icon: L.divIcon({
          className: "assignment-checklist-icon",
          html: checklistMarkerHtml(form.id, checklistColors, unassignedColor),
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
  const assignmentLayerControl = addBaseLayerControl(assignmentMap, props.assignmentMapBaseLayer);
  assignmentBaseLayers = assignmentLayerControl.baseLayers;
  assignmentActiveBaseLayer = assignmentLayerControl.activeLayer;
  assignmentMap.createPane(ASSIGNMENT_SIGHTINGS_PANE);
  assignmentMap.getPane(ASSIGNMENT_SIGHTINGS_PANE).style.zIndex = "610";
  assignmentMap.createPane(ASSIGNMENT_CLUSTER_PANE);
  assignmentMap.getPane(ASSIGNMENT_CLUSTER_PANE).style.zIndex = "620";
  assignmentMap.createPane(ASSIGNMENT_CHECKLIST_PANE);
  assignmentMap.getPane(ASSIGNMENT_CHECKLIST_PANE).style.zIndex = "650";

  createAssignmentSightingsLayer();
  assignmentFormsLayer = L.layerGroup().addTo(assignmentMap);

  assignmentMap.on("mousedown", onAssignmentSelectionMouseDown);
  assignmentMap.on("mousemove", onAssignmentSelectionMouseMove);
  assignmentMap.on("mouseup", onAssignmentSelectionMouseUp);
  assignmentMap.on("popupclose", () => {
    assignmentClusterPopupLatLng = null;
  });
  assignmentMap.on("baselayerchange", (event) => {
    assignmentActiveBaseLayer = event.layer;
    emit("update:assignmentMapBaseLayer", event.name);
  });
  refreshAssignmentMap({ refit: true });
  setTimeout(() => assignmentMap?.invalidateSize(), 100);
}

function refreshReviewMap() {
  if (
    !reviewMap ||
    !selectedForm.value ||
    !reviewSightingsLayer ||
    !reviewMarkerLayer ||
    !reviewPathLayer
  ) {
    return;
  }

  reviewSightingsLayer.clearLayers();
  reviewMarkerLayer.clearLayers();
  reviewPathLayer.clearLayers();
  reviewHotspotLayer?.clearLayers();

  selectedSightings.value.forEach((sighting) => {
    const marker = L.circleMarker([sighting.lat, sighting.lon], {
      radius: 8,
      color: markerColor(sighting.form_id),
      fillColor: markerColor(sighting.form_id),
      fillOpacity: 0.85,
      weight: 1,
    });
    marker.bindPopup(formatSightingPopup(sighting, t));
    reviewSightingsLayer.addLayer(marker);
  });

  const checklistMarker = L.marker([selectedForm.value.lat, selectedForm.value.lon], {
    draggable: true,
    icon: L.divIcon({
      className: "assignment-checklist-icon",
      html: checklistMarkerHtml(selectedForm.value.id, checklistColors, unassignedColor),
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

  (selectedForm.value.hotspots || []).forEach((hotspot) => {
    const marker = L.marker([hotspot.lat, hotspot.lng], {
      zIndexOffset: 999,
      icon: L.divIcon({
        className: "hotspot-marker-icon",
        html: `<img src="${hotspotMarkerUrl}" alt="" />`,
        iconSize: [28, 36],
        iconAnchor: [14, 36],
        popupAnchor: [0, -32],
      }),
    });
    marker.bindPopup(hotspotPopupContent(hotspot));
    reviewHotspotLayer?.addLayer(marker);
  });

  if (Array.isArray(selectedForm.value.path) && selectedForm.value.path.length > 1) {
    reviewPathLayer.addLayer(
      L.polyline(selectedForm.value.path, {
        color: "#8b5e3c",
        weight: 4,
      }),
    );
  }

  const points = [
    ...selectedSightings.value.map((sighting) => [sighting.lat, sighting.lon]),
    [selectedForm.value.lat, selectedForm.value.lon],
    ...(selectedForm.value.path || []).map((point) => [point[0], point[1]]),
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
  addBaseLayerControl(reviewMap);

  reviewSightingsLayer = L.layerGroup().addTo(reviewMap);
  reviewMarkerLayer = L.layerGroup().addTo(reviewMap);
  reviewPathLayer = L.layerGroup().addTo(reviewMap);
  reviewHotspotLayer = L.layerGroup().addTo(reviewMap);

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

function destroyReviewMap() {
  if (reviewMap) {
    reviewMap.off();
    reviewMap.remove();
  }

  reviewMap = null;
  reviewSightingsLayer = null;
  reviewMarkerLayer = null;
  reviewPathLayer = null;
  reviewHotspotLayer = null;
  reviewDrawPolyline = null;
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

watch(
  assignmentMapElement,
  async (value) => {
    if (!value) {
      return;
    }
    await nextTick();
    initializeAssignmentMap();
  },
  { immediate: true },
);

watch(
  reviewMapElement,
  async (value) => {
    if (!value) {
      destroyReviewMap();
      return;
    }
    await nextTick();
    initializeReviewMap();
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  document.removeEventListener("click", handleDocumentClick);
  document.removeEventListener("fullscreenchange", syncAssignmentMapFullscreenState);
  document.removeEventListener("webkitfullscreenchange", syncAssignmentMapFullscreenState);
  stopRectangleDraw();
  if (assignmentMap) {
    assignmentMap.off();
    assignmentMap.remove();
  }
  assignmentMapHasInitialView = false;
  if (reviewMap) {
    destroyReviewMap();
  }
});

onMounted(() => {
  document.addEventListener("click", handleDocumentClick);
  document.addEventListener("fullscreenchange", syncAssignmentMapFullscreenState);
  document.addEventListener("webkitfullscreenchange", syncAssignmentMapFullscreenState);
});
</script>

<template>
  <div class="d-flex flex-column gap-3">
    <section v-if="sightings.length > 0" class="card border-0 shadow-sm rounded-3">
      <div class="card-body p-3 p-md-4">
        <h2 class="border-bottom pb-2 mb-3">{{ t("assignmentTitle") }}</h2>
        <p class="mb-3">{{ t("assignmentIntro") }}</p>

        <div ref="assignmentMapShellElement" class="assignment-map-shell mb-3">
          <div
            ref="assignmentMapElement"
            class="assignment-map rounded border"
            :aria-label="t('assignmentMapAria')"
          ></div>

          <button
            class="assignment-map-fullscreen btn btn-light btn-sm"
            type="button"
            :aria-label="
              assignmentMapFullscreen ? t('assignmentMapExitFullscreen') : t('assignmentMapEnterFullscreen')
            "
            :title="
              assignmentMapFullscreen ? t('assignmentMapExitFullscreen') : t('assignmentMapEnterFullscreen')
            "
            :aria-pressed="assignmentMapFullscreen"
            @click="toggleAssignmentMapFullscreen"
          >
            <i
              class="bi"
              :class="assignmentMapFullscreen ? 'bi-fullscreen-exit' : 'bi-arrows-fullscreen'"
              aria-hidden="true"
            ></i>
          </button>

          <div class="assignment-map-controls">
            <button
              class="btn btn-success w-100 mb-2 d-inline-flex align-items-center justify-content-center gap-2"
              type="button"
              v-tooltip:top="t('createChecklistTooltip')"
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
                class="btn btn-primary btn-icon"
                type="button"
                v-tooltip:top="t('assignToChecklistTooltip')"
                :aria-label="t('assignToChecklistTooltip')"
                @click="startRectangleDraw('assign')"
              >
                <i class="bi bi-bounding-box-circles" aria-hidden="true"></i>
              </button>
            </div>
            <div class="btn-group w-100">
              <button
                class="btn btn-outline-warning btn-icon"
                type="button"
                v-tooltip:top="t('assignCleanTooltip')"
                :aria-label="t('assignCleanTooltip')"
                @click="assignClean"
              >
                <i class="bi bi-eraser" aria-hidden="true"></i>
              </button>
              <button
                class="btn btn-outline-danger btn-icon"
                type="button"
                v-tooltip:top="t('assignResetTooltip')"
                :aria-label="t('assignResetTooltip')"
                @click="assignReset"
              >
                <i class="bi bi-arrow-counterclockwise" aria-hidden="true"></i>
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
              class="btn btn-primary assignment-magic-action d-inline-flex align-items-center justify-content-center gap-2"
              type="button"
              v-tooltip:top="t('assignmentMagicTooltip')"
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
                @click="observationsModalOpen = true"
              >
                <i class="bi bi-list-ul" aria-hidden="true"></i>
                <span>{{ t("viewChecklistObservations", { count: selectedSightings.length }) }}</span>
              </button>
            </div>
            <div class="form-check form-switch mt-2">
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

        <section v-if="selectedForm" class="border rounded-3 p-3 p-md-4 mt-3">
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
                  :maxlength="LOCATION_NAME_MAX_LENGTH"
                />
                <button
                  class="btn btn-outline-secondary btn-icon"
                  type="button"
                  v-tooltip:top="t('focusMapTooltip')"
                  :aria-label="t('focusMapTooltip')"
                  @click="focusReviewMap"
                >
                  <i class="bi bi-map" aria-hidden="true"></i>
                </button>
              </div>
              <div
                class="form-text"
                :class="{ 'text-warning': (selectedForm.location_name || '').length >= LOCATION_NAME_MAX_LENGTH }"
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
                  v-model="selectedForm.date"
                  class="form-control"
                  :class="requiredStateClass(selectedForm.date)"
                  type="date"
                />
                <button
                  class="btn btn-outline-secondary btn-icon"
                  type="button"
                  v-tooltip:top="t('computeDateTooltip')"
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
                v-model.number="selectedForm.number_observer"
                class="form-control"
                :class="requiredNumberStateClass(selectedForm.number_observer, 1, 100)"
                type="number"
                min="1"
                max="100"
                step="1"
              />
            </div>
            <div class="col-lg-3 col-sm-6">
              <label class="form-label">{{ t("time") }}</label>
              <div class="input-group">
                <input
                  v-model="selectedForm.time"
                  class="form-control"
                  :class="requiredTimeStateClass(selectedForm.time)"
                  type="time"
                  step="60"
                />
                <button
                  class="btn btn-outline-secondary btn-icon"
                  type="button"
                  v-tooltip:top="t('computeTimeTooltip')"
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
                  v-model.number="selectedForm.duration"
                  class="form-control"
                  :class="requiredNumberStateClass(selectedForm.duration, 1, 1440)"
                  type="number"
                  min="1"
                  max="1440"
                />
                <button
                  class="btn btn-outline-secondary btn-icon"
                  type="button"
                  v-tooltip:top="t('computeDurationTooltip')"
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
                  v-model.number="selectedForm.distance"
                  class="form-control"
                  :class="requiredNumberStateClass(selectedForm.distance, 0, 80)"
                  type="number"
                  min="0"
                  max="80"
                  step="0.1"
                />
                <button
                  class="btn btn-outline-secondary btn-icon"
                  type="button"
                  v-tooltip:top="t('drawPathTooltip')"
                  :aria-label="t('drawPathTooltip')"
                  @click="startPathDraw"
                >
                  <i class="bi bi-bezier" aria-hidden="true"></i>
                </button>
              </div>
            </div>
            <div class="col-lg-3 col-sm-12">
              <div class="d-flex align-items-center gap-2">
                <label class="form-label mb-0">{{ t("effort") }}</label>
                <a
                  href="https://support.ebird.org/en/support/solutions/articles/48000967748-birding-as-your-primary-purpose-and-complete-checklists"
                  target="_blank"
                  rel="noopener"
                  class="d-inline-flex align-items-center text-primary text-decoration-none"
                  aria-label="eBird effort help"
                  v-tooltip:top="'eBird effort help'"
                >
                  <i class="bi bi-question-circle-fill" aria-hidden="true"></i>
                </a>
              </div>
              <div class="form-check form-switch mb-0">
                <input
                  id="primary-purpose"
                  v-model="selectedForm.primary_purpose"
                  class="form-check-input"
                  type="checkbox"
                />
                <label class="form-check-label" for="primary-purpose">{{
                  t("primaryPurpose")
                }}</label>
              </div>
              <div class="form-check form-switch mb-0">
                <input
                  id="complete-checklist"
                  v-model="selectedForm.full_form"
                  class="form-check-input"
                  type="checkbox"
                />
                <label class="form-check-label" for="complete-checklist">{{
                  t("completeChecklist")
                }}</label>
              </div>
            </div>
          </div>

          <div class="row g-3 mt-1">
            <div :class="showStaticMapPanel ? 'col-xl-8 col-lg-7' : 'col-12'">
              <div class="review-map-shell">
                <div ref="reviewMapElement" class="review-map rounded border"></div>
                <div class="review-map-controls">
                  <button
                    class="btn btn-primary btn-sm d-inline-flex align-items-center gap-2"
                    type="button"
                    v-tooltip:left="t('drawPathTooltip')"
                    :aria-label="t('drawPathTooltip')"
                    @click="startPathDraw"
                  >
                    <i class="bi bi-bezier" aria-hidden="true"></i>
                    <span>{{ t("drawPath") }}</span>
                  </button>
                </div>
              </div>
            </div>
            <div v-if="showStaticMapPanel" class="col-xl-4 col-lg-5">
              <article class="card h-100 static-map-preview-card">
                <div class="card-body p-3">
                  <div class="d-flex align-items-center justify-content-between gap-2 mb-3">
                    <h3 class="h6 mb-0">{{ t("staticMapPreviewTitle") }}</h3>
                  </div>

                  <div v-if="staticMapPreview.url" class="d-block">
                    <img
                      class="img-fluid rounded border static-map-preview-image"
                      :src="staticMapPreview.url"
                      :alt="t('staticMapPreviewAlt')"
                    />
                  </div>
                  <div v-else class="alert alert-warning small mb-0">
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
                    :class="{ 'static-map-preview-controls-with-zoom': selectedForm.static_map_zoom_mode === 'manual' }"
                  >
                    <div class="static-map-preview-control">
                      <label class="form-label mb-1">{{ t("staticMapZoomMode") }}</label>
                      <select v-model="selectedForm.static_map_zoom_mode" class="form-select form-select-sm">
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
                        v-model.number="selectedForm.static_map_zoom"
                        class="form-control form-control-sm"
                        type="number"
                        min="0"
                        max="22"
                        step="0.5"
                      />
                    </div>
                  </div>
                  <p class="small text-body-secondary mt-2 mb-0 static-map-preview-note">
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
            <button class="btn btn-outline-secondary btn-sm" type="button" @click="observationsModalOpen = false">
              {{ t("close") }}
            </button>
          </div>

          <div class="modal-content-scroll flex-grow-1 overflow-x-hidden overflow-y-auto">
            <div class="d-flex flex-column flex-md-row align-items-md-center justify-content-between gap-2 mb-3">
              <div class="fw-semibold">{{ selectedReviewOption?.label || selectedForm.location_name }}</div>
              <div class="badge bg-secondary">
                {{ t("checklistObservationCount", { count: selectedSightings.length }) }}
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
                    <td class="checklist-observations-comment" v-html="row.species_comment || ''"></td>
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

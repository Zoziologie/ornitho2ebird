<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { Marker, Popup } from "maplibre-gl";
import hotspotMarkerUrl from "../assets/map-marker-hotspot.png";
import {
  CHECKLIST_COLORS,
  UNASSIGNED_COLOR,
  checklistColor,
  checklistMarkerHtml,
  escapeHtml,
  formatSightingPopup,
} from "../lib/advancedPanel";
import {
  createMap,
  emptyFeatureCollection,
  fitToPoints,
  isTypingTarget,
  pointFeature,
} from "../lib/maps";
import { distanceFromPath, mathRound } from "../lib/utils";

const props = defineProps({
  // The selected checklist and its observations.
  form: { type: Object, default: null },
  sightings: { type: Array, required: true },
  baseLayer: { type: String, default: "OpenStreetMap" },
});

const emit = defineEmits(["update:baseLayer", "move-form", "path", "use-hotspot"]);
const { t } = useI18n();

const PATH_COLOR = "#8b5e3c";

const shell = ref(null);
const container = ref(null);
let map = null;
let mapControls = null;
let mapReady = false;
// The checklist the map was last fitted to: refit only when another one is selected, so dragging
// the marker or loading hotspots keeps the user's zoom.
let fittedFormId = null;
let markers = [];

const drawing = ref(false);
const drawPoints = ref([]);
const drawDistance = computed(() => distanceFromPath(drawPoints.value));

const color = (formId) => checklistColor(formId, CHECKLIST_COLORS, UNASSIGNED_COLOR);

function hotspotPopupContent(hotspot, popup) {
  const content = document.createElement("div");
  content.className = "map-popup";

  const title = document.createElement("a");
  title.href = `https://ebird.org/hotspot/${hotspot.locId}`;
  title.target = "_blank";
  title.rel = "noopener";
  title.className = "fw-semibold d-inline-block mb-2";
  title.textContent = hotspot.locName;
  content.appendChild(title);

  const species = document.createElement("div");
  species.innerHTML = `<strong>${t("hotspotSpeciesCount")}:</strong> ${escapeHtml(hotspot.numSpeciesAllTime ?? "—")}`;
  content.appendChild(species);

  const latest = document.createElement("div");
  latest.innerHTML = `<strong>${t("hotspotLatestChecklist")}:</strong> ${escapeHtml(hotspot.latestObsDt ?? "—")}`;
  content.appendChild(latest);

  const button = document.createElement("button");
  button.type = "button";
  button.className = "btn btn-primary btn-sm mt-2";
  button.textContent = t("useHotspotLocation");
  button.addEventListener("click", () => {
    popup.remove();
    emit("use-hotspot", hotspot);
  });
  content.appendChild(button);

  return content;
}

function lineFeature(path) {
  return {
    type: "Feature",
    properties: {},
    geometry: {
      type: "LineString",
      coordinates: path.map(([lat, lon]) => [Number(lon), Number(lat)]),
    },
  };
}

function refresh() {
  if (!map || !mapReady) {
    return;
  }

  const form = props.form;
  markers.forEach((marker) => marker.remove());
  markers = [];
  if (!form) {
    map.getSource("sightings").setData(emptyFeatureCollection());
    map.getSource("path").setData(emptyFeatureCollection());
    return;
  }

  map.getSource("sightings").setData({
    type: "FeatureCollection",
    features: props.sightings.map((sighting, index) =>
      pointFeature(sighting.lat, sighting.lon, { index, color: color(sighting.form_id) }),
    ),
  });

  map.getSource("path").setData({
    type: "FeatureCollection",
    features: Array.isArray(form.path) && form.path.length > 1 ? [lineFeature(form.path)] : [],
  });

  const checklistElement = document.createElement("div");
  checklistElement.className = "assignment-checklist-icon";
  checklistElement.innerHTML = checklistMarkerHtml(form.id, CHECKLIST_COLORS, UNASSIGNED_COLOR);
  const checklistMarker = new Marker({ element: checklistElement, draggable: true })
    .setLngLat([Number(form.lon), Number(form.lat)])
    .addTo(map);
  checklistMarker.on("dragend", () => {
    const { lat, lng } = checklistMarker.getLngLat();
    emit("move-form", form.id, lat, lng);
  });
  markers.push(checklistMarker);

  (form.hotspots || []).forEach((hotspot) => {
    const element = document.createElement("div");
    element.className = "hotspot-marker-icon";
    element.innerHTML = `<img src="${hotspotMarkerUrl}" alt="" />`;
    const popup = new Popup({ maxWidth: "420px", focusAfterOpen: false, offset: 26 });
    popup.setDOMContent(hotspotPopupContent(hotspot, popup));
    markers.push(
      new Marker({ element, anchor: "bottom" })
        .setLngLat([Number(hotspot.lng), Number(hotspot.lat)])
        .setPopup(popup)
        .addTo(map),
    );
  });

  if (fittedFormId !== form.id) {
    fitToPoints(
      map,
      [
        ...props.sightings.map((sighting) => [sighting.lat, sighting.lon]),
        [form.lat, form.lon],
        ...(form.path || []),
      ],
      13,
    );
    fittedFormId = form.id;
  }
}

function onSightingsClick(event) {
  if (drawing.value) {
    return;
  }

  const sighting = props.sightings[event.features[0]?.properties.index];
  if (sighting) {
    new Popup({ maxWidth: "420px", focusAfterOpen: false })
      .setLngLat([Number(sighting.lon), Number(sighting.lat)])
      .setHTML(formatSightingPopup(sighting, t))
      .addTo(map);
  }
}

function focus() {
  if (!map || !props.form) {
    return;
  }

  shell.value?.scrollIntoView({ behavior: "smooth", block: "center" });
  map.flyTo({
    center: [Number(props.form.lon), Number(props.form.lat)],
    zoom: Math.max(map.getZoom(), 13),
  });
}

// --- Path drawing: click adds a point, double-click or Enter finishes, Backspace undoes the last
// point and Escape cancels.

function showDrawing(cursor) {
  const coordinates = drawPoints.value.map(([lat, lon]) => [lon, lat]);
  const line =
    cursor && coordinates.length ? [...coordinates, [cursor.lng, cursor.lat]] : coordinates;
  map?.getSource("drawing")?.setData({
    type: "FeatureCollection",
    features: [
      ...(line.length > 1
        ? [{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: line } }]
        : []),
      ...coordinates.map(([lon, lat]) => pointFeature(lat, lon)),
    ],
  });
}

function startPathDraw() {
  if (!map || !props.form) {
    return;
  }

  drawPoints.value = [];
  drawing.value = true;
  map.doubleClickZoom.disable();
  container.value.classList.add("map-picking");
  document.addEventListener("keydown", onDrawKeydown);
  showDrawing(null);
}

function stopPathDraw() {
  drawing.value = false;
  drawPoints.value = [];
  showDrawing(null);
  map?.doubleClickZoom.enable();
  container.value?.classList.remove("map-picking");
  document.removeEventListener("keydown", onDrawKeydown);
}

function finishPathDraw() {
  if (drawPoints.value.length < 2) {
    return;
  }

  const path = drawPoints.value.map(([lat, lon]) => [mathRound(lat, 6), mathRound(lon, 6)]);
  stopPathDraw();
  emit("path", path);
}

function undoPathPoint() {
  drawPoints.value = drawPoints.value.slice(0, -1);
  showDrawing(null);
}

function onDrawKeydown(event) {
  if (isTypingTarget(event.target)) {
    return;
  }

  if (event.key === "Enter") {
    event.preventDefault();
    finishPathDraw();
  } else if (event.key === "Backspace") {
    event.preventDefault();
    undoPathPoint();
  } else if (event.key === "Escape") {
    stopPathDraw();
  }
}

function onMapClick(event) {
  if (drawing.value) {
    drawPoints.value = [...drawPoints.value, [event.lngLat.lat, event.lngLat.lng]];
    showDrawing(event.lngLat);
  }
}

function onMapDoubleClick(event) {
  if (drawing.value) {
    event.preventDefault();
    // Each click of the double-click added the same point.
    drawPoints.value = drawPoints.value.slice(0, -1);
    finishPathDraw();
  }
}

function initialize() {
  const created = createMap(container.value, {
    baseLayer: props.baseLayer,
    baseLayerLabel: t("assignmentMapBaseLayer"),
    onBaseLayerChange: (name) => emit("update:baseLayer", name),
  });
  map = created.map;
  mapControls = created;

  map.on("load", () => {
    map.addSource("path", { type: "geojson", data: emptyFeatureCollection() });
    map.addSource("sightings", { type: "geojson", data: emptyFeatureCollection() });
    map.addSource("drawing", { type: "geojson", data: emptyFeatureCollection() });
    map.addLayer({
      id: "path",
      type: "line",
      source: "path",
      layout: { "line-join": "round", "line-cap": "round" },
      paint: { "line-color": PATH_COLOR, "line-width": 4 },
    });
    map.addLayer({
      id: "sightings",
      type: "circle",
      source: "sightings",
      paint: {
        "circle-radius": 8,
        "circle-color": ["get", "color"],
        "circle-opacity": 0.85,
        "circle-stroke-color": ["get", "color"],
        "circle-stroke-width": 1,
      },
    });
    map.addLayer({
      id: "drawing-line",
      type: "line",
      source: "drawing",
      filter: ["==", ["geometry-type"], "LineString"],
      layout: { "line-join": "round", "line-cap": "round" },
      paint: { "line-color": PATH_COLOR, "line-width": 4, "line-dasharray": [2, 1] },
    });
    map.addLayer({
      id: "drawing-points",
      type: "circle",
      source: "drawing",
      filter: ["==", ["geometry-type"], "Point"],
      paint: {
        "circle-radius": 5,
        "circle-color": "#ffffff",
        "circle-stroke-color": PATH_COLOR,
        "circle-stroke-width": 2,
      },
    });
    mapReady = true;
    refresh();
  });

  map.on("click", "sightings", onSightingsClick);
  map.on("mouseenter", "sightings", () => {
    if (!drawing.value) {
      map.getCanvas().style.cursor = "pointer";
    }
  });
  map.on("mouseleave", "sightings", () => {
    map.getCanvas().style.cursor = "";
  });
  map.on("click", onMapClick);
  map.on("dblclick", onMapDoubleClick);
  map.on("mousemove", (event) => {
    if (drawing.value) {
      showDrawing(event.lngLat);
    }
  });
}

watch(
  () => [
    props.form?.id,
    props.form?.lat,
    props.form?.lon,
    props.form?.path,
    props.form?.hotspots,
    props.sightings.map((sighting) => [sighting.id, sighting.form_id, sighting.lat, sighting.lon]),
  ],
  () => refresh(),
);

// Drawing belongs to one checklist.
watch(
  () => props.form?.id,
  () => {
    if (drawing.value) {
      stopPathDraw();
    }
  },
);

watch(
  () => props.baseLayer,
  (value) => mapControls?.setBaseLayer(value),
);

onMounted(initialize);

onBeforeUnmount(() => {
  document.removeEventListener("keydown", onDrawKeydown);
  map?.remove();
  map = null;
});

defineExpose({ focus, startPathDraw });
</script>

<template>
  <div ref="shell" class="review-map-shell">
    <div ref="container" class="review-map rounded border"></div>
    <div class="review-map-controls">
      <button
        v-if="!drawing"
        v-tooltip:left="t('drawPathTooltip')"
        class="btn btn-primary btn-sm d-inline-flex align-items-center gap-2"
        type="button"
        :aria-label="t('drawPathTooltip')"
        @click="startPathDraw"
      >
        <i class="bi bi-bezier" aria-hidden="true"></i>
        <span>{{ t("drawPath") }}</span>
      </button>
      <div v-else class="review-map-drawing shadow-sm" role="status">
        <p class="mb-2 small">{{ t("drawPathHint") }}</p>
        <div class="d-flex flex-wrap align-items-center gap-2">
          <span class="badge text-bg-light border">{{ drawDistance }} km</span>
          <button
            class="btn btn-primary btn-sm"
            type="button"
            :disabled="drawPoints.length < 2"
            @click="finishPathDraw"
          >
            {{ t("drawPathFinish") }}
          </button>
          <button
            class="btn btn-outline-secondary btn-sm"
            type="button"
            :disabled="!drawPoints.length"
            @click="undoPathPoint"
          >
            {{ t("drawPathUndo") }}
          </button>
          <button class="btn btn-outline-secondary btn-sm" type="button" @click="stopPathDraw">
            {{ t("cancel") }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

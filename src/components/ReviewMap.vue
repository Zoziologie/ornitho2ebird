<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { Marker, Popup } from "maplibre-gl";
import hotspotMarkerUrl from "../assets/map-marker-hotspot.svg";
import {
  CHECKLIST_COLORS,
  UNASSIGNED_COLOR,
  checklistColor,
  checklistMarkerHtml,
  escapeHtml,
  formatSightingPopup,
  sightingListPopupContent,
} from "../lib/advancedPanel";
import {
  createHoverLabel,
  createMap,
  drawCountImages,
  emptyFeatureCollection,
  fitToPoints,
  isTypingTarget,
  panToPopup,
  pointFeature,
} from "../lib/maps";
import { basemapGroups } from "../lib/basemaps";
import { distanceFromPath, groupByLocation, mathRound } from "../lib/utils";

const props = defineProps({
  // The selected checklist and its observations.
  form: { type: Object, default: null },
  sightings: { type: Array, required: true },
  baseLayer: { type: String, default: "OpenStreetMap" },
});

const emit = defineEmits(["update:baseLayer", "move-form", "path", "use-hotspot"]);
const { t, locale } = useI18n();

const PATH_COLOR = "#8b5e3c";
// Observations closer than this share one dot, as on the assignment map.
const SAME_LOCATION_METERS = 5;

const shell = ref(null);
const container = ref(null);
let map = null;
let mapControls = null;
let mapReady = false;
// The checklist the map was last fitted to: refit only when another one is selected, so dragging
// the marker or loading hotspots keeps the user's zoom.
let fittedFormId = null;
let markers = [];
let groups = [];
let hoverLabel = null;

const drawing = ref(false);
const drawPoints = ref([]);
const drawDistance = computed(() => distanceFromPath(drawPoints.value));

const color = (formId) => checklistColor(formId, CHECKLIST_COLORS, UNASSIGNED_COLOR);
// The count is written in the group's colour on white; yellow is too light for that.
const countColor = (groupColor) => (groupColor === "#ffff33" ? "#9a8700" : groupColor);

function hotspotPopupContent(hotspot, popup) {
  const content = document.createElement("div");
  content.className = "map-popup";
  content.innerHTML = `
    <a class="map-popup-heading map-popup-heading-link" href="https://ebird.org/hotspot/${encodeURIComponent(hotspot.locId)}" target="_blank" rel="noopener">${escapeHtml(hotspot.locName)} <i class="bi bi-box-arrow-up-right small" aria-hidden="true"></i></a>
    <div class="map-popup-stack">
      <div class="map-popup-data-row">
        <span class="map-popup-data-label">${escapeHtml(t("hotspotSpeciesCount"))}</span>
        <span class="map-popup-data-value">${escapeHtml(hotspot.numSpeciesAllTime ?? "—")}</span>
      </div>
      <div class="map-popup-data-row">
        <span class="map-popup-data-label">${escapeHtml(t("hotspotLatestChecklist"))}</span>
        <span class="map-popup-data-value">${escapeHtml(hotspot.latestObsDt ?? "—")}</span>
      </div>
    </div>
  `;

  const button = document.createElement("button");
  button.type = "button";
  button.className = "btn btn-primary btn-sm w-100 mt-3";
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
  hoverLabel.hide();
  markers.forEach((marker) => marker.remove());
  markers = [];
  if (!form) {
    map.getSource("sightings").setData(emptyFeatureCollection());
    map.getSource("path").setData(emptyFeatureCollection());
    return;
  }

  groups = groupByLocation(props.sightings, SAME_LOCATION_METERS);
  map.getSource("sightings").setData({
    type: "FeatureCollection",
    features: groups.map((group, index) => {
      const count = group.items.length;
      const groupColor = color(group.items[0].form_id);
      return pointFeature(group.lat, group.lon, {
        index,
        count,
        color: groupColor,
        label: count > 1 ? `count:${countColor(groupColor)}:${count > 99 ? "99+" : count}` : "",
      });
    }),
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
  showLabelOnHover(checklistElement, checklistMarker, `${form.id}. ${form.location_name || ""}`);
  checklistMarker.on("dragstart", () => {
    hoverLabel.hide();
    checklistElement.classList.add("is-dragging");
  });
  checklistMarker.on("dragend", () => {
    checklistElement.classList.remove("is-dragging");
    const { lat, lng } = checklistMarker.getLngLat();
    emit("move-form", form.id, lat, lng);
  });
  markers.push(checklistMarker);

  (form.hotspots || []).forEach((hotspot) => {
    const element = document.createElement("div");
    element.className = "hotspot-marker-icon";
    element.innerHTML = `<img src="${hotspotMarkerUrl}" alt="" />`;
    const popup = new Popup({ maxWidth: "320px", focusAfterOpen: false, offset: 30 });
    popup.setDOMContent(hotspotPopupContent(hotspot, popup));
    popup.on("open", () => {
      hoverLabel.hide();
      panToPopup(map, popup);
    });
    const marker = new Marker({ element, anchor: "bottom" })
      .setLngLat([Number(hotspot.lng), Number(hotspot.lat)])
      .setPopup(popup)
      .addTo(map);
    showLabelOnHover(element, marker, hotspot.locName, 30);
    markers.push(marker);
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

// `offset`: how far above its point the marker reaches.
function showLabelOnHover(element, marker, text, offset = 14) {
  element.addEventListener("mouseenter", () => {
    if (!drawing.value && !element.classList.contains("is-dragging")) {
      hoverLabel.show(marker.getLngLat(), text, offset);
    }
  });
  element.addEventListener("mouseleave", () => hoverLabel.hide());
}

function onSightingsHover(event) {
  const group = groups[event.features[0]?.properties.index];
  if (!group || drawing.value) {
    hoverLabel.hide();
    return;
  }

  const [sighting] = group.items;
  hoverLabel.show(
    [group.lon, group.lat],
    group.items.length > 1
      ? t("observationsAtLocation", { count: group.items.length })
      : [sighting.common_name || sighting.scientific_name, sighting.time]
          .filter(Boolean)
          .join(" · "),
  );
}

function onSightingsClick(event) {
  const group = groups[event.features[0]?.properties.index];
  if (!group || drawing.value) {
    return;
  }

  hoverLabel.hide();
  const popup = new Popup({ maxWidth: "420px", focusAfterOpen: false }).setLngLat([
    group.lon,
    group.lat,
  ]);
  if (group.items.length === 1) {
    popup.setHTML(formatSightingPopup(group.items[0], t));
  } else {
    popup.setDOMContent(
      sightingListPopupContent(
        group.items,
        t("observationsAtLocation", { count: group.items.length }),
        t,
      ),
    );
  }
  popup.addTo(map);
  panToPopup(map, popup);
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
    baseLayerGroups: basemapGroups(t, locale.value),
    baseLayerLabel: t("assignmentMapBaseLayer"),
    onBaseLayerChange: (name) => emit("update:baseLayer", name),
  });
  map = created.map;
  mapControls = created;

  hoverLabel = createHoverLabel(map);
  drawCountImages(map);
  // Again after each basemap change, which replaces the style.
  map.on("style.load", () => {
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
        // A single observation is a dot, a group a ring around its count.
        "circle-radius": ["case", [">", ["get", "count"], 1], 9, 6],
        "circle-color": ["case", [">", ["get", "count"], 1], "#ffffff", ["get", "color"]],
        "circle-stroke-color": ["case", [">", ["get", "count"], 1], ["get", "color"], "#ffffff"],
        "circle-stroke-width": ["case", [">", ["get", "count"], 1], 2.5, 1.5],
      },
    });
    map.addLayer({
      id: "sighting-counts",
      type: "symbol",
      source: "sightings",
      filter: ["!=", ["get", "label"], ""],
      layout: {
        "icon-image": ["get", "label"],
        "icon-allow-overlap": true,
        "icon-ignore-placement": true,
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
    showDrawing(null);
  });

  map.on("click", "sightings", onSightingsClick);
  map.on("mouseenter", "sightings", () => {
    if (!drawing.value) {
      map.getCanvas().style.cursor = "pointer";
    }
  });
  map.on("mousemove", "sightings", onSightingsHover);
  map.on("mouseleave", "sightings", () => {
    map.getCanvas().style.cursor = "";
    hoverLabel.hide();
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

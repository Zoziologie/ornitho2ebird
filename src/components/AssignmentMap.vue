<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { Marker, Popup } from "maplibre-gl";
import {
  CHECKLIST_COLORS,
  UNASSIGNED_COLOR,
  checklistColor,
  checklistMarkerHtml,
  formatSightingPopup,
  sightingListPopupContent,
} from "../lib/advancedPanel";
import {
  createMap,
  emptyFeatureCollection,
  fitToPoints,
  createHoverLabel,
  drawCountImages,
  isTypingTarget,
  panToPopup,
  pointFeature,
} from "../lib/maps";
import { basemapGroups } from "../lib/basemaps";
import { groupByLocation, haversineDistanceKm } from "../lib/utils";

const props = defineProps({
  sightings: { type: Array, required: true },
  forms: { type: Array, required: true },
  baseLayer: { type: String, default: "OpenStreetMap" },
  // The checklist chosen in the assignment tools, highlighted on the map.
  selectedFormId: { type: Number, default: 0 },
  // The choices in the select of each observation in a group: { value, label }.
  assignOptions: { type: Array, required: true },
});

const emit = defineEmits(["update:baseLayer", "select-form", "move-form", "assign", "selection"]);
const { t, locale } = useI18n();

// Observations closer than this share one dot, and its popup lists them.
const SAME_LOCATION_METERS = 5;
const MIXED_GROUP_COLOR = "#89a0b1";

const container = ref(null);
let map = null;
let mapControls = null;
let mapReady = false;
let hasInitialView = false;
let groups = [];
let checklistMarkers = [];
let popup = null;
let hoverLabel = null;

const selecting = ref(false);
let selectionStart = null;
let selectionBox = null;

const color = (formId) => checklistColor(formId, CHECKLIST_COLORS, UNASSIGNED_COLOR);
// The count is written in the group's colour on white; yellow is too light for that.
const countColor = (groupColor) => (groupColor === "#ffff33" ? "#9a8700" : groupColor);

function refresh({ refit = false } = {}) {
  if (!map || !mapReady) {
    return;
  }

  hoverLabel.hide();
  groups = groupByLocation(props.sightings, SAME_LOCATION_METERS);
  map.getSource("sightings").setData({
    type: "FeatureCollection",
    features: groups.map((group, index) => {
      const formIds = [...new Set(group.items.map((sighting) => Number(sighting.form_id)))];
      const groupColor = formIds.length === 1 ? color(formIds[0]) : MIXED_GROUP_COLOR;
      const count = group.items.length;
      return pointFeature(group.lat, group.lon, {
        index,
        count,
        color: groupColor,
        label: count > 1 ? `count:${countColor(groupColor)}:${count > 99 ? "99+" : count}` : "",
      });
    }),
  });

  checklistMarkers.forEach((marker) => marker.remove());
  checklistMarkers = props.forms
    .filter((form) => !form.imported)
    .map((form) => {
      const element = document.createElement("div");
      element.className = "assignment-checklist-icon";
      element.classList.toggle("is-selected", form.id === props.selectedFormId);
      element.innerHTML = checklistMarkerHtml(form.id, CHECKLIST_COLORS, UNASSIGNED_COLOR);
      const marker = new Marker({ element, draggable: true })
        .setLngLat([Number(form.lon), Number(form.lat)])
        .addTo(map);
      const name = `${form.id}. ${form.location_name || ""}`;
      element.addEventListener("mouseenter", () => {
        if (!element.classList.contains("is-dragging")) {
          hoverLabel.show(marker.getLngLat(), name);
        }
      });
      element.addEventListener("mouseleave", () => hoverLabel.hide());
      // A drag ends with a click on the marker: don't select the checklist then.
      let dragged = false;
      marker.on("dragstart", () => {
        dragged = true;
        hoverLabel.hide();
        element.classList.add("is-dragging");
      });
      marker.on("dragend", () => {
        element.classList.remove("is-dragging");
        const { lat, lng } = marker.getLngLat();
        emit("move-form", form.id, lat, lng);
      });
      element.addEventListener("click", (event) => {
        event.stopPropagation();
        if (dragged) {
          dragged = false;
          return;
        }
        emit("select-form", form.id);
      });
      return marker;
    });

  const points = [
    ...props.sightings.map((sighting) => [sighting.lat, sighting.lon]),
    ...props.forms.filter((form) => !form.imported).map((form) => [form.lat, form.lon]),
  ];
  if (points.length && (refit || !hasInitialView)) {
    fitToPoints(map, points, 12);
    hasInitialView = true;
  }
}

function sightingsNear(lat, lon) {
  return props.sightings
    .filter(
      (sighting) =>
        haversineDistanceKm(lat, lon, Number(sighting.lat), Number(sighting.lon)) * 1000 <=
        SAME_LOCATION_METERS,
    )
    .sort((left, right) => {
      const leftKey = `${left.date || ""} ${left.time || ""} ${left.common_name || ""}`;
      const rightKey = `${right.date || ""} ${right.time || ""} ${right.common_name || ""}`;
      return leftKey.localeCompare(rightKey);
    });
}

// The observations of one place, each with a select to move it to another checklist.
function groupPopupContent(lat, lon) {
  const sightings = sightingsNear(lat, lon);
  const title = t("assignmentClusterTitle", { count: sightings.length });
  return sightingListPopupContent(sightings, title, t, {
    options: props.assignOptions,
    onChange: (sighting, formId) => {
      emit("assign", [sighting], formId);
      // The store has changed: show the new checklist of each observation.
      popup?.setDOMContent(groupPopupContent(lat, lon));
    },
  });
}

function openPopup(lngLat, setContent) {
  popup?.remove();
  popup = setContent(new Popup({ maxWidth: "420px", focusAfterOpen: false }).setLngLat(lngLat));
  popup.addTo(map);
  panToPopup(map, popup);
}

function onSightingsHover(event) {
  const group = groups[event.features[0]?.properties.index];
  if (!group || selecting.value) {
    hoverLabel.hide();
    return;
  }

  const [sighting] = group.items;
  hoverLabel.show(
    [group.lon, group.lat],
    group.items.length > 1
      ? t("assignmentClusterTitle", { count: group.items.length })
      : [sighting.common_name || sighting.scientific_name, sighting.date, sighting.time]
          .filter(Boolean)
          .join(" · "),
  );
}

function onSightingsClick(event) {
  if (selecting.value) {
    return;
  }

  const group = groups[event.features[0]?.properties.index];
  if (!group) {
    return;
  }

  hoverLabel.hide();
  if (group.items.length === 1) {
    openPopup([group.lon, group.lat], (newPopup) =>
      newPopup.setHTML(formatSightingPopup(group.items[0], t)),
    );
  } else {
    openPopup([group.lon, group.lat], (newPopup) =>
      newPopup.setDOMContent(groupPopupContent(group.lat, group.lon)),
    );
  }
}

// Rectangle selection: the next drag on the map draws a rectangle, and the observations inside it
// are sent with "selection".
function startSelection() {
  if (!map) {
    return;
  }

  stopSelection();
  popup?.remove();
  selecting.value = true;
  map.dragPan.disable();
  map.doubleClickZoom.disable();
  container.value.classList.add("map-picking");
  document.addEventListener("keydown", onSelectionKeydown);
}

function stopSelection() {
  if (!selecting.value) {
    return;
  }

  selecting.value = false;
  selectionStart = null;
  selectionBox?.remove();
  selectionBox = null;
  map?.dragPan.enable();
  map?.doubleClickZoom.enable();
  container.value?.classList.remove("map-picking");
  document.removeEventListener("keydown", onSelectionKeydown);
}

function onSelectionKeydown(event) {
  if (event.key === "Escape" && !isTypingTarget(event.target)) {
    stopSelection();
  }
}

function onMouseDown(event) {
  if (!selecting.value || event.originalEvent.button !== 0) {
    return;
  }

  selectionStart = event.point;
  selectionBox = document.createElement("div");
  selectionBox.className = "map-selection-box";
  map.getCanvasContainer().appendChild(selectionBox);
  onMouseMove(event);
}

function onMouseMove(event) {
  if (!selecting.value || !selectionStart) {
    return;
  }

  Object.assign(selectionBox.style, {
    left: `${Math.min(selectionStart.x, event.point.x)}px`,
    top: `${Math.min(selectionStart.y, event.point.y)}px`,
    width: `${Math.abs(event.point.x - selectionStart.x)}px`,
    height: `${Math.abs(event.point.y - selectionStart.y)}px`,
  });
}

function onMouseUp(event) {
  if (!selecting.value || !selectionStart) {
    return;
  }

  const start = selectionStart;
  const end = event.point;
  stopSelection();
  // A click rather than a drag.
  if (start.dist(end) < 4) {
    return;
  }

  const [minX, maxX] = [Math.min(start.x, end.x), Math.max(start.x, end.x)];
  const [minY, maxY] = [Math.min(start.y, end.y), Math.max(start.y, end.y)];
  emit(
    "selection",
    props.sightings.filter((sighting) => {
      const point = map.project([Number(sighting.lon), Number(sighting.lat)]);
      return point.x >= minX && point.x <= maxX && point.y >= minY && point.y <= maxY;
    }),
  );
}

function initialize() {
  const created = createMap(container.value, {
    baseLayer: props.baseLayer,
    baseLayerGroups: basemapGroups(t, locale.value),
    onBaseLayerChange: (name) => emit("update:baseLayer", name),
    // The parent also holds the assignment tools, which stay on the map in fullscreen.
    fullscreenContainer: container.value.parentElement,
    t,
  });
  map = created.map;
  mapControls = created;

  hoverLabel = createHoverLabel(map);
  drawCountImages(map);
  // Again after each basemap change, which replaces the style.
  map.on("style.load", () => {
    map.addSource("sightings", { type: "geojson", data: emptyFeatureCollection() });
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
    mapReady = true;
    refresh();
  });

  map.on("click", "sightings", onSightingsClick);
  map.on("mouseenter", "sightings", () => {
    if (!selecting.value) {
      map.getCanvas().style.cursor = "pointer";
    }
  });
  map.on("mousemove", "sightings", onSightingsHover);
  map.on("mouseleave", "sightings", () => {
    map.getCanvas().style.cursor = "";
    hoverLabel.hide();
  });
  map.on("mousedown", onMouseDown);
  map.on("mousemove", onMouseMove);
  map.on("mouseup", onMouseUp);
}

// Only what the map draws, so typing in checklist fields does not rebuild every marker.
watch(
  () => [
    props.sightings.map((sighting) => [sighting.id, sighting.form_id, sighting.lat, sighting.lon]),
    props.forms.map((form) => [form.id, form.imported, form.lat, form.lon, form.location_name]),
    props.selectedFormId,
  ],
  () => refresh(),
);

watch(
  () => props.baseLayer,
  (value) => mapControls?.setBaseLayer(value),
);

onMounted(initialize);

onBeforeUnmount(() => {
  stopSelection();
  map?.remove();
  map = null;
});

defineExpose({ startSelection, stopSelection });
</script>

<template>
  <div ref="container">
    <div v-if="selecting" class="map-hint" role="status">{{ t("assignSelectionHint") }}</div>
  </div>
</template>

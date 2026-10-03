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
} from "../lib/advancedPanel";
import {
  createMap,
  emptyFeatureCollection,
  fitToPoints,
  isTypingTarget,
  plusImage,
  pointFeature,
} from "../lib/maps";
import { groupByLocation, haversineDistanceKm } from "../lib/utils";

const props = defineProps({
  sightings: { type: Array, required: true },
  forms: { type: Array, required: true },
  baseLayer: { type: String, default: "OpenStreetMap" },
  // The choices in the select of each observation in a group: { value, label }.
  assignOptions: { type: Array, required: true },
});

const emit = defineEmits(["update:baseLayer", "select-form", "move-form", "assign", "selection"]);
const { t } = useI18n();

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

let selecting = false;
let selectionStart = null;
let selectionBox = null;

const color = (formId) => checklistColor(formId, CHECKLIST_COLORS, UNASSIGNED_COLOR);
const textColorOn = (background) => (background === "#ffff33" ? "#223846" : "#ffffff");

function refresh({ refit = false } = {}) {
  if (!map || !mapReady) {
    return;
  }

  groups = groupByLocation(props.sightings, SAME_LOCATION_METERS);
  map.getSource("sightings").setData({
    type: "FeatureCollection",
    features: groups.map((group, index) => {
      const formIds = [...new Set(group.items.map((sighting) => Number(sighting.form_id)))];
      const groupColor = formIds.length === 1 ? color(formIds[0]) : MIXED_GROUP_COLOR;
      return pointFeature(group.lat, group.lon, {
        index,
        color: groupColor,
        plus: group.items.length > 1 ? `plus-${textColorOn(groupColor)}` : "",
      });
    }),
  });

  checklistMarkers.forEach((marker) => marker.remove());
  checklistMarkers = props.forms
    .filter((form) => !form.imported)
    .map((form) => {
      const element = document.createElement("div");
      element.className = "assignment-checklist-icon";
      element.innerHTML = checklistMarkerHtml(form.id, CHECKLIST_COLORS, UNASSIGNED_COLOR);
      const marker = new Marker({ element, draggable: true })
        .setLngLat([Number(form.lon), Number(form.lat)])
        .addTo(map);
      // A drag ends with a click on the marker: don't select the checklist then.
      let dragged = false;
      marker.on("dragstart", () => {
        dragged = true;
      });
      marker.on("dragend", () => {
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
  const sameLocationSightings = sightingsNear(lat, lon);
  const content = document.createElement("div");
  content.className = "map-popup map-popup-cluster";

  const title = document.createElement("div");
  title.className = "map-popup-heading";
  title.textContent = t("assignmentClusterTitle", { count: sameLocationSightings.length });
  content.appendChild(title);

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
      (value) => value !== null && value !== "",
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
    props.assignOptions.forEach((option) => {
      const optionElement = document.createElement("option");
      optionElement.value = String(option.value);
      optionElement.textContent = option.label;
      optionElement.selected = Number(option.value) === Number(sighting.form_id);
      select.appendChild(optionElement);
    });
    select.addEventListener("change", (event) => {
      emit("assign", [sighting], Number(event.target.value));
      // The store has changed: show the new checklist of each observation.
      popup?.setDOMContent(groupPopupContent(lat, lon));
    });
    details.appendChild(select);

    row.appendChild(details);
    list.appendChild(row);
  });

  content.appendChild(list);
  return content;
}

function openPopup(lngLat, setContent) {
  popup?.remove();
  popup = setContent(
    new Popup({ maxWidth: "420px", focusAfterOpen: false }).setLngLat(lngLat),
  ).addTo(map);
}

function onSightingsClick(event) {
  if (selecting) {
    return;
  }

  const group = groups[event.features[0]?.properties.index];
  if (!group) {
    return;
  }

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
  selecting = true;
  map.dragPan.disable();
  map.doubleClickZoom.disable();
  container.value.classList.add("map-picking");
  document.addEventListener("keydown", onSelectionKeydown);
}

function stopSelection() {
  if (!selecting) {
    return;
  }

  selecting = false;
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
  if (!selecting || event.originalEvent.button !== 0) {
    return;
  }

  selectionStart = event.point;
  selectionBox = document.createElement("div");
  selectionBox.className = "map-selection-box";
  map.getCanvasContainer().appendChild(selectionBox);
  onMouseMove(event);
}

function onMouseMove(event) {
  if (!selecting || !selectionStart) {
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
  if (!selecting || !selectionStart) {
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
    baseLayerLabel: t("assignmentMapBaseLayer"),
    onBaseLayerChange: (name) => emit("update:baseLayer", name),
  });
  map = created.map;
  mapControls = created;

  map.on("load", () => {
    map.addImage("plus-#ffffff", plusImage("#ffffff"), { pixelRatio: 2 });
    map.addImage("plus-#223846", plusImage("#223846"), { pixelRatio: 2 });
    map.addSource("sightings", { type: "geojson", data: emptyFeatureCollection() });
    map.addLayer({
      id: "sightings",
      type: "circle",
      source: "sightings",
      paint: {
        "circle-radius": 7,
        "circle-color": ["get", "color"],
        "circle-stroke-color": "rgba(0, 0, 0, 0.35)",
        "circle-stroke-width": 1,
      },
    });
    map.addLayer({
      id: "sighting-groups",
      type: "symbol",
      source: "sightings",
      filter: ["!=", ["get", "plus"], ""],
      layout: {
        "icon-image": ["get", "plus"],
        "icon-allow-overlap": true,
        "icon-ignore-placement": true,
      },
    });
    mapReady = true;
    refresh({ refit: true });
  });

  map.on("click", "sightings", onSightingsClick);
  map.on("mouseenter", "sightings", () => {
    if (!selecting) {
      map.getCanvas().style.cursor = "pointer";
    }
  });
  map.on("mouseleave", "sightings", () => {
    map.getCanvas().style.cursor = "";
  });
  map.on("mousedown", onMouseDown);
  map.on("mousemove", onMouseMove);
  map.on("mouseup", onMouseUp);
}

// Only what the map draws, so typing in checklist fields does not rebuild every marker.
watch(
  () => [
    props.sightings.map((sighting) => [sighting.id, sighting.form_id, sighting.lat, sighting.lon]),
    props.forms.map((form) => [form.id, form.imported, form.lat, form.lon]),
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
  <div ref="container"></div>
</template>

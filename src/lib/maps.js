import { LngLatBounds, Map, NavigationControl, Popup, setWorkerUrl } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
// MapLibre 6 looks for its worker next to its own module, which the bundler moves. `?worker&url`
// makes Vite bundle the worker with the code it imports and give its URL (plain `?url` breaks the
// production build).
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import { findBasemap } from "./basemaps";

setWorkerUrl(workerUrl);

// A vector basemap is its style URL; a raster one a style with one source.
function styleFor(id) {
  const basemap = findBasemap(id);
  if (basemap.style) {
    return basemap.style;
  }

  const tileSize = basemap.retina && window.devicePixelRatio > 1 ? 128 : 256;
  return {
    version: 8,
    sources: { basemap: { type: "raster", tileSize, ...basemap.raster } },
    layers: [{ id: "basemap", type: "raster", source: "basemap" }],
  };
}

// The basemap select, styled like the zoom buttons above it. `groups`: see basemapGroups.
class BaseLayerControl {
  constructor({ value, groups, label, onChange }) {
    this.value = value;
    this.groups = groups;
    this.label = label;
    this.onChange = onChange;
  }

  onAdd() {
    this.container = document.createElement("label");
    this.container.className = "maplibregl-ctrl maplibregl-ctrl-group map-base-layer-control";
    this.container.title = this.label;
    this.container.innerHTML = '<i class="bi bi-layers" aria-hidden="true"></i>';
    this.select = document.createElement("select");
    this.select.setAttribute("aria-label", this.label);
    this.groups.forEach((group) => {
      const optgroup = document.createElement("optgroup");
      optgroup.label = group.label;
      group.options.forEach(({ value, label }) => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = label;
        optgroup.appendChild(option);
      });
      this.select.appendChild(optgroup);
    });
    this.select.value = this.value;
    this.select.addEventListener("change", () => this.onChange(this.select.value));
    this.container.appendChild(this.select);
    return this.container;
  }

  onRemove() {
    this.container.remove();
  }

  setValue(value) {
    if (this.select) {
      this.select.value = value;
    }
  }
}

// A map like the Leaflet ones it replaces: no rotation or tilt, zoom buttons and the basemap select
// at the top left. `onBaseLayerChange` gets the name chosen in the select.
export function createMap(
  container,
  { baseLayer, baseLayerGroups, baseLayerLabel, onBaseLayerChange },
) {
  const selectedName = findBasemap(baseLayer).id;
  const map = new Map({
    container,
    style: styleFor(selectedName),
    center: [0, 20],
    zoom: 1,
    maxZoom: 19,
    dragRotate: false,
    pitchWithRotate: false,
    touchPitch: false,
    attributionControl: { compact: true },
  });
  map.touchZoomRotate.disableRotation();
  map.keyboard.disableRotation();
  map.addControl(new NavigationControl({ showCompass: false }), "top-left");
  const baseLayerControl = new BaseLayerControl({
    value: selectedName,
    groups: baseLayerGroups,
    label: baseLayerLabel,
    onChange: onBaseLayerChange,
  });
  map.addControl(baseLayerControl, "top-left");

  let shownName = selectedName;
  return {
    map,
    // Replaces the whole style: the maps add their own sources and layers again on "style.load".
    setBaseLayer(name) {
      const nextName = findBasemap(name).id;
      baseLayerControl.setValue(nextName);
      if (nextName !== shownName) {
        shownName = nextName;
        map.setStyle(styleFor(nextName), { diff: false });
      }
    },
  };
}

// Fits the map to [lat, lon] points.
export function fitToPoints(map, points, maxZoom) {
  if (!points.length) {
    return;
  }

  const bounds = new LngLatBounds();
  points.forEach(([lat, lon]) => bounds.extend([Number(lon), Number(lat)]));
  map.fitBounds(bounds, { padding: 20, maxZoom, animate: false });
}

export const emptyFeatureCollection = () => ({ type: "FeatureCollection", features: [] });

export function pointFeature(lat, lon, properties = {}) {
  return {
    type: "Feature",
    properties,
    geometry: { type: "Point", coordinates: [Number(lon), Number(lat)] },
  };
}

// Number labels drawn on demand, so the map needs no font (raster basemaps have none). An icon
// named `count:<colour>:<text>` is created the first time a layer asks for it.
export function drawCountImages(map) {
  map.on("styleimagemissing", ({ id }) => {
    const [kind, color, text] = id.split(":");
    if (kind !== "count" || map.hasImage(id)) {
      return;
    }

    const pixelRatio = 2;
    const height = 12 * pixelRatio;
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    const font = `700 ${10 * pixelRatio}px system-ui, -apple-system, "Segoe UI", sans-serif`;
    context.font = font;
    canvas.width = Math.ceil(context.measureText(text).width) + 2 * pixelRatio;
    canvas.height = height;
    context.font = font;
    context.fillStyle = color;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(text, canvas.width / 2, height / 2 + pixelRatio / 2);
    map.addImage(id, context.getImageData(0, 0, canvas.width, canvas.height), { pixelRatio });
  });
}

// Pans the map so an open popup is fully visible, like Leaflet's autoPan.
export function panToPopup(map, popup, margin = 12) {
  const element = popup.getElement();
  if (!element) {
    return;
  }

  const box = element.getBoundingClientRect();
  const frame = map.getContainer().getBoundingClientRect();
  const shift = (start, end, frameStart, frameEnd) => {
    if (start < frameStart + margin) {
      return start - frameStart - margin;
    }
    return end > frameEnd - margin
      ? Math.min(end - frameEnd + margin, start - frameStart - margin)
      : 0;
  };
  const dx = shift(box.left, box.right, frame.left, frame.right);
  const dy = shift(box.top, box.bottom, frame.top, frame.bottom);
  if (dx || dy) {
    map.panBy([dx, dy], { duration: 250 });
  }
}

// A small label that follows the pointer over a feature or marker.
export function createHoverLabel(map) {
  const label = new Popup({
    closeButton: false,
    closeOnClick: false,
    focusAfterOpen: false,
    className: "map-hover-label",
    offset: 14,
    maxWidth: "280px",
  });
  return {
    show(lngLat, text, offset = 14) {
      label.setOffset(offset).setLngLat(lngLat).setText(text);
      if (!label.isOpen()) {
        label.addTo(map);
      }
    },
    hide() {
      label.remove();
    },
  };
}

// True when a key press belongs to a text field rather than to the map.
export function isTypingTarget(target) {
  return Boolean(target?.closest?.("input, textarea, select, [contenteditable='true']"));
}

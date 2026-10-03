import { LngLatBounds, Map, NavigationControl, Popup, setWorkerUrl } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
// MapLibre 6 looks for its worker next to its own module, which the bundler moves. `?worker&url`
// makes Vite bundle the worker with the code it imports and give its URL (plain `?url` breaks the
// production build).
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import { ASSIGNMENT_MAP_BASE_LAYER_OPTIONS } from "./constants";

setWorkerUrl(workerUrl);

// Keys are the names saved in settings (ASSIGNMENT_MAP_BASE_LAYER_OPTIONS). `retina`: on a
// high-density screen, use the tiles of the next zoom level at half size, so the labels stay small
// and sharp (Leaflet's detectRetina).
const BASE_LAYERS = {
  OpenStreetMap: {
    tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
    attribution: "&copy; OpenStreetMap contributors",
    maxzoom: 19,
  },
  Satellite: {
    tiles: [
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    ],
    attribution: "Tiles &copy; Esri",
    maxzoom: 19,
  },
  "Swiss (swisstopo)": {
    tiles: [
      "https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.pixelkarte-farbe/default/current/3857/{z}/{x}/{y}.jpeg",
    ],
    attribution: "&copy; swisstopo",
    maxzoom: 18,
    retina: true,
  },
  "France (IGN)": {
    tiles: [
      "https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&STYLE=normal&TILEMATRIXSET=PM&FORMAT=image/png&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}",
    ],
    attribution: "&copy; IGN/Geoportail",
    maxzoom: 19,
    retina: true,
  },
  "Germany (BKG)": {
    tiles: [
      "https://sgx.geodatenzentrum.de/wmts_basemapde/tile/1.0.0/de_basemapde_web_raster_farbe/default/GLOBAL_WEBMERCATOR/{z}/{y}/{x}.png",
    ],
    attribution: "&copy; basemap.de / BKG",
    maxzoom: 18,
  },
};

export function baseLayerName(name) {
  return ASSIGNMENT_MAP_BASE_LAYER_OPTIONS.includes(name) ? name : "OpenStreetMap";
}

function rasterStyle(name) {
  const { retina, ...source } = BASE_LAYERS[name];
  const tileSize = retina && window.devicePixelRatio > 1 ? 128 : 256;
  return {
    version: 8,
    sources: { basemap: { type: "raster", tileSize, ...source } },
    layers: [{ id: "basemap", type: "raster", source: "basemap" }],
  };
}

function styleFor(name) {
  return rasterStyle(baseLayerName(name));
}

// The basemap select, styled like the zoom buttons above it.
class BaseLayerControl {
  constructor({ name, label, onChange }) {
    this.name = name;
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
    ASSIGNMENT_MAP_BASE_LAYER_OPTIONS.forEach((name) => {
      const option = document.createElement("option");
      option.value = name;
      option.textContent = name;
      this.select.appendChild(option);
    });
    this.select.value = this.name;
    this.select.addEventListener("change", () => this.onChange(this.select.value));
    this.container.appendChild(this.select);
    return this.container;
  }

  onRemove() {
    this.container.remove();
  }

  setValue(name) {
    if (this.select) {
      this.select.value = name;
    }
  }
}

// A map like the Leaflet ones it replaces: no rotation or tilt, zoom buttons and the basemap select
// at the top left. `onBaseLayerChange` gets the name chosen in the select.
export function createMap(container, { baseLayer, baseLayerLabel, onBaseLayerChange }) {
  const selectedName = baseLayerName(baseLayer);
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
    name: selectedName,
    label: baseLayerLabel,
    onChange: onBaseLayerChange,
  });
  map.addControl(baseLayerControl, "top-left");

  let shownName = selectedName;
  return {
    map,
    // Replaces the whole style: the maps add their own sources and layers again on "style.load".
    setBaseLayer(name) {
      const nextName = baseLayerName(name);
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

import { LngLatBounds, Map, NavigationControl, setWorkerUrl } from "maplibre-gl";
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

const baseLayerId = (name) => `base-${ASSIGNMENT_MAP_BASE_LAYER_OPTIONS.indexOf(name)}`;

// Every basemap is in the style, and only the chosen one is visible: switching never reloads the
// style, so our own sources and layers stay. A hidden layer loads no tiles.
function baseStyle(selectedName) {
  const style = { version: 8, sources: {}, layers: [] };
  ASSIGNMENT_MAP_BASE_LAYER_OPTIONS.forEach((name) => {
    const id = baseLayerId(name);
    const { retina, ...source } = BASE_LAYERS[name];
    const tileSize = retina && window.devicePixelRatio > 1 ? 128 : 256;
    style.sources[id] = { type: "raster", tileSize, ...source };
    style.layers.push({
      id,
      type: "raster",
      source: id,
      layout: { visibility: name === selectedName ? "visible" : "none" },
    });
  });
  return style;
}

export function setBaseLayer(map, name) {
  const selectedName = baseLayerName(name);
  ASSIGNMENT_MAP_BASE_LAYER_OPTIONS.forEach((option) => {
    map.setLayoutProperty(
      baseLayerId(option),
      "visibility",
      option === selectedName ? "visible" : "none",
    );
  });
}

// A select in the map's corner, under the zoom buttons.
class BaseLayerControl {
  constructor({ name, label, onChange }) {
    this.name = name;
    this.label = label;
    this.onChange = onChange;
  }

  onAdd() {
    this.container = document.createElement("div");
    this.container.className = "maplibregl-ctrl map-base-layer-control";
    this.select = document.createElement("select");
    this.select.className = "form-select form-select-sm";
    this.select.setAttribute("aria-label", this.label);
    this.select.title = this.label;
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
    style: baseStyle(selectedName),
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

  return {
    map,
    setBaseLayer(name) {
      baseLayerControl.setValue(baseLayerName(name));
      setBaseLayer(map, name);
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

// A "+" drawn on a transparent square, for the groups of observations at one place.
export function plusImage(color) {
  const size = 28;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  context.strokeStyle = color;
  context.lineWidth = 3;
  context.beginPath();
  context.moveTo(size / 2, 7);
  context.lineTo(size / 2, size - 7);
  context.moveTo(7, size / 2);
  context.lineTo(size - 7, size / 2);
  context.stroke();
  return context.getImageData(0, 0, size, size);
}

// True when a key press belongs to a text field rather than to the map.
export function isTypingTarget(target) {
  return Boolean(target?.closest?.("input, textarea, select, [contenteditable='true']"));
}

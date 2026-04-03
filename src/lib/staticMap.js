const STATIC_MAP_BASE_URL = "https://api.mapbox.com/styles/v1/mapbox";
const STATIC_MAP_MAX_URL_LENGTH = 8192;
const DEFAULT_PADDING = 32;
const DEFAULT_MANUAL_ZOOM = 12;

function clampInteger(value, minimum, maximum) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return minimum;
  }
  return Math.min(maximum, Math.max(minimum, parsed));
}

function clampNumber(value, minimum, maximum, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(maximum, Math.max(minimum, parsed));
}

function normalizeHexColor(value, fallback) {
  const normalized = String(value || "").trim();
  return /^#[\da-fA-F]{6}$/.test(normalized) ? normalized : fallback;
}

function isFiniteLatLon(lat, lon) {
  return Number.isFinite(Number(lat)) && Number.isFinite(Number(lon));
}

function normalizeMarkerSize(value) {
  const normalized = String(value || "").toLowerCase();
  if (["small", "medium", "large"].includes(normalized)) {
    return normalized;
  }
  return "small";
}

function sanitizeCoordinates(points) {
  return points.filter((point) => isFiniteLatLon(point[0], point[1]));
}

function dedupeConsecutive(points) {
  const deduped = [];
  points.forEach((point) => {
    const last = deduped[deduped.length - 1];
    if (!last || last[0] !== point[0] || last[1] !== point[1]) {
      deduped.push(point);
    }
  });
  return deduped;
}

function samplePoints(points, maxPoints) {
  if (points.length <= maxPoints) {
    return points;
  }

  const sampled = [];
  const lastIndex = points.length - 1;
  for (let index = 0; index < maxPoints; index += 1) {
    const sampledIndex = Math.round((index * lastIndex) / (maxPoints - 1));
    sampled.push(points[sampledIndex]);
  }

  return dedupeConsecutive(sampled);
}

function buildFeatureCollection(pathPoints, markerPoints, mapSettings) {
  const features = [];

  if (pathPoints.length > 1) {
    const pathStyle = mapSettings?.pathStyle || {};
    features.push({
      type: "Feature",
      properties: {
        stroke: normalizeHexColor(pathStyle.strokeColor, "#AD8533"),
        "stroke-width": clampNumber(pathStyle.strokeWidth, 1, 20, 5),
        "stroke-opacity": clampNumber(pathStyle.strokeOpacity, 0, 1, 1),
      },
      geometry: {
        type: "LineString",
        coordinates: pathPoints.map(([lat, lon]) => [Number(lon), Number(lat)]),
      },
    });
  }

  if (markerPoints.length) {
    const markerStyle = mapSettings?.markerStyle || {};
    features.push({
      type: "Feature",
      properties: {
        "marker-size": normalizeMarkerSize(markerStyle.markerSize),
        "marker-symbol": markerStyle.markerSymbol || "circle",
        "marker-color": normalizeHexColor(markerStyle.markerColor, "#808080"),
      },
      geometry: {
        type: "MultiPoint",
        coordinates: markerPoints.map(([lat, lon]) => [Number(lon), Number(lat)]),
      },
    });
  }

  return {
    type: "FeatureCollection",
    features,
  };
}

function buildStaticMapUrl({
  form,
  sightings = [],
  token = "",
  settings = {},
  width = 300,
  height = 200,
  maxUrlLength = STATIC_MAP_MAX_URL_LENGTH,
}) {
  if (!settings?.show) {
    return { url: "", reason: "disabled" };
  }

  if (!token) {
    return { url: "", reason: "token_missing" };
  }

  const style = settings?.style || "satellite-v9";
  const clampedWidth = clampInteger(width, 1, 1280);
  const clampedHeight = clampInteger(height, 1, 1280);
  const clampedMaxUrlLength = clampInteger(maxUrlLength, 1, STATIC_MAP_MAX_URL_LENGTH);
  const padding = clampInteger(DEFAULT_PADDING, 0, 128);
  const zoomMode = form?.static_map_zoom_mode === "manual" ? "manual" : "auto";
  const manualZoom = clampNumber(form?.static_map_zoom, 0, 22, DEFAULT_MANUAL_ZOOM);

  const rawMarkers = sightings
    .map((sighting) => [Number(sighting.lat), Number(sighting.lon)])
    .filter((point) => isFiniteLatLon(point[0], point[1]));

  if (!rawMarkers.length && isFiniteLatLon(form?.lat, form?.lon)) {
    rawMarkers.push([Number(form.lat), Number(form.lon)]);
  }

  const rawPath = Array.isArray(form?.path)
    ? form.path.map((point) => [Number(point[0]), Number(point[1])])
    : [];

  const sanitizedPath = dedupeConsecutive(sanitizeCoordinates(rawPath));
  const sanitizedMarkers = dedupeConsecutive(sanitizeCoordinates(rawMarkers));

  if (!sanitizedPath.length && !sanitizedMarkers.length) {
    return { url: "", reason: "no_coordinates" };
  }

  const fallbackCenter = sanitizedMarkers[0] || sanitizedPath[0] || null;
  const centerPoint = isFiniteLatLon(form?.lat, form?.lon)
    ? [Number(form.lat), Number(form.lon)]
    : fallbackCenter;
  const useManualZoom = zoomMode === "manual" && Boolean(centerPoint);
  const camera = useManualZoom ? `${centerPoint[1]},${centerPoint[0]},${manualZoom}` : "auto";

  // Iteratively reduce point count until the URL fits Static Images API limits.
  const budgets = [240, 180, 120, 80, 50, 30, 15, 8];
  for (const budget of budgets) {
    const pathPoints = samplePoints(sanitizedPath, budget);
    const markerPoints = samplePoints(sanitizedMarkers, budget);
    const featureCollection = buildFeatureCollection(pathPoints, markerPoints, settings);
    const overlay = encodeURIComponent(JSON.stringify(featureCollection));
    const query = new URLSearchParams({
      access_token: token,
    });
    if (!useManualZoom) {
      query.set("padding", String(padding));
    }

    const url =
      `${STATIC_MAP_BASE_URL}/${encodeURIComponent(style)}/static/geojson(${overlay})/${camera}/` +
      `${clampedWidth}x${clampedHeight}?${query.toString()}`;

    if (url.length <= clampedMaxUrlLength) {
      return { url, reason: "" };
    }
  }

  return { url: "", reason: "url_too_long" };
}

export { buildStaticMapUrl };

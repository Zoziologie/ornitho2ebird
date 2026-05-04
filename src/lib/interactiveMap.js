import { speciesComment } from "./utils";

const GITHUB_GIST_API_URL = "https://api.github.com/gists";
const INTERACTIVE_MAP_VIEWER_URL = "https://zoziologie.raphaelnussbaumer.com/view-geojson/";

function hasFiniteLatLon(lat, lon) {
  return Number.isFinite(Number(lat)) && Number.isFinite(Number(lon));
}

function sanitizeFilenamePart(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9_-]/gi, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

export function buildInteractiveMapFilename(form) {
  const filenameBase = [form?.location_name, form?.date, form?.time]
    .map(sanitizeFilenamePart)
    .filter(Boolean)
    .join("_");

  return `${filenameBase || `checklist_${form?.id || "map"}`}.geojson`;
}

export function buildInteractiveMapGeoJson(form, sightings = [], speciesCommentTemplate = null) {
  const features = sightings
    .filter((sighting) => hasFiniteLatLon(sighting.lat, sighting.lon))
    .map((sighting) => ({
      type: "Feature",
      properties: {
        date: `${sighting.date || ""} ${sighting.time || ""}`.trim(),
        specie: sighting.common_name || "",
        latin: sighting.scientific_name || "",
        place: sighting.location_name || "",
        observer: "",
        count: sighting.count,
        comment: sighting.comment || "",
        img: "",
        id: sighting.id,
        "marker-color": "F7D826",
        "marker-size": "m",
        "marker-symbol": "1",
        description: speciesComment(speciesCommentTemplate || form?.species_comment_template, [sighting]),
        link: "",
      },
      geometry: {
        type: "Point",
        coordinates: [Number(sighting.lon), Number(sighting.lat)],
      },
    }));

  const pathCoordinates = Array.isArray(form?.path)
    ? form.path
        .filter((point) => hasFiniteLatLon(point?.[0], point?.[1]))
        .map((point) => [Number(point[1]), Number(point[0])])
    : [];

  if (pathCoordinates.length > 1) {
    features.push({
      type: "Feature",
      properties: {},
      geometry: {
        type: "LineString",
        coordinates: pathCoordinates,
      },
    });
  }

  return {
    type: "FeatureCollection",
    features,
  };
}

export function buildInteractiveMapViewerUrl(rawUrl) {
  return rawUrl ? `${INTERACTIVE_MAP_VIEWER_URL}?${encodeURIComponent(rawUrl)}` : "";
}

export async function createInteractiveMapGist({
  form,
  sightings = [],
  speciesCommentTemplate = null,
  token = "",
}) {
  const filename = buildInteractiveMapFilename(form);
  const content = JSON.stringify(buildInteractiveMapGeoJson(form, sightings, speciesCommentTemplate));
  const trimmedToken = String(token || "").trim();

  if (!trimmedToken) {
    throw new Error("missing_token");
  }

  const response = await fetch(GITHUB_GIST_API_URL, {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${trimmedToken}`,
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: JSON.stringify({
      description: `ornitho2ebird interactive map for ${form?.location_name || "checklist"}`,
      public: true,
      files: {
        [filename]: {
          content,
        },
      },
    }),
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = result?.message || `GitHub returned ${response.status}`;
    throw new Error(message);
  }

  const rawUrl = result?.files?.[filename]?.raw_url;
  if (!rawUrl) {
    throw new Error("missing_raw_url");
  }

  return {
    filename,
    rawUrl,
    gistUrl: result.html_url || "",
  };
}

import { markRaw } from "vue";
import {
  BASIC_SPECIES_COMMENT_TEMPLATE,
  DEFAULT_SPECIES_COMMENT_TEMPLATE,
  LOCATION_NAME_MAX_LENGTH,
} from "./constants";

function normalizeName(value) {
  return String(value || "")
    .normalize("NFC")
    .trim();
}

export function normalizeLocationName(value, fallback = "") {
  const normalized = normalizeName(value || fallback);
  return normalized.slice(0, LOCATION_NAME_MAX_LENGTH);
}

export function formatNumber(value) {
  return Number(value || 0).toLocaleString("en-US");
}

export function mathMode(values) {
  const counts = new Map();

  values.forEach((value) => {
    counts.set(value, (counts.get(value) || 0) + 1);
  });

  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
}

export function mathRound(value, exponent) {
  if (value === null || value === undefined || value === "") {
    return value;
  }

  const factor = 10 ** exponent;
  return Math.round(Number(value) * factor) / factor;
}

export function formatDate(date, separator = "-") {
  if (!date) {
    return "";
  }

  const safeDate = new Date(`${date}T00:00:00`);
  const month = String(safeDate.getMonth() + 1).padStart(2, "0");
  const day = String(safeDate.getDate()).padStart(2, "0");
  return `${month}${separator}${day}${separator}${safeDate.getFullYear()}`;
}

export async function copyClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function haversineDistanceKm(lat1, lon1, lat2, lon2) {
  const toRadians = (value) => (value * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) ** 2;

  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function distanceFromPath(path) {
  if (!Array.isArray(path) || path.length < 2) {
    return 0;
  }

  let distance = 0;
  for (let index = 1; index < path.length; index += 1) {
    distance += haversineDistanceKm(
      path[index - 1][0],
      path[index - 1][1],
      path[index][0],
      path[index][1],
    );
  }

  return mathRound(distance, 2);
}

// Estimate unique route length by removing nearly collinear overlaps (within 1 m).
// Keep the original track: parallel nearby trails and larger GPS drift still need review.
export function uniqueDistanceFromPath(path) {
  if (!path || path.length < 2) return 0;
  const scale = Math.cos((path[0][0] * Math.PI) / 180);
  const points = path.map(([lat, lon]) => [lon * scale * 111195, lat * 111195]);
  const segments = [];
  let distance = 0;
  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1];
    const end = points[index];
    const dx = end[0] - start[0];
    const dy = end[1] - start[1];
    const length = Math.hypot(dx, dy);
    if (length === 0) continue;
    const overlaps = [];
    for (const [a, b] of segments) {
      const previousLength = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const cross = Math.abs(dx * (b[1] - a[1]) - dy * (b[0] - a[0]));
      if (cross / (length * previousLength) > Math.sin(Math.PI / 180)) continue;
      const offsetA = Math.abs(dx * (a[1] - start[1]) - dy * (a[0] - start[0])) / length;
      const offsetB = Math.abs(dx * (b[1] - start[1]) - dy * (b[0] - start[0])) / length;
      if (offsetA > 1 || offsetB > 1) continue;
      const alongA = ((a[0] - start[0]) * dx + (a[1] - start[1]) * dy) / length;
      const alongB = ((b[0] - start[0]) * dx + (b[1] - start[1]) * dy) / length;
      const from = Math.max(0, Math.min(alongA, alongB));
      const to = Math.min(length, Math.max(alongA, alongB));
      if (to > from) overlaps.push([from, to]);
    }
    overlaps.sort((a, b) => a[0] - b[0]);
    let covered = 0;
    let previousEnd = 0;
    for (const [from, to] of overlaps) {
      covered += Math.max(0, to - Math.max(from, previousEnd));
      previousEnd = Math.max(previousEnd, to);
    }
    distance += haversineDistanceKm(...path[index - 1], ...path[index]) * (1 - covered / length);
    segments.push([start, end]);
  }
  return mathRound(distance, 3);
}

export function mortalityStatus(sighting) {
  const wounded = sighting.extended_info?.mortality?.wounded;
  if (wounded === "0") return "dead";
  if (wounded === "1") return "injured";
  return sighting.has_death && sighting.has_death !== "0" ? "unknown" : "none";
}

export function isExportableSighting(sighting) {
  return (
    mortalityStatus(sighting) !== "dead" &&
    !(sighting.count !== null && sighting.count !== "" && Number(sighting.count) === 0)
  );
}

export function checklistReview(form, sightings) {
  const dates = [...new Set(sightings.map((sighting) => sighting.date))].sort();
  const [hour, minute] = (form.time || "00:00").split(":").map(Number);
  const crossesMidnight =
    form.crosses_midnight || hour * 60 + minute + Number(form.duration) > 1440;
  return {
    dateWarning: Boolean(crossesMidnight || dates.some((date) => date !== form.date)),
    canSplit: dates.length > 1 && sightings.every((sighting) => sighting.date && sighting.time),
    dates,
  };
}

// Robust spatial extent, independent of the first fix. Retain at least 95% of positions.
// This estimates movement, not GPS certainty: a brief genuine excursion can be trimmed too.
export function trackExtentKm(path) {
  const center = [0, 1].map((axis) => {
    const values = path.map((point) => point[axis]).sort((a, b) => a - b);
    return (
      (values[Math.floor((values.length - 1) / 2)] + values[Math.floor(values.length / 2)]) / 2
    );
  });
  const distances = path.map((point) => haversineDistanceKm(...center, ...point));
  const cutoff = [...distances].sort((a, b) => a - b)[
    path.length - Math.floor(path.length * 0.05) - 1
  ];
  const retained = path.filter((point, index) => distances[index] <= cutoff);
  let extent = 0;
  for (let index = 0; index < retained.length; index += 1) {
    for (let other = 0; other < index; other += 1) {
      extent = Math.max(extent, haversineDistanceKm(...retained[index], ...retained[other]));
    }
  }
  return extent;
}

export function protocol(form) {
  const stationaryDistanceThresholdKm = 0.03;

  if (!form?.date || Number(form?.duration) >= 1440) {
    return {
      name: "Invalid",
      letter: "X",
      variant: "danger",
    };
  }

  if (!form.primary_purpose) {
    return {
      name: "Incidental",
      letter: "I",
      variant: "warning",
    };
  }

  const hasDistance =
    form.distance !== "" &&
    form.distance !== null &&
    form.distance !== undefined &&
    Number.isFinite(Number(form.distance)) &&
    Number(form.distance) >= 0;

  if (form.time && hasDistance && Number(form.duration) > 0 && Number(form.number_observer) > 0) {
    const stationary =
      Number(form.distance) === 0 ||
      (form.path?.length > 1
        ? trackExtentKm(form.path) <= stationaryDistanceThresholdKm
        : Number(form.distance) <= stationaryDistanceThresholdKm);
    return !stationary
      ? { name: "Traveling", letter: "T", variant: "success" }
      : { name: "Stationary", letter: "S", variant: "success" };
  }

  return {
    name: "Historical",
    letter: "H",
    variant: "warning",
  };
}

// Imported text must not open tags or break out of the href="..." attributes built by templates.
// Only "<" and '"' are encoded so the exported text stays identical for ordinary data.
function escapeTemplateText(value) {
  return String(value).replaceAll("<", "&lt;").replaceAll('"', "&quot;");
}

function templateSighting(sighting) {
  return Object.fromEntries(
    Object.entries(sighting).map(([key, value]) => [
      key,
      // comment is already escaped HTML (see createSighting)
      typeof value === "string" && key !== "comment" ? escapeTemplateText(value) : value,
    ]),
  );
}

// The same few expressions are evaluated for every sighting: compile each one once.
// Returns null for an expression that does not compile.
const compiledTemplateExpressions = new Map();

function compileTemplateExpression(expression) {
  if (!compiledTemplateExpressions.has(expression)) {
    // Editing a template in Settings compiles every partial expression typed: keep it bounded.
    if (compiledTemplateExpressions.size > 500) {
      compiledTemplateExpressions.clear();
    }
    let evaluate;
    try {
      evaluate = Function("context", `with (context) { return String(${expression}); }`);
    } catch {
      evaluate = null;
    }
    compiledTemplateExpressions.set(expression, evaluate);
  }
  return compiledTemplateExpressions.get(expression);
}

export function speciesComment(speciesCommentTemplate, sightings) {
  if (!speciesCommentTemplate || !sightings?.length) {
    return "";
  }

  const template =
    sightings.length < Number(speciesCommentTemplate.limit || 5)
      ? speciesCommentTemplate.short
      : speciesCommentTemplate.long;
  const separator = sightings.length < Number(speciesCommentTemplate.limit || 5) ? "<br/>" : ", ";

  return sightings
    .map((sighting) => {
      const context = { s: templateSighting(sighting) };
      return template
        .split("${")
        .map((chunk, index) => {
          if (index === 0) {
            return chunk;
          }

          // The expression ends at the first "}"; anything after it, including further "}", is literal text.
          const end = chunk.indexOf("}");
          if (end === -1) {
            return `\${${chunk}`;
          }
          const expression = chunk.slice(0, end);
          const suffix = chunk.slice(end + 1);

          const evaluate = compileTemplateExpression(expression);
          if (!evaluate) {
            return suffix;
          }
          try {
            return evaluate(context).replace(/(?:\r\n|\r|\n)/g, "<br>") + suffix;
          } catch {
            return suffix;
          }
        })
        .join("");
    })
    .filter((comment) => String(comment).trim() !== "")
    .join(separator);
}

export function buildSpeciesRows(
  sightings,
  speciesCommentTemplate,
  commonNameForSighting = (sighting) => sighting?.common_name || "",
) {
  const speciesGroups = new Map();

  sightings.forEach((sighting) => {
    const key = sighting.ebird_species_code || sighting.common_name || "";
    const groupedSightings = speciesGroups.get(key) || [];
    groupedSightings.push(sighting);
    speciesGroups.set(key, groupedSightings);
  });

  return [...speciesGroups.values()].map((duplicates) => {
    let numericCount = 0;
    let hasNonNumericCount = false;

    duplicates.forEach((sighting) => {
      const parsedCount = Number.parseInt(sighting.count, 10);
      if (Number.isNaN(parsedCount)) {
        hasNonNumericCount = true;
        return;
      }

      numericCount += parsedCount;
    });

    return {
      common_name: commonNameForSighting(duplicates[0]),
      count: hasNonNumericCount ? "X" : numericCount,
      species_comment: speciesComment(speciesCommentTemplate, duplicates),
      sightings: duplicates,
    };
  });
}

export function checklistComment(form, sightings, importedWithText, options = {}) {
  const comment = form.checklist_comment || "";
  const staticMapUrl = options.staticMapUrl || "";
  const interactiveMapUrl = options.interactiveMapUrl || "";
  const staticMapImageTag = staticMapUrl
    ? `<img src="${staticMapUrl}" alt="Checklist static map" style="max-width:300px;width:100%;display:block;margin-top:0.5rem;">`
    : "";
  const staticMapImage =
    staticMapImageTag && interactiveMapUrl
      ? `<a href="${interactiveMapUrl}" target="_blank" rel="noopener">${staticMapImageTag}</a>`
      : staticMapImageTag;
  const importedWithLink = `<a href="https://ornitho2ebird.com/" target="_blank" rel="noopener">${importedWithText}</a>`;
  return `${comment}${staticMapImage}${comment || staticMapImage ? "<br/>" : ""}<small>${importedWithLink}</small>`;
}

export function buildSpeciesCommentTemplate(website) {
  if (!website) {
    return {
      short: "",
      long: "",
      limit: 20,
    };
  }

  if (website.system === "ornitho") {
    return { ...DEFAULT_SPECIES_COMMENT_TEMPLATE };
  }

  if (website.system === "birdlasser") {
    return {
      short: BASIC_SPECIES_COMMENT_TEMPLATE.short,
      long: BASIC_SPECIES_COMMENT_TEMPLATE.short,
      limit: 20,
    };
  }

  if (website.system === "observation") {
    return {
      short: BASIC_SPECIES_COMMENT_TEMPLATE.short,
      long: BASIC_SPECIES_COMMENT_TEMPLATE.long,
      limit: 20,
    };
  }

  return {
    short: "",
    long: "",
    limit: 20,
  };
}

export function buildChecklistPayloadFromSightings(sightings, options = {}) {
  if (!Array.isArray(sightings) || sightings.length === 0) {
    return null;
  }

  return {
    location_name: mathMode(sightings.map((sighting) => sighting.location_name)),
    date: sightings[0].date,
    time: sightings[0].time,
    lat: sightings.reduce((sum, sighting) => sum + sighting.lat, 0) / sightings.length,
    lon: sightings.reduce((sum, sighting) => sum + sighting.lon, 0) / sightings.length,
    species_comment_template: options.speciesCommentTemplate,
    primary_purpose: false,
    full_form: false,
  };
}

export function applyDefaultAutomaticAssignment({
  forms,
  sightings,
  autoAssignDuration,
  autoAssignDistance,
  defaultNumberObserver,
  speciesCommentTemplate,
}) {
  if (!Array.isArray(forms) || !Array.isArray(sightings) || !sightings.length) {
    return;
  }

  const unassigned = [...sightings]
    .filter((sighting) => sighting.form_id === 0)
    .sort((left, right) => {
      const leftTime = new Date(`${left.date}T${left.time || "00:00"}`).getTime();
      const rightTime = new Date(`${right.date}T${right.time || "00:00"}`).getTime();
      if (leftTime !== rightTime) {
        return leftTime - rightTime;
      }

      if (left.lat !== right.lat) {
        return left.lat - right.lat;
      }

      return left.lon - right.lon;
    });
  if (!unassigned.length) {
    return;
  }

  const assignDurationHours = Number(autoAssignDuration) || 1;
  const assignDistanceKm = Number(autoAssignDistance) || 3;
  const newSightingsByFormId = new Map();
  const datetimes = unassigned.map((sighting) => {
    return sighting.time
      ? new Date(`${sighting.date}T${sighting.time}`)
      : new Date(`${sighting.date}T00:00:00`);
  });
  const firstGeneratedFormId = Math.max(0, ...forms.map((form) => Number(form.id) || 0)) + 1;
  let nextFormId = firstGeneratedFormId;

  for (let index = 0; index < unassigned.length; index += 1) {
    for (let compare = index - 1; compare >= 0; compare -= 1) {
      const sameDay =
        datetimes[index].getFullYear() === datetimes[compare].getFullYear() &&
        datetimes[index].getMonth() === datetimes[compare].getMonth() &&
        datetimes[index].getDate() === datetimes[compare].getDate();

      if (
        sameDay &&
        Math.abs(datetimes[index] - datetimes[compare]) < assignDurationHours * 60 * 60 * 1000
      ) {
        const km = haversineDistanceKm(
          unassigned[compare].lat,
          unassigned[compare].lon,
          unassigned[index].lat,
          unassigned[index].lon,
        );
        if (km < assignDistanceKm) {
          unassigned[index].form_id = unassigned[compare].form_id;
        }
      }
    }

    if (unassigned[index].form_id === 0) {
      unassigned[index].form_id = nextFormId;
      nextFormId += 1;
    }

    const groupedSightings = newSightingsByFormId.get(unassigned[index].form_id) || [];
    groupedSightings.push(unassigned[index]);
    newSightingsByFormId.set(unassigned[index].form_id, groupedSightings);
  }

  for (let formId = firstGeneratedFormId; formId < nextFormId; formId += 1) {
    const matchedSightings = newSightingsByFormId.get(formId) || [];
    if (!matchedSightings.length) {
      continue;
    }

    const payload = buildChecklistPayloadFromSightings(matchedSightings, {
      speciesCommentTemplate,
    });

    forms.push(
      buildForm(payload, formId, {
        defaultNumberObserver,
      }),
    );
  }
}

export function buildForm(form, id, options = {}) {
  const template = {
    short: form.species_comment_template?.short || "",
    long: form.species_comment_template?.long || "",
    limit: form.species_comment_template?.limit || 5,
  };

  const builtForm = {
    id,
    imported: Boolean(form.imported),
    exportable: form.exportable !== false,
    location_name: normalizeLocationName(form.location_name, `Checklist ${id}`),
    hotspot_id: form.hotspot_id || "",
    lat: form.hotspot_id ? form.lat : mathRound(form.lat, 6),
    lon: form.hotspot_id ? form.lon : mathRound(form.lon, 6),
    date: form.date || "",
    time: form.time ? form.time.substring(0, 5) : "",
    duration: form.duration || "",
    crosses_midnight: Boolean(form.crosses_midnight),
    distance: form.distance === 0 ? 0 : (form.distance ?? ""),
    number_observer: form.number_observer || options.defaultNumberObserver || 1,
    full_form: form.primary_purpose !== false && Boolean(form.full_form),
    primary_purpose: form.primary_purpose !== false,
    include_static_map: form.include_static_map !== false,
    checklist_comment: form.checklist_comment || "",
    species_comment_template: template,
    static_map_zoom_mode: form.static_map_zoom_mode === "manual" ? "manual" : "auto",
    static_map_zoom: Number.isFinite(Number(form.static_map_zoom))
      ? Number(form.static_map_zoom)
      : 12,
    interactive_map_url: form.interactive_map_url || form.static_map?.gist || "",
    // Traces and hotspot lists can be large and are only ever replaced as a whole.
    path: form.path ? markRaw(form.path) : null,
    hotspots: markRaw(form.hotspots || []),
    hotspot_key: form.hotspot_key || "",
  };

  return builtForm;
}

// Turn parsed import data into app state: build the imported checklists, then group casual
// sightings into new checklists with the automatic-assignment settings.
export function assembleImport(
  payload,
  { defaultNumberObserver, autoAssignDuration, autoAssignDistance, speciesCommentTemplate },
) {
  const forms = (payload.forms || []).map((form, index) =>
    buildForm(form, index + 1, { defaultNumberObserver }),
  );
  const sightings = payload.sightings || [];

  applyDefaultAutomaticAssignment({
    forms,
    sightings,
    autoAssignDuration,
    autoAssignDistance,
    defaultNumberObserver,
    speciesCommentTemplate,
  });

  return { forms, sightings, formsSightings: payload.formsSightings || [] };
}

export function createSighting(raw) {
  const roundedLat = mathRound(raw.lat, 6);
  const roundedLon = mathRound(raw.lon, 6);
  const hasCoordinates = Number.isFinite(Number(roundedLat)) && Number.isFinite(Number(roundedLon));
  const coordinates = hasCoordinates ? `${roundedLat}, ${roundedLon}` : "";
  const googleMapsUrl = hasCoordinates
    ? `https://maps.google.com/?q=${roundedLat},${roundedLon}`
    : "";

  return {
    id: raw.id,
    form_id: raw.form_id,
    website: raw.website || "",
    system: raw.system || "",
    permalink: raw.permalink || "",
    source_website_name: raw.source_website_name || raw.website || "",
    source_record_url: raw.source_record_url || raw.permalink || "",
    location_name: normalizeLocationName(raw.location_name),
    lat: roundedLat,
    lon: roundedLon,
    coordinates,
    google_maps_url: googleMapsUrl,
    date: raw.date,
    time: raw.time ? raw.time.substring(0, 5) : "",
    common_name: raw.common_name || "",
    scientific_name: raw.scientific_name || "",
    source_species_id: raw.source_species_id || "",
    ebird_species_code: raw.ebird_species_code || "",
    count: raw.count ?? null,
    count_precision: raw.count_precision || "",
    atlas_code: raw.atlas_code ?? "",
    auditory_contact: raw.auditory_contact ?? "",
    has_death: raw.has_death || "",
    extended_info: raw.extended_info || {},
    // Stored as HTML: escape the imported text, keep line breaks.
    comment: raw.comment
      ? String(raw.comment).replaceAll("<", "&lt;").replace(/\r?\n/g, "<br>")
      : "",
  };
}

// Groups items ({ lat, lon }) that lie within `meters` of a group's first item. Sorted by latitude,
// so each item is compared only with the groups of the last few metres of latitude.
export function groupByLocation(items, meters) {
  const maxLatitudeDelta = meters / 111000;
  const groups = [];
  const sorted = [...items].sort((left, right) => Number(left.lat) - Number(right.lat));
  for (const item of sorted) {
    const lat = Number(item.lat);
    const lon = Number(item.lon);
    let group = null;
    for (let index = groups.length - 1; index >= 0; index -= 1) {
      const candidate = groups[index];
      if (lat - candidate.lat > maxLatitudeDelta) {
        break;
      }
      if (haversineDistanceKm(candidate.lat, candidate.lon, lat, lon) * 1000 <= meters) {
        group = candidate;
        break;
      }
    }
    if (group) {
      group.items.push(item);
    } else {
      groups.push({ lat, lon, items: [item] });
    }
  }
  return groups;
}

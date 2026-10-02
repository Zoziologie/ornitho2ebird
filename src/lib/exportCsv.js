import { buildStaticMapUrl } from "./staticMap";
import { buildInteractiveMapViewerUrl } from "./interactiveMap";
import {
  buildSpeciesRows,
  checklistComment,
  formatDate,
  mathRound,
  normalizeLocationName,
  protocol,
} from "./utils";

export const EBIRD_COMMENT_MAX_LENGTH = 8000;
const EBIRD_MAX_COUNT = 999999;
const KM_TO_MILES = 0.621371;

// eBird Record Format (Extended): the column order is fixed by eBird, the keys are ours.
export const EXPORT_COLUMNS = [
  "common_name",
  "Genus",
  "Species",
  "count",
  "species_comment",
  "location_name",
  "latitude",
  "longitude",
  "date",
  "time",
  "state",
  "country",
  "protocol",
  "number_observer",
  "Duration",
  "full_form",
  "distance",
  "area_covered",
  "checklist_comment",
];

export function exportableFormsOf(forms) {
  return forms
    .map((form) => ({ form, protocolState: protocol(form) }))
    .filter(({ form, protocolState }) => form.exportable && protocolState.name !== "Invalid");
}

// Casual sightings and the sightings of imported checklists, grouped by the exportable form they belong to.
export function groupSightingsByForm(exportableForms, sightings, formsSightings) {
  const formIds = new Set(exportableForms.map(({ form }) => form.id));
  const sightingsByFormId = new Map();

  const appendSighting = (sighting) => {
    if (!formIds.has(sighting.form_id)) {
      return;
    }

    const groupedSightings = sightingsByFormId.get(sighting.form_id) || [];
    groupedSightings.push(sighting);
    sightingsByFormId.set(sighting.form_id, groupedSightings);
  };

  sightings.forEach(appendSighting);
  formsSightings.forEach((formSightings) => formSightings.forEach(appendSighting));
  return sightingsByFormId;
}

export function escapeCsvValue(value) {
  const normalized = value ?? "";
  const stringValue = String(normalized).replace(/\r\n|\r|\n/g, " ");
  const escaped = stringValue.replaceAll('"', '""');
  return /[",]/.test(escaped) ? `"${escaped}"` : escaped;
}

export function rowsToCsv(rows) {
  return rows.map((row) => EXPORT_COLUMNS.map((column) => escapeCsvValue(row[column])).join(",")).join("\n");
}

function maxStaticMapUrlLengthForComment(form, sightings, importedWithText, interactiveMapUrl = "") {
  const commentWithoutMap = checklistComment(form, sightings, importedWithText, {
    staticMapUrl: "",
    interactiveMapUrl,
  });
  const placeholderUrl = "x";
  const commentWithPlaceholderMap = checklistComment(form, sightings, importedWithText, {
    staticMapUrl: placeholderUrl,
    interactiveMapUrl,
  });
  const staticMapWrapperLength = commentWithPlaceholderMap.length - commentWithoutMap.length - placeholderUrl.length;
  return Math.max(0, EBIRD_COMMENT_MAX_LENGTH - commentWithoutMap.length - staticMapWrapperLength);
}

function rowHasError(row) {
  return (
    !row.common_name ||
    (row.count !== "X" && Number(row.count) > EBIRD_MAX_COUNT) ||
    (row.count !== "X" && Number(row.count) < 0) ||
    (row.species_comment || "").length > EBIRD_COMMENT_MAX_LENGTH ||
    (row.checklist_comment || "").length > EBIRD_COMMENT_MAX_LENGTH ||
    !row.date
  );
}

// One eBird row per species and checklist. Rows eBird would reject are also returned in `errors`.
export function buildExportRows({
  exportableForms,
  sightingsByFormId,
  speciesCommentTemplate,
  commonNameForSighting,
  importedWithText,
  mapboxToken = "",
  globalStaticMap = null,
}) {
  const errors = [];

  const rows = exportableForms.flatMap(({ form, protocolState }) => {
    const formSightings = sightingsByFormId.get(form.id) || [];
    const interactiveMapUrl =
      globalStaticMap?.interactive && form.include_static_map !== false && form.interactive_map_url
        ? buildInteractiveMapViewerUrl(form.interactive_map_url)
        : "";
    const maxStaticMapUrlLength = maxStaticMapUrlLengthForComment(
      form,
      formSightings,
      importedWithText,
      interactiveMapUrl,
    );
    const staticMapUrl =
      form.include_static_map !== false && maxStaticMapUrlLength > 0
        ? buildStaticMapUrl({
            form,
            sightings: formSightings,
            token: mapboxToken,
            settings: globalStaticMap,
            width: 640,
            height: 420,
            maxUrlLength: maxStaticMapUrlLength,
          }).url
        : "";
    const mergedComment = checklistComment(form, formSightings, importedWithText, {
      staticMapUrl,
      interactiveMapUrl,
    });
    return buildSpeciesRows(formSightings, speciesCommentTemplate, commonNameForSighting).map((speciesRow) => {
      const row = {
        common_name: speciesRow.common_name,
        Genus: "",
        Species: "",
        count: speciesRow.count,
        species_comment: speciesRow.species_comment,
        location_name: normalizeLocationName(form.location_name),
        latitude: form.lat ?? "",
        longitude: form.lon ?? "",
        date: formatDate(form.date, "/"),
        time: form.time ? form.time.substring(0, 5) : "",
        state: "",
        country: "",
        protocol: protocolState.name,
        number_observer: form.number_observer,
        Duration: Number(form.duration) > 0 ? form.duration : "",
        full_form: form.full_form ? "Y" : "N",
        distance: Number(form.distance) > 0 ? mathRound(Number(form.distance) * KM_TO_MILES, 3) : "",
        area_covered: "",
        checklist_comment: mergedComment,
      };

      if (rowHasError(row)) {
        errors.push(row);
      }
      return row;
    });
  });

  return { rows, errors };
}

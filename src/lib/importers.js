import Papa from "papaparse";
import { buildSpeciesCommentTemplate, createSighting, distanceFromPath, mathMode } from "./utils";
import { getOrnithoEbirdSpeciesCode } from "./taxonomy";

const precisionMatchOrnitho = {
  MINIMUM: ">",
  EXACT_VALUE: "=",
  ESTIMATION: "~",
  NO_VALUE: "",
};

const precisionMatchObservation = {
  unknown: ">",
  "seen not counted": "",
  "real count": "=",
  estimated: "~",
  extrapolated: "~",
  abundance: "~",
};

// Import failure with a user-facing reason: `key` is an i18n message key, `params` its values.
// Reads a WKT "LINESTRING(lon lat, lon lat, ...)" into [[lat, lon], ...]. Returns null for
// anything else (other geometry types, 3D points, fewer than two points).
export function parseWktLineString(wkt) {
  const match = /^\s*LINESTRING\s*\(([^()]*)\)\s*$/i.exec(String(wkt || ""));
  if (!match) {
    return null;
  }

  const path = [];
  for (const point of match[1].split(",")) {
    const values = point.trim().split(/\s+/).map(Number);
    if (values.length !== 2 || !values.every(Number.isFinite)) {
      return null;
    }
    path.push([values[1], values[0]]);
  }
  return path.length >= 2 ? path : null;
}

export class ImportError extends Error {
  constructor(key, params = {}) {
    super(key);
    this.name = "ImportError";
    this.key = key;
    this.params = params;
  }
}

// Each entry is a column name, or a list of alternative names of which one must be present.
function requireColumns(rows, columns) {
  const header = Object.keys(rows[0] || {});
  const missing = columns
    .map((column) => (Array.isArray(column) ? column : [column]))
    .filter((alternatives) => !alternatives.some((name) => header.includes(name)))
    .map((alternatives) => alternatives.join(" / "));
  if (missing.length > 0) {
    throw new ImportError("importErrorMissingColumns", { columns: missing.join(", ") });
  }
}

function formatOrnithoDetails(details) {
  if (!Array.isArray(details) || details.length === 0) {
    return "";
  }

  return details
    .map((detail) => {
      const count = String(detail.count || "x").trim();
      const sex = detail.sex?.["@id"] !== "U" ? String(detail.sex?.["#text"] || "").trim() : "";
      const age = detail.age?.["@id"] !== "U" ? String(detail.age?.["#text"] || "").trim() : "";
      return [`${count}x`, sex, age].filter(Boolean).join(" ").trim();
    })
    .filter(Boolean)
    .join(", ");
}

function ornithoSightingsTransformation(sightings, formId, selectedWebsite) {
  return sightings.map((sighting) => {
    const observer = sighting.observers[0];
    const datetime = observer.timing["@ISO8601"].split("+")[0];

    const baseComment = observer.comment || "";
    const detailsComment = formatOrnithoDetails(observer.details);
    const comment =
      baseComment && detailsComment
        ? `${baseComment} - ${detailsComment}`
        : baseComment || detailsComment;

    const speciesId = sighting.species["@id"];
    const commonName = sighting.species.name || "";

    return createSighting({
      id: observer.id_sighting,
      form_id: formId,
      website: selectedWebsite.name,
      source_website_name: selectedWebsite.name,
      source_record_url: `${selectedWebsite.website}index.php?m_id=54&id=${observer.id_sighting}`,
      system: selectedWebsite.system,
      permalink: `${selectedWebsite.website}index.php?m_id=54&id=${observer.id_sighting}`,
      date: datetime.split("T")[0],
      time: observer.timing["@notime"] === "1" ? "" : datetime.split("T")[1],
      lat: Number.parseFloat(observer.coord_lat),
      lon: Number.parseFloat(observer.coord_lon),
      location_name: sighting.place.name,
      common_name: commonName,
      scientific_name: sighting.species.latin_name || "",
      source_species_id: speciesId || "",
      ebird_species_code: getOrnithoEbirdSpeciesCode(speciesId),
      count: observer.estimation_code === "NO_VALUE" ? "x" : observer.count,
      count_precision: precisionMatchOrnitho[observer.estimation_code],
      atlas_code: observer.atlas_code?.["#text"] || "",
      auditory_contact: observer.auditory_contact,
      comment,
    });
  });
}

// Parse an export file from the selected website into forms (checklists), casual
// sightings and the sightings of each form. Ornitho files need loadOrnithoSpeciesList() first.
export function parseImportFile(rawText, selectedWebsite) {
  const exportData = {
    forms: [],
    sightings: [],
    formsSightings: [],
    skipped: { emptyForms: 0, noCoordinates: 0 },
  };

  if (selectedWebsite.system === "ornitho") {
    let data;
    try {
      data = JSON.parse(rawText).data;
    } catch {
      throw new ImportError("importErrorInvalidJson");
    }
    if (!data || typeof data !== "object") {
      throw new ImportError("importErrorInvalidJson");
    }

    const allForms = data.forms || [];
    // A checklist without sightings has no date and nothing to import.
    data.forms = allForms.filter((form) => form.sightings?.length > 0);
    exportData.skipped.emptyForms = allForms.length - data.forms.length;
    data.sightings = data.sightings || [];

    exportData.sightings = ornithoSightingsTransformation(data.sightings, 0, selectedWebsite);
    exportData.forms = data.forms.map((form, index) => {
      const date = form.sightings[0].observers[0].timing["@ISO8601"].split("T")[0];
      const timeStart = `${date}T${form.time_start}`;
      const timeStop = `${date}T${form.time_stop}`;
      let duration = (new Date(timeStop) - new Date(timeStart)) / 1000 / 60;
      if (duration < 0) {
        // The checklist ended after midnight.
        duration += 24 * 60;
      }

      const path = parseWktLineString(form.protocol?.wkt || form.trace);
      const distance = path ? distanceFromPath(path) : null;

      return {
        id: index + 1,
        imported: true,
        location_name: mathMode(form.sightings.map((item) => item.place.name)),
        lat: form.lat,
        lon: form.lon,
        date,
        time: form.time_start,
        duration,
        distance,
        number_observer: null,
        full_form: form.full_form === "1",
        primary_purpose: true,
        checklist_comment: form.comment ? form.comment.replace(/\r\n/g, "<br>") : "",
        species_comment_template: buildSpeciesCommentTemplate(selectedWebsite),
        path,
      };
    });

    exportData.formsSightings = data.forms.map((form, index) => {
      return ornithoSightingsTransformation(form.sightings, index + 1, selectedWebsite);
    });
  } else if (selectedWebsite.system === "birdlasser") {
    const rows = Papa.parse(rawText, {
      skipEmptyLines: true,
      header: true,
    }).data;
    requireColumns(rows, [
      "Date",
      "Time",
      "Latitude",
      "Longitude",
      ["Species primary name", "Primary language"],
      "Count",
    ]);

    exportData.sightings = rows.map((sighting, index) => {
      return createSighting({
        id: `s${index}`,
        form_id: 0,
        website: selectedWebsite.name,
        source_website_name: selectedWebsite.name,
        system: selectedWebsite.system,
        date: sighting.Date.replaceAll("/", "-"),
        time: sighting.Time,
        lat: Number.parseFloat(sighting.Latitude),
        lon: Number.parseFloat(sighting.Longitude),
        location_name:
          sighting.Pentad ||
          sighting.Fieldsheet ||
          `New location ${sighting.Latitude}-${sighting.Longitude}`,
        common_name: sighting["Species primary name"] || sighting["Primary language"],
        scientific_name: "",
        count: sighting.Count,
        count_precision: sighting["Count Type"] === "Not specified" ? "" : sighting["Count Type"],
        comment: sighting.Notes,
      });
    });
  } else if (selectedWebsite.system === "observation") {
    const rows = Papa.parse(rawText, {
      skipEmptyLines: true,
      header: true,
    }).data;
    requireColumns(rows, ["id", "date", "time", "lat", "lng", "species name", "number"]);

    exportData.sightings = rows.map((sighting) => {
      return createSighting({
        id: sighting.id,
        form_id: 0,
        website: selectedWebsite.name,
        source_website_name: selectedWebsite.name,
        source_record_url: `${selectedWebsite.website}observation/${sighting.id}`,
        system: selectedWebsite.system,
        permalink: `${selectedWebsite.website}observation/${sighting.id}`,
        date: sighting.date,
        time: sighting.time,
        lat: Number.parseFloat(sighting.lat),
        lon: Number.parseFloat(sighting.lng),
        location_name: sighting.location,
        common_name: sighting["species name"],
        scientific_name: "",
        count: sighting["counting method"] === "seen not counted" ? "x" : sighting.number,
        count_precision: precisionMatchObservation[sighting["counting method"]],
        comment: sighting.notes,
      });
    });
  } else if (selectedWebsite.system === "ornitho.net") {
    const parsed = Papa.parse(rawText, {
      skipEmptyLines: true,
      header: true,
    }).data;

    if (!parsed[0]?.Timing) {
      throw new ImportError("importErrorTxtHeader");
    }

    exportData.sightings = parsed.map((sighting) => {
      const dateSplit = sighting.Date.split(".");
      return createSighting({
        id: sighting["Universal observation ID"],
        form_id: 0,
        website: selectedWebsite.name,
        source_website_name: selectedWebsite.name,
        system: selectedWebsite.system,
        date: `${dateSplit[2]}-${dateSplit[0]}-${dateSplit[1]}`,
        time: sighting.Timing,
        lat: Number.parseFloat(sighting["Latitude (N)"]),
        lon: Number.parseFloat(sighting["Longitude (E)"]),
        location_name: sighting.Site,
        common_name: sighting.Species,
        scientific_name: sighting["Latin name"],
        count: sighting.Estimation === "×" ? "x" : sighting.Number,
        count_precision: sighting.Estimation,
        comment: sighting.Comment,
      });
    });
  } else {
    throw new ImportError("importErrorUnsupported");
  }

  // Without coordinates a sighting cannot be mapped or assigned to a checklist location.
  const hasCoordinates = (sighting) =>
    Number.isFinite(sighting.lat) && Number.isFinite(sighting.lon);
  const sightingCount = exportData.sightings.length;
  exportData.sightings = exportData.sightings.filter(hasCoordinates);
  exportData.skipped.noCoordinates = sightingCount - exportData.sightings.length;

  const sortKey = (sighting) => `${sighting.date || ""} ${sighting.time || ""}`;
  exportData.sightings.sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
  return exportData;
}

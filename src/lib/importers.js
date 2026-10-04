import Papa from "papaparse";
import {
  buildSpeciesCommentTemplate,
  createSighting,
  uniqueDistanceFromPath,
  mathMode,
} from "./utils";
import { ebirdCodeForScientificName, getOrnithoEbirdSpeciesCode } from "./taxonomy";

// Match columns by name so reordered columns and extra fields do not change their meaning.
const biolovisionHeaders = {
  id: [
    "Universal observation ID",
    "ID universel observation",
    "ID Beobachtung universell",
    "ID osservazione universale",
    "SEARCH_EXPORT_TEXT_UNIVERSAL_ID_OBSERVATION",
    "Uniwersalne ID obserwacji",
    "ID Universal Observació",
  ],
  date: ["Date", "Datum", "Data", "Fecha"],
  day: ["Day", "Jour", "Tag", "Giorno", "día", "dia"],
  month: ["Month", "Mois", "Monat", "Mese", "Mes", "Miesiąc"],
  year: ["Year", "Annee", "Jahr", "Anno", "Año", "Rok", "Any"],
  time: ["Timing", "Horaire", "Zeitraum", "Orario", "Horario", "Okres czasu", "Horari"],
  lat: [
    "Latitude (N)",
    "Lat (WGS84)",
    "Geogr. Breite (N)",
    "Latitudine (N)",
    "Latitud (N)",
    "Szerokość geograficzna (N)",
  ],
  lon: [
    "Longitude (E)",
    "Lon (WGS84)",
    "Geogr. Länge (E)",
    "Longitudine (E)",
    "Longitud (E)",
    "Długość geograficzna (E)",
  ],
  location_name: ["Site", "Lieudit", "Ort", "Località", "Localidad", "Lokalizacja", "Localitat"],
  common_name: ["Species", "Nom espèce", "Vogelarten", "Specie", "Especie", "Gatunek", "Espècie"],
  scientific_name: [
    "Latin name",
    "Nom latin",
    "Latin",
    "Nombre científico",
    "Nazwa łacińska",
    "Nom científic",
  ],
  count: ["Number", "Nombre", "Anzahl", "Numero", "Número", "Liczebność"],
  count_precision: ["Estimation", "Schätzung", "Stima", "Estimación", "Szacunek", "Estimació"],
  comment: ["Comment", "Observation", "Bemerkung", "Nota", "Comentario", "Komentarz", "Comentari"],
};

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

// Import failure with a user-facing reason: `key` is an i18n message key, `params` its values.
export class ImportError extends Error {
  constructor(key, params = {}) {
    super(key);
    this.name = "ImportError";
    this.key = key;
    this.params = params;
  }
}

// BirdLasser exports the species name in up to three user-chosen languages, one of which may be
// the scientific name: take the first value that looks like one.
const SCIENTIFIC_NAME_PATTERN = /^[A-Z][a-z]+ [a-z]+(?: [a-z]+)*$/;
function birdlasserScientificName(sighting) {
  const candidates = [
    "Species secondary name",
    "Species tertiary name",
    "Secondary language",
    "Tertiary language",
    "Species primary name",
    "Primary language",
  ].map((column) => String(sighting[column] || "").trim());
  return candidates.find((name) => SCIENTIFIC_NAME_PATTERN.test(name)) || "";
}

// Sightings without an eBird code that have a scientific name to look up.
export function needsScientificNameLookup(exportData) {
  return [exportData.sightings, ...exportData.formsSightings]
    .flat()
    .some((sighting) => !sighting.ebird_species_code && sighting.scientific_name);
}

// Fills in the eBird code from the scientific name where the source has none (Observation.org,
// BirdLasser, ornitho.net, and ornitho taxa missing from the species list).
// Call loadScientificNameIndex() first.
export function assignEbirdCodesFromScientificNames(exportData) {
  [exportData.sightings, ...exportData.formsSightings].flat().forEach((sighting) => {
    if (!sighting.ebird_species_code && sighting.scientific_name) {
      sighting.ebird_species_code = ebirdCodeForScientificName(sighting.scientific_name);
    }
  });
  return exportData;
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
      has_death: observer.has_death || "",
      extended_info: observer.extended_info || {},
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
      let duration = (new Date(`${timeStop}Z`) - new Date(`${timeStart}Z`)) / 1000 / 60;
      const crossesMidnight = duration < 0;
      if (duration < 0) {
        // The checklist ended after midnight.
        duration += 24 * 60;
      }

      const path = parseWktLineString(form.protocol?.wkt || form.trace);
      const distance = path ? uniqueDistanceFromPath(path) : null;

      return {
        id: index + 1,
        imported: true,
        location_name: mathMode(form.sightings.map((item) => item.place.name)),
        lat: form.lat,
        lon: form.lon,
        date,
        time: form.time_start,
        duration,
        crosses_midnight: crossesMidnight,
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
        scientific_name: birdlasserScientificName(sighting),
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
        scientific_name: sighting["scientific name"] || "",
        count: sighting["counting method"] === "seen not counted" ? "x" : sighting.number,
        count_precision: precisionMatchObservation[sighting["counting method"]],
        comment: sighting.notes,
      });
    });
  } else if (selectedWebsite.system === "ornitho.net") {
    const [headers, ...rows] = Papa.parse(rawText, { skipEmptyLines: true }).data;
    const columns = Object.fromEntries(
      Object.entries(biolovisionHeaders).map(([key, aliases]) => [
        key,
        headers.findIndex((header) => aliases.includes(header.trim())),
      ]),
    );
    if (
      ["id", "date", "time", "lat", "lon", "common_name", "scientific_name", "count"].some(
        (key) => columns[key] < 0,
      )
    ) {
      throw new ImportError("importErrorTxtHeader");
    }

    exportData.sightings = rows.map((row) => {
      const sighting = Object.fromEntries(
        Object.entries(columns).map(([key, index]) => [key, row[index] || ""]),
      );
      const [day, month, year] = sighting.date.split(".");
      return createSighting({
        ...sighting,
        form_id: 0,
        website: selectedWebsite.name,
        source_website_name: selectedWebsite.name,
        system: selectedWebsite.system,
        // Polish repeats “Dzień” for day and day-of-year; use the unambiguous date instead.
        date: `${sighting.year || year}-${String(sighting.month || month).padStart(2, "0")}-${String(sighting.day || day).padStart(2, "0")}`,
        lat: Number.parseFloat(sighting.lat),
        lon: Number.parseFloat(sighting.lon),
        count: sighting.count_precision === "×" ? "x" : sighting.count,
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

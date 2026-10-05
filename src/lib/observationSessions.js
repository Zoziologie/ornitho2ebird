import Papa from "papaparse";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import { ImportError, parseImportFile } from "./importers";
import { buildSpeciesCommentTemplate, mathMode, uniqueDistanceFromPath } from "./utils";

// Session KML supplies effort and membership; CSV remains the source of counts and species.
export function parseObservationSessionKml(text, name) {
  if (XMLValidator.validate(text) !== true) {
    throw new ImportError("importErrorSessionKml", { name });
  }
  const data = new XMLParser({
    removeNSPrefix: true,
    parseTagValue: false,
    isArray: (tag) => tag === "Placemark",
  }).parse(text);
  const placemarks = data.kml?.Document?.Placemark || [];
  const sessions = placemarks.filter((item) => /\/sessions\/\d+\//.test(item.description || ""));
  if (sessions.length !== 1) {
    throw new ImportError("importErrorSessionKml", { name });
  }
  const session = sessions[0];
  const url = session.description.match(
    /https?:\/\/(?:observation\.org|waarneming\.nl|waarnemingen\.be)\/sessions\/\d+\//,
  )?.[0];
  const times = session.description
    .replace(/<[^>]*>/g, "")
    .match(
      /(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})\s+(?:until|jusque)\s+(?:(\d{4}-\d{2}-\d{2})\s+)?(\d{2}:\d{2})/,
    );
  const coordinates = session.LineString?.coordinates || session.Point?.coordinates;
  if (!url || !times || !coordinates) {
    throw new ImportError("importErrorSessionKml", { name });
  }
  const [, date, time, endDate, endTime] = times;
  let duration =
    (new Date(`${endDate || date}T${endTime}:00Z`) - new Date(`${date}T${time}:00Z`)) / 60000;
  const crossesMidnight = duration < 0 || Boolean(endDate && endDate !== date);
  if (duration < 0) duration += 1440;
  const points = coordinates
    .trim()
    .split(/\s+/)
    .map((point) => {
      const [lon, lat] = point.split(",").map(Number);
      return [lat, lon];
    });
  const ids = new Set(
    placemarks.flatMap((item) =>
      [...(item.description || "").matchAll(/\/observation\/(\d+)\//g)].map((match) => match[1]),
    ),
  );
  if (!ids.size) throw new ImportError("importErrorSessionKml", { name });
  return {
    name,
    url,
    ids,
    date,
    time,
    duration,
    crosses_midnight: crossesMidnight,
    lat: points[0][0],
    lon: points[0][1],
    path: session.LineString ? points : null,
    distance: session.LineString ? uniqueDistanceFromPath(points) : 0,
  };
}

// Read the whole selection before replacing the current import. Pair by IDs, never filenames.
export async function parseImportFiles(files, website) {
  if (files.length === 1 && !/\.kml$/i.test(files[0].name)) {
    return parseImportFile(await files[0].text(), website);
  }
  if (website.system !== "observation" || files.some((file) => !/\.(csv|kml)$/i.test(file.name))) {
    throw new ImportError("importErrorSessionPairs");
  }
  const texts = await Promise.all(
    files.map(async (file) => ({ name: file.name, text: await file.text() })),
  );
  const csvs = texts
    .filter((file) => /\.csv$/i.test(file.name))
    .map((file) => ({
      ...file,
      ids: new Set(
        Papa.parse(file.text, { header: true, skipEmptyLines: true }).data.map((row) => row.id),
      ),
    }));
  const sessions = texts
    .filter((file) => /\.kml$/i.test(file.name))
    .map((file) => parseObservationSessionKml(file.text, file.name))
    .sort((a, b) => `${a.date} ${a.time} ${a.url}`.localeCompare(`${b.date} ${b.time} ${b.url}`));
  if (!sessions.length || csvs.length !== sessions.length) {
    throw new ImportError("importErrorSessionPairs");
  }
  const parsed = {
    forms: [],
    sightings: [],
    formsSightings: [],
    skipped: { emptyForms: 0, noCoordinates: 0, nonBirds: 0 },
  };
  const usedCsvs = new Set();
  const usedIds = new Set();
  for (const session of sessions) {
    const matches = csvs.filter(
      (file) =>
        file.ids.size === session.ids.size && [...session.ids].every((id) => file.ids.has(id)),
    );
    if (matches.length !== 1 || usedCsvs.has(matches[0])) {
      throw new ImportError("importErrorSessionMatch", { name: session.name });
    }
    if ([...session.ids].some((id) => usedIds.has(id))) {
      throw new ImportError("importErrorSessionOverlap");
    }
    usedCsvs.add(matches[0]);
    session.ids.forEach((id) => usedIds.add(id));
    const csv = parseImportFile(matches[0].text, website);
    parsed.skipped.noCoordinates += csv.skipped.noCoordinates;
    parsed.skipped.nonBirds += csv.skipped.nonBirds;
    if (!csv.sightings.length) {
      parsed.skipped.emptyForms += 1;
      continue;
    }
    const id = parsed.forms.length + 1;
    parsed.forms.push({
      id,
      imported: true,
      date: session.date,
      time: session.time,
      duration: session.duration,
      crosses_midnight: session.crosses_midnight,
      lat: session.lat,
      lon: session.lon,
      path: session.path,
      distance: session.distance,
      location_name: mathMode(csv.sightings.map((sighting) => sighting.location_name)),
      number_observer: null,
      primary_purpose: true,
      full_form: false,
      checklist_comment: session.url,
      species_comment_template: buildSpeciesCommentTemplate(website),
    });
    parsed.formsSightings.push(csv.sightings.map((sighting) => ({ ...sighting, form_id: id })));
  }
  return parsed;
}

import { readFileSync } from "node:fs";
import Papa from "papaparse";

export const SPECIES_LIST_CSV = new URL("../data/ornitho_species_list_full.csv", import.meta.url);
export const SPECIES_LIST_JSON = new URL(
  "../data/ornitho_species_list_short.json",
  import.meta.url,
);

const COLUMNS = ["id", "ornitho_english", "ornitho_latin", "ebird_species_code"];

// Reads the ornitho → eBird mapping and returns its rows plus a list of problems
// (wrong header, bad or duplicate ids, malformed eBird codes).
export function readSpeciesList(file = SPECIES_LIST_CSV) {
  const { data, meta } = Papa.parse(readFileSync(file, "utf8").replace(/^\uFEFF/, ""), {
    header: true,
    skipEmptyLines: true,
  });
  const errors = [];
  if (meta.fields.join() !== COLUMNS.join()) {
    errors.push(`Expected the columns ${COLUMNS.join(",")}, found ${meta.fields.join(",")}`);
  }

  const seenIds = new Set();
  data.forEach((row, index) => {
    const line = index + 2;
    if (!/^\d+$/.test(row.id)) {
      errors.push(`Line ${line}: invalid id "${row.id}"`);
    } else if (seenIds.has(row.id)) {
      errors.push(`Line ${line}: duplicate id ${row.id}`);
    }
    seenIds.add(row.id);
    if (row.ebird_species_code && !/^[a-z0-9]+$/.test(row.ebird_species_code)) {
      errors.push(`Line ${line}: invalid eBird code "${row.ebird_species_code}"`);
    }
  });
  return { rows: data, errors };
}

// The file the app loads: ornitho id → eBird species code, for mapped ids only.
export function toShortList(rows) {
  return Object.fromEntries(
    rows.filter((row) => row.ebird_species_code).map((row) => [row.id, row.ebird_species_code]),
  );
}

export function formatShortList(shortList) {
  return `${JSON.stringify(shortList, null, 2)}\n`;
}

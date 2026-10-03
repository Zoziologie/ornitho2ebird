// Brings the app's taxonomy data up to date with the current eBird taxonomy, in one step:
//  1. ornitho list (data/ornitho_species_list_full.csv): eBird codes that no longer exist are
//     replaced when the taxon kept its scientific name under a new code (e.g. strher → strher2),
//     or when the ornitho scientific name is now an eBird name. Other stale codes are reported.
//  2. data/ebird_scientific_names.json: eBird scientific name → code, plus older names from the
//     ornitho list, for sightings that come without a code.
//  3. data/ornitho_species_list_short.json, the list the app loads.
// Run with `npm run taxonomy:update` after each yearly eBird taxonomy update (or let the
// "Taxonomy update" workflow do it). `--report <file>` also writes a Markdown summary.
import { readFileSync, writeFileSync } from "node:fs";
import { EBIRD_API_KEY } from "../src/lib/constants.js";
import {
  SPECIES_LIST_CSV,
  SPECIES_LIST_JSON,
  formatShortList,
  readSpeciesList,
  toShortList,
} from "./speciesList.js";

const NAMES_FILE = new URL("../data/ebird_scientific_names.json", import.meta.url);

const normalize = (name) =>
  String(name || "")
    .trim()
    .replace(/\s+/g, " ");

const response = await fetch(
  `https://api.ebird.org/v2/ref/taxonomy/ebird?key=${EBIRD_API_KEY}&fmt=json&locale=en`,
  { signal: AbortSignal.timeout(120000) },
);
if (!response.ok) {
  console.error(`The eBird taxonomy request failed: HTTP ${response.status}`);
  process.exit(1);
}
const taxonomy = await response.json();
if (!Array.isArray(taxonomy) || taxonomy.length === 0) {
  console.error("The eBird taxonomy response is empty.");
  process.exit(1);
}

const taxonByCode = new Map(taxonomy.map((taxon) => [taxon.speciesCode, taxon]));
const codeByName = new Map(taxonomy.map((taxon) => [normalize(taxon.sciName), taxon.speciesCode]));
const previousNameByCode = new Map(
  Object.entries(JSON.parse(readFileSync(NAMES_FILE, "utf8")).names).map(([name, code]) => [
    code,
    name,
  ]),
);

// 1. Stale codes in the ornitho list.
const { rows, errors } = readSpeciesList();
if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exit(1);
}
const fixed = [];
const unresolved = [];
rows.forEach((row) => {
  const code = row.ebird_species_code;
  if (!code || taxonByCode.has(code)) {
    return;
  }
  const newCode =
    codeByName.get(previousNameByCode.get(code)) || codeByName.get(normalize(row.ornitho_latin));
  if (newCode) {
    fixed.push({ ...row, newCode });
    row.ebird_species_code = newCode;
  } else {
    unresolved.push(row);
  }
});
if (fixed.length > 0) {
  // Edit the CSV line by line so its encoding, BOM and line endings stay as they are.
  const newCodeById = new Map(fixed.map((row) => [row.id, row.newCode]));
  const raw = readFileSync(SPECIES_LIST_CSV, "utf8");
  const newline = raw.includes("\r\n") ? "\r\n" : "\n";
  const lines = raw.split(newline).map((line, index) => {
    const id = line.replace(/^\uFEFF/, "").split(",", 1)[0];
    if (index === 0 || !newCodeById.has(id)) {
      return line;
    }
    return `${line.slice(0, line.lastIndexOf(","))},${newCodeById.get(id)}`;
  });
  writeFileSync(SPECIES_LIST_CSV, lines.join(newline));
}

// 2. Scientific names.
const names = Object.fromEntries([...codeByName].sort(([a], [b]) => (a < b ? -1 : 1)));
const synonyms = {};
rows.forEach((row) => {
  const name = normalize(row.ornitho_latin);
  if (name && !(name in names) && taxonByCode.has(row.ebird_species_code)) {
    synonyms[name] = row.ebird_species_code;
  }
});
const sortedSynonyms = Object.fromEntries(Object.entries(synonyms).sort());
writeFileSync(NAMES_FILE, `${JSON.stringify({ names, synonyms: sortedSynonyms }, null, 1)}\n`);

// 3. The short list.
writeFileSync(SPECIES_LIST_JSON, formatShortList(toShortList(rows)));

const report = [
  `eBird taxonomy: ${taxonomy.length} taxa; ${Object.keys(synonyms).length} older ornitho names.`,
  "",
  fixed.length > 0
    ? `Replaced ${fixed.length} ornitho codes that no longer exist in eBird:`
    : "All ornitho codes still exist in eBird.",
  // `fixed` holds copies made before the code was replaced: ebird_species_code is the old one.
  ...fixed.map(
    (row) =>
      `- ${row.id} ${row.ornitho_latin}: \`${row.ebird_species_code}\` → \`${row.newCode}\` (${taxonByCode.get(row.newCode).comName})`,
  ),
];
if (unresolved.length > 0) {
  report.push(
    "",
    `**${unresolved.length} ornitho codes need a manual decision** (split or lump: set the right code in \`data/ornitho_species_list_full.csv\`, then run \`npm run splist\`). Until then these species reach eBird under their ornitho name:`,
    ...unresolved.map(
      (row) =>
        `- ${row.id} ${row.ornitho_english} (${row.ornitho_latin}): \`${row.ebird_species_code}\``,
    ),
  );
}
console.log(report.join("\n"));
const reportIndex = process.argv.indexOf("--report");
if (reportIndex > 0) {
  writeFileSync(process.argv[reportIndex + 1], `${report.join("\n")}\n`);
}

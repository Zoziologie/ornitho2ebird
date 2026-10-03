// Writes data/ebird_scientific_names.json: eBird scientific name → species code for every eBird
// taxon, plus older or alternative scientific names taken from the ornitho species list (e.g.
// "Anas querquedula" for eBird's "Spatula querquedula"). The app uses it to find the eBird
// taxon of sightings that only come with a name (Observation.org, BirdLasser, ornitho.net).
// Run with `npm run taxonomy:update` after each yearly eBird taxonomy update.
import { writeFileSync } from "node:fs";
import { EBIRD_API_KEY } from "../src/lib/constants.js";
import { readSpeciesList } from "./speciesList.js";

const OUTPUT = new URL("../data/ebird_scientific_names.json", import.meta.url);

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

const names = {};
taxonomy.forEach((taxon) => {
  names[normalize(taxon.sciName)] = taxon.speciesCode;
});
const codes = new Set(Object.values(names));

const { rows, errors } = readSpeciesList();
if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exit(1);
}
const synonyms = {};
rows.forEach((row) => {
  const name = normalize(row.ornitho_latin);
  if (name && !(name in names) && codes.has(row.ebird_species_code)) {
    synonyms[name] = row.ebird_species_code;
  }
});

const sorted = (object) => Object.fromEntries(Object.entries(object).sort());
writeFileSync(
  OUTPUT,
  `${JSON.stringify({ names: sorted(names), synonyms: sorted(synonyms) }, null, 1)}\n`,
);
console.log(
  `Wrote ${Object.keys(names).length} eBird names and ${Object.keys(synonyms).length} synonyms.`,
);

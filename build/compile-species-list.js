// Validates data/ornitho_species_list_full.csv and writes the short list the app loads.
// Run with `npm run splist` after editing the CSV.
import { writeFileSync } from "node:fs";
import { SPECIES_LIST_JSON, formatShortList, readSpeciesList, toShortList } from "./speciesList.js";

const { rows, errors } = readSpeciesList();
if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exit(1);
}

const shortList = toShortList(rows);
writeFileSync(SPECIES_LIST_JSON, formatShortList(shortList));
console.log(`Wrote ${Object.keys(shortList).length} mapped ids (of ${rows.length} rows).`);

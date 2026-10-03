// Checks every eBird code in data/ornitho_species_list_full.csv against the current eBird
// taxonomy. Codes change when eBird splits, lumps or renames taxa (once a year), and a stale
// code makes the export fall back to the ornitho name. Run with `npm run splist:check`
// (add `-- --verbose` to list genus changes as well).
import { EBIRD_API_KEY } from "../src/lib/constants.js";
import { readSpeciesList } from "./speciesList.js";

const { rows, errors } = readSpeciesList();
if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exit(1);
}

const response = await fetch(
  `https://api.ebird.org/v2/ref/taxonomy/ebird?key=${EBIRD_API_KEY}&fmt=json&locale=en`,
  { signal: AbortSignal.timeout(120000) },
);
if (!response.ok) {
  console.error(`The eBird taxonomy request failed: HTTP ${response.status}`);
  process.exit(1);
}
const taxonomy = new Map((await response.json()).map((taxon) => [taxon.speciesCode, taxon]));
if (taxonomy.size === 0) {
  console.error("The eBird taxonomy response is empty.");
  process.exit(1);
}

const mapped = rows.filter((row) => row.ebird_species_code);
const stale = mapped.filter((row) => !taxonomy.has(row.ebird_species_code));
// Same code, different scientific name: usually a genus change, sometimes a wrong mapping.
const renamed = mapped.filter((row) => {
  const taxon = taxonomy.get(row.ebird_species_code);
  return taxon?.category === "species" && taxon.sciName !== row.ornitho_latin;
});

console.log(`${mapped.length} mapped ids, ${taxonomy.size} eBird taxa.`);
if (renamed.length > 0) {
  console.log(
    `${renamed.length} species have a different scientific name in ornitho and eBird` +
      (process.argv.includes("--verbose") ? ":" : " (list them with --verbose)."),
  );
}
if (process.argv.includes("--verbose")) {
  renamed.forEach((row) => {
    const taxon = taxonomy.get(row.ebird_species_code);
    console.log(`  ${row.id}\t${row.ornitho_latin} → ${taxon.sciName} (${taxon.speciesCode})`);
  });
}
if (stale.length > 0) {
  console.error(`\n${stale.length} codes are not in the current eBird taxonomy:`);
  stale.forEach((row) => {
    console.error(`  ${row.id}\t${row.ebird_species_code}\t${row.ornitho_latin}`);
  });
  process.exit(1);
}
console.log("\nAll codes exist in the current eBird taxonomy.");

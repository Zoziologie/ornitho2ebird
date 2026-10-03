// Writes ebird_matching_test.csv: one row for every eBird taxon the ornitho list maps to, written
// as the app writes it (empty common name, eBird scientific name in Genus + Species), in
// checklists of 200 at Sempach in September of last year. Upload it to eBird (preferably a test
// account: matched checklists get submitted) and every species listed on the "Fix species" page
// is one eBird's importer does not match by scientific name. See issue #38.
// Run with `npm run taxonomy:test-file` after `npm run taxonomy:update`.
import { readFileSync, writeFileSync } from "node:fs";
import { SPECIES_LIST_JSON } from "./speciesList.js";

const PER_CHECKLIST = 200;
const OUTPUT = "ebird_matching_test.csv";

const { names } = JSON.parse(
  readFileSync(new URL("../data/ebird_scientific_names.json", import.meta.url), "utf8"),
);
const nameByCode = new Map(Object.entries(names).map(([name, code]) => [code, name]));
const codes = [...new Set(Object.values(JSON.parse(readFileSync(SPECIES_LIST_JSON, "utf8"))))]
  .filter((code) => nameByCode.has(code))
  .sort();

const year = new Date().getFullYear() - 1;
const csvValue = (value) => (/[",]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value);
const lines = codes.map((code, index) => {
  const [genus, ...species] = nameByCode.get(code).split(" ");
  const day = String(1 + Math.floor(index / PER_CHECKLIST)).padStart(2, "0");
  return [
    "",
    genus,
    species.join(" "),
    "1",
    code,
    "ornitho2ebird matching test",
    "47.1290",
    "8.1916",
    `09/${day}/${year}`,
    "08:00",
    "",
    "CH",
    "casual",
    "1",
    "",
    "N",
    "",
    "",
    "ornitho2ebird species-matching test - delete after checking",
  ]
    .map(csvValue)
    .join(",");
});
writeFileSync(OUTPUT, `${lines.join("\n")}\n`);
console.log(
  `Wrote ${OUTPUT}: ${codes.length} taxa in ${Math.ceil(codes.length / PER_CHECKLIST)} checklists.`,
);

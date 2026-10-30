// Report differences for manual review; a country list is not a complete global taxonomy.
import { readFileSync, writeFileSync } from "node:fs";
import Papa from "papaparse";
import { readSpeciesList } from "./speciesList.js";

const [input, output = "ornitho-species-review.csv"] = process.argv.slice(2);
if (!input) throw new Error("Usage: npm run splist:compare -- <download.csv> [review.csv]");

const {
  data: species,
  meta,
  errors: parseErrors,
} = Papa.parse(readFileSync(input, "utf8"), {
  header: true,
  skipEmptyLines: true,
});
if (
  parseErrors.length ||
  ["id", "common_name", "scientific_name"].some((key) => !meta.fields.includes(key))
) {
  throw new Error("Expected a species download with id, common_name and scientific_name columns.");
}
const ids = new Set();
for (const row of species) {
  if (!/^\d+$/.test(row.id) || ids.has(row.id))
    throw new Error(`Invalid or duplicate ID: ${row.id}`);
  ids.add(row.id);
}

const { rows, errors } = readSpeciesList();
if (errors.length) throw new Error(errors.join("\n"));
const current = new Map(rows.map((row) => [row.id, row]));
const { names } = JSON.parse(
  readFileSync(new URL("../data/ebird_scientific_names.json", import.meta.url)),
);
const normalize = (name) => name.trim().replace(/\s+/g, " ");
const report = [];
for (const row of species) {
  const old = current.get(row.id);
  const changes = [];
  if (!old) changes.push("new ID");
  if (old && !old.ebird_species_code) changes.push("unmapped");
  if (old && row.common_name && normalize(row.common_name) !== normalize(old.ornitho_english))
    changes.push("common name changed");
  if (old && row.scientific_name && normalize(row.scientific_name) !== normalize(old.ornitho_latin))
    changes.push("scientific name changed");
  if (!changes.length) continue;
  report.push({
    changes: changes.join("; "),
    id: row.id,
    old_common_name: old?.ornitho_english || "",
    new_common_name: row.common_name,
    old_scientific_name: old?.ornitho_latin || "",
    new_scientific_name: row.scientific_name,
    current_ebird_code: old?.ebird_species_code || "",
    exact_name_ebird_code: names[normalize(row.scientific_name)] || "",
  });
}
writeFileSync(
  output,
  `${Papa.unparse({ fields: ["changes", "id", "old_common_name", "new_common_name", "old_scientific_name", "new_scientific_name", "current_ebird_code", "exact_name_ebird_code"], data: report }, { newline: "\n" })}\n`,
);
console.log(`Compared ${species.length} taxa; ${report.length} rows need review in ${output}.`);
console.log(
  "IDs missing from this country list are not treated as removed. Exact name matches are suggestions, not proof of taxonomic equivalence.",
);

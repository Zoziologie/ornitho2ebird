// Prepare variants of one real checklist to compare eBird's location matching (issue #52).
// Run: node build/make-hotspot-test.js exported.csv L123456 output-directory
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import Papa from "papaparse";
import { EBIRD_API_KEY } from "../src/lib/constants.js";

const [input, hotspotId, output] = process.argv.slice(2);
const response = await fetch(
  `https://api.ebird.org/v2/ref/hotspot/info/${encodeURIComponent(hotspotId)}?key=${EBIRD_API_KEY}`,
);
if (!response.ok) throw new Error(`Hotspot lookup failed: HTTP ${response.status}`);
const hotspot = await response.json();
const rows = Papa.parse(readFileSync(input, "utf8"), { skipEmptyLines: true }).data;
// eBird groups records using location, date, time and effort. Keep only the first checklist.
const checklist = rows.filter(
  (row) => row.slice(5, 18).join("\t") === rows[0].slice(5, 18).join("\t"),
);
const variants = [
  { id: "01-exact", name: hotspot.locName, lat: hotspot.lat, lon: hotspot.lng },
  {
    id: "02-rounded",
    name: hotspot.locName,
    lat: Number(hotspot.lat.toFixed(6)),
    lon: Number(hotspot.lng.toFixed(6)),
  },
  { id: "03-no-coordinates", name: hotspot.locName, lat: "", lon: "" },
  { id: "04-location-id", name: hotspot.locId, lat: hotspot.lat, lon: hotspot.lng },
  {
    id: "05-region-codes",
    name: hotspot.locName,
    lat: hotspot.lat,
    lon: hotspot.lng,
    state: hotspot.subnational1Code.split("-").slice(1).join("-"),
    country: hotspot.countryCode,
  },
];

mkdirSync(output, { recursive: true });
writeFileSync(join(output, "hotspot.json"), `${JSON.stringify(hotspot, null, 2)}\n`);
for (const variant of variants) {
  const data = checklist.map((row) =>
    row
      .with(5, variant.name)
      .with(6, variant.lat)
      .with(7, variant.lon)
      .with(10, variant.state ?? row[10])
      .with(11, variant.country ?? row[11]),
  );
  writeFileSync(join(output, `${variant.id}.csv`), Papa.unparse(data, { newline: "\n" }));
}
console.log(`Prepared ${variants.length} files for ${hotspot.locName} (${hotspot.locId}).`);
console.log(
  "Each file contains the same first checklist. See docs/hotspot-matching.md before importing.",
);

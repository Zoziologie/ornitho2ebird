import { EBIRD_API_KEY } from "./constants";
import { fetchJson } from "./http";

// ~40 KB, so it is fetched only when an ornitho file is imported.
let ornithoSpeciesList = null;
let ornithoSpeciesListPromise = null;

export function loadOrnithoSpeciesList() {
  ornithoSpeciesListPromise ??= import("/data/ornitho_species_list_short.json")
    .then((module) => {
      ornithoSpeciesList = module.default;
    })
    .catch((error) => {
      ornithoSpeciesListPromise = null;
      throw error;
    });
  return ornithoSpeciesListPromise;
}

// eBird scientific name → species code (~700 KB, ~180 KB compressed), for sightings that come
// without a code. Regenerate with `npm run taxonomy:update`.
let scientificNameIndex = null;
// The reverse, eBird names only: species code → scientific name.
let bundledScientificNameByCode = null;
let scientificNameIndexPromise = null;

export function loadScientificNameIndex() {
  scientificNameIndexPromise ??= import("/data/ebird_scientific_names.json")
    .then((module) => {
      const { names, synonyms } = module.default;
      scientificNameIndex = new Map([...Object.entries(synonyms), ...Object.entries(names)]);
      bundledScientificNameByCode = new Map(
        Object.entries(names).map(([name, code]) => [code, name]),
      );
    })
    .catch((error) => {
      scientificNameIndexPromise = null;
      throw error;
    });
  return scientificNameIndexPromise;
}

// Taxa for these codes from the bundled file, for when the eBird API cannot be reached. The
// names date from the last `npm run taxonomy:update`. Call loadScientificNameIndex() first.
export function bundledEbirdTaxa(speciesCodes) {
  if (!bundledScientificNameByCode) {
    throw new Error("The eBird scientific name index is not loaded yet.");
  }
  return new Map(
    speciesCodes
      .filter((code) => bundledScientificNameByCode.has(code))
      .map((code) => [code, { sciName: bundledScientificNameByCode.get(code) }]),
  );
}

// The eBird species code for a scientific name, or "". Besides eBird's own names it accepts the
// older names used by ornitho, "spec." for "sp.", "forma domestica", and a subspecies (or a list
// of subspecies) of a species eBird knows, which falls back to the species.
// Call loadScientificNameIndex() first.
export function ebirdCodeForScientificName(scientificName) {
  if (!scientificNameIndex) {
    throw new Error("The eBird scientific name index is not loaded yet.");
  }
  const name = String(scientificName || "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/ spec\.?$/, " sp.");
  if (!name) {
    return "";
  }
  if (scientificNameIndex.has(name)) {
    return scientificNameIndex.get(name);
  }

  const match = /^([A-Z][a-z]+ [a-z]+) (.+)$/.exec(name);
  if (!match) {
    return "";
  }
  const [, species, rest] = match;
  if (rest === "forma domestica") {
    return (
      scientificNameIndex.get(`${species} (Domestic type)`) ||
      scientificNameIndex.get(`${species} (Feral Pigeon)`) ||
      ""
    );
  }
  // Subspecies only: no hybrid ("x") and no second genus ("Pernis apivorus / Buteo buteo").
  if (/^[a-z][a-z /-]*$/.test(rest) && !/(^| )x( |$)/.test(rest)) {
    return scientificNameIndex.get(species) || "";
  }
  return "";
}

// eBird's importer matches every scientific name the export writes, except these two, which it
// does not recognise in any form (scientific name, English or local name, or both; tested
// Oct 2026). Probably old names that still point to several taxa in its synonym table. The user
// matches them once on eBird's "Fix species" page and eBird remembers it for later imports.
export const MANUAL_MATCH_TAXA = {
  rocpig: { sciName: "Columba livia", comName: "Rock Pigeon" },
  comsni: { sciName: "Gallinago gallinago", comName: "Common Snipe" },
};

// eBird taxa already fetched, per locale: species code → { comName, sciName, category }, or
// null for a code eBird does not know (stale after a taxonomy update).
const taxaByLocale = new Map();
// Codes per request: keeps the URL well under common length limits.
const TAXONOMY_CHUNK_SIZE = 150;

function taxaCacheFor(locale) {
  if (!taxaByLocale.has(locale)) {
    taxaByLocale.set(locale, new Map());
  }
  return taxaByLocale.get(locale);
}

function pickTaxa(cache, codes) {
  return new Map(codes.filter((code) => cache.get(code)).map((code) => [code, cache.get(code)]));
}

async function fetchTaxa(locale, codes, cache) {
  const json = await fetchJson(
    `https://api.ebird.org/v2/ref/taxonomy/ebird?key=${EBIRD_API_KEY}&fmt=json&locale=${encodeURIComponent(locale)}&species=${codes.map(encodeURIComponent).join(",")}`,
  );
  if (!Array.isArray(json)) {
    throw new Error("Unexpected eBird taxonomy response.");
  }
  // Only cache once the whole chunk succeeded, so a failed request is retried next time.
  const found = new Map(json.map((taxon) => [taxon.speciesCode, taxon]));
  codes.forEach((code) => {
    const taxon = found.get(code);
    cache.set(
      code,
      taxon ? { comName: taxon.comName, sciName: taxon.sciName, category: taxon.category } : null,
    );
  });
}

// The eBird taxa for these species codes, already cached: a Map of the known codes, or null
// when some code still has to be fetched.
export function cachedEbirdTaxa(localeCode, speciesCodes) {
  const cache = taxaCacheFor(localeCode || "en");
  return speciesCodes.every((code) => cache.has(code)) ? pickTaxa(cache, speciesCodes) : null;
}

// Fetches only the requested codes (a few KB) instead of the full ~6 MB taxonomy. Codes eBird
// does not know are left out of the returned Map.
export async function getEbirdTaxa(localeCode, speciesCodes) {
  const locale = localeCode || "en";
  const cache = taxaCacheFor(locale);
  const codes = [...new Set(speciesCodes.filter(Boolean))];
  const missing = codes.filter((code) => !cache.has(code));
  const chunks = [];
  for (let index = 0; index < missing.length; index += TAXONOMY_CHUNK_SIZE) {
    chunks.push(missing.slice(index, index + TAXONOMY_CHUNK_SIZE));
  }
  await Promise.all(chunks.map((chunk) => fetchTaxa(locale, chunk, cache)));
  return pickTaxa(cache, codes);
}

// Call loadOrnithoSpeciesList() first.
export function getOrnithoEbirdSpeciesCode(ornithoSpeciesId) {
  if (!ornithoSpeciesList) {
    throw new Error("The ornitho species list is not loaded yet.");
  }
  return ornithoSpeciesList[ornithoSpeciesId] || "";
}

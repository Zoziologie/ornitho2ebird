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

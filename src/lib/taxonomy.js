import { EBIRD_API_KEY } from "./constants";
import { fetchJson } from "./http";

// ~116 KB, so it is fetched only when an ornitho file is imported.
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

const taxonomyByLocaleCache = new Map();

async function fetchCommonNameBySpeciesCode(localeCode) {
  // The full taxonomy is ~6 MB of JSON (~0.6 MB compressed): allow a slow connection.
  const json = await fetchJson(
    `https://api.ebird.org/v2/ref/taxonomy/ebird?key=${EBIRD_API_KEY}&fmt=json&locale=${encodeURIComponent(localeCode)}`,
    { timeoutMs: 60000 },
  );
  if (!Array.isArray(json) || json.length === 0) {
    throw new Error("The eBird taxonomy response is empty.");
  }
  return new Map(json.map((entry) => [entry.speciesCode, entry.comName]));
}

export function getCommonNameBySpeciesCode(localeCode) {
  const locale = localeCode || "en";
  if (!taxonomyByLocaleCache.has(locale)) {
    const request = fetchCommonNameBySpeciesCode(locale).catch((error) => {
      // Do not cache failures: the next call retries.
      taxonomyByLocaleCache.delete(locale);
      throw error;
    });
    taxonomyByLocaleCache.set(locale, request);
  }
  return taxonomyByLocaleCache.get(locale);
}

// Call loadOrnithoSpeciesList() first.
export function getOrnithoEbirdSpeciesCode(ornithoSpeciesId) {
  if (!ornithoSpeciesList) {
    throw new Error("The ornitho species list is not loaded yet.");
  }
  return ornithoSpeciesList[ornithoSpeciesId] || "";
}

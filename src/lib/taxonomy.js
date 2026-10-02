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

function fetchCommonNameBySpeciesCode(localeCode) {
  return fetch(
    `https://api.ebird.org/v2/ref/taxonomy/ebird?key=vcs68p4j67pt&fmt=json&locale=${localeCode}`,
  )
    .then((response) => response.json())
    .then((json) => {
      return new Map(
        (Array.isArray(json) ? json : []).map((entry) => [entry.speciesCode, entry.comName]),
      );
    });
}

export async function getCommonNameBySpeciesCode(localeCode) {
  const locale = localeCode || "en";
  if (!taxonomyByLocaleCache.has(locale)) {
    taxonomyByLocaleCache.set(locale, fetchCommonNameBySpeciesCode(locale));
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

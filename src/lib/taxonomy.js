import ornithoSpeciesList from "/data/ornitho_species_list_short.json";

const taxonomyByLocaleCache = new Map();

function fetchCommonNameBySpeciesCode(localeCode) {
  return fetch(`https://api.ebird.org/v2/ref/taxonomy/ebird?key=vcs68p4j67pt&fmt=json&locale=${localeCode}`)
    .then((response) => response.json())
    .then((json) => {
      return new Map((Array.isArray(json) ? json : []).map((entry) => [entry.speciesCode, entry.comName]));
    });
}

export async function getCommonNameBySpeciesCode(localeCode) {
  const locale = localeCode || "en";
  if (!taxonomyByLocaleCache.has(locale)) {
    taxonomyByLocaleCache.set(locale, fetchCommonNameBySpeciesCode(locale));
  }
  return taxonomyByLocaleCache.get(locale);
}

export function getOrnithoEbirdSpeciesCode(ornithoSpeciesId) {
  return ornithoSpeciesList[ornithoSpeciesId] || "";
}

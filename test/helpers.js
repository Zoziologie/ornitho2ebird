import { readFileSync } from "node:fs";
import ebirdScientificNames from "../data/ebird_scientific_names.json";
import { fileURLToPath } from "node:url";
import websitesList from "../data/websites_list.json";
import en from "../src/locales/en.json";
import {
  DEFAULT_SETTINGS,
  DEFAULT_SPECIES_COMMENT_LONG_TEMPLATE_OPTIONS,
  DEFAULT_SPECIES_COMMENT_TEMPLATE,
  DEFAULT_SPECIES_COMMENT_TEMPLATE_OPTIONS,
  buildSpeciesCommentTemplateFromOptions,
} from "../src/lib/constants";
import {
  buildExportRows,
  exportableFormsOf,
  groupSightingsByForm,
  rowsToCsv,
} from "../src/lib/exportCsv";
import {
  assignEbirdCodesFromScientificNames,
  needsScientificNameLookup,
  parseImportFile,
} from "../src/lib/importers";
import { loadOrnithoSpeciesList, loadScientificNameIndex } from "../src/lib/taxonomy";
import { assembleImport } from "../src/lib/utils";

export function readFixture(name) {
  return readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), "utf8");
}

export function website(name) {
  const entry = websitesList.find((item) => item.name === name);
  if (!entry) {
    throw new Error(`Unknown website ${name}`);
  }
  return entry;
}

// Same template the app uses with default (non-personalised) settings.
export const defaultSpeciesCommentTemplate = buildSpeciesCommentTemplateFromOptions(
  DEFAULT_SPECIES_COMMENT_TEMPLATE_OPTIONS,
  DEFAULT_SPECIES_COMMENT_TEMPLATE.limit,
  DEFAULT_SPECIES_COMMENT_LONG_TEMPLATE_OPTIONS,
);

// eBird species code → scientific name, from the bundled index: an offline stand-in for the
// eBird API the export queries. Synonyms are left out, they are not eBird names.
export const ebirdScientificNameByCode = new Map(
  Object.entries(ebirdScientificNames.names).map(([name, code]) => [code, name]),
);

// As ImportPanel.vue does it.
export async function parseFixture(fixture, websiteName) {
  await loadOrnithoSpeciesList();
  const parsed = parseImportFile(readFixture(fixture), website(websiteName));
  if (needsScientificNameLookup(parsed)) {
    await loadScientificNameIndex();
    assignEbirdCodesFromScientificNames(parsed);
  }
  return parsed;
}

// The whole import -> export pipeline with default settings, as App.vue and ExportPanel.vue run it.
// Species get the eBird scientific name from the bundled index instead of the eBird API.
export async function exportFixture(fixture, websiteName) {
  const parsed = await parseFixture(fixture, websiteName);
  const { forms, sightings, formsSightings } = assembleImport(parsed, {
    defaultNumberObserver: DEFAULT_SETTINGS.defaultNumberObserver,
    autoAssignDuration: DEFAULT_SETTINGS.autoAssignDuration,
    autoAssignDistance: DEFAULT_SETTINGS.autoAssignDistance,
    speciesCommentTemplate: defaultSpeciesCommentTemplate,
  });
  const exportableForms = exportableFormsOf(forms);
  const { rows, errors } = buildExportRows({
    exportableForms,
    sightingsByFormId: groupSightingsByForm(exportableForms, sightings, formsSightings),
    speciesCommentTemplate: defaultSpeciesCommentTemplate,
    commonNameForSighting: (sighting) => sighting.common_name || "",
    scientificNameForSighting: (sighting) =>
      ebirdScientificNameByCode.get(sighting.ebird_species_code) || "",
    importedWithText: en.importedWith,
    mapboxToken: "",
    globalStaticMap: DEFAULT_SETTINGS.globalStaticMap,
  });
  return { parsed, forms, rows, errors, csv: rowsToCsv(rows) };
}

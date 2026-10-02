import { readFileSync } from "node:fs";
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
import { parseImportFile } from "../src/lib/importers";
import { loadOrnithoSpeciesList } from "../src/lib/taxonomy";
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

export async function parseFixture(fixture, websiteName) {
  await loadOrnithoSpeciesList();
  return parseImportFile(readFixture(fixture), website(websiteName));
}

// The whole import -> export pipeline with default settings, as App.vue and ExportPanel.vue run it.
// Species names are not matched against the eBird taxonomy (that needs the eBird API), so
// rows keep the source names.
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
    importedWithText: en.importedWith,
    mapboxToken: "",
    globalStaticMap: DEFAULT_SETTINGS.globalStaticMap,
  });
  return { parsed, forms, rows, errors, csv: rowsToCsv(rows) };
}

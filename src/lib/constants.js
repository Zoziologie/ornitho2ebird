import ebirdTaxonomyLanguages from "../../data/ebird_taxonomy_languages.json";

export const APP_STORAGE_PREFIX = "ornitho2ebird";
export const LANGUAGE_COOKIE_NAME = `${APP_STORAGE_PREFIX}_language`;

export const UI_LANGUAGES = [
  { value: "en", label: "English" },
  { value: "fr", label: "Français" },
  { value: "ca", label: "Català" },
  { value: "de", label: "Deutsch" },
];

export const EBIRD_LANGUAGES = ebirdTaxonomyLanguages;

export const DEFAULT_WEBSITE_BY_LANGUAGE = {
  en: "ornitho network",
  fr: "faune-france.org",
  ca: "ornitho.cat",
  de: "ornitho.de",
};

export const DEFAULT_SPECIES_COMMENT_TEMPLATE = {
  short:
    '${ s.count_precision }${ s.count } ind.${ s.time ? " - " + s.time : "" }${ s.comment ? " - " + s.comment : "" }',
  long:
    '${ s.count_precision }${ s.count }${ s.time ? " - " + s.time : "" }${ s.comment ? " - " + s.comment : "" }',
  limit: 5,
};

export const DEFAULT_SETTINGS = {
  uiLanguage: "en",
  ebirdLanguage: "en",
  autoAssignDuration: 24,
  autoAssignDistance: 3,
  defaultNumberObserver: 1,
  customizedSpeciesComments: true,
  speciesCommentTemplate: DEFAULT_SPECIES_COMMENT_TEMPLATE,
  advancedEnabled: false,
  mapboxToken: "",
  githubToken: "",
  globalStaticMap: {
    show: false,
    style: "satellite-v9",
    pathStyle: {
      strokeWidth: 5,
      strokeColor: "#AD8533",
      strokeOpacity: 1,
    },
    markerStyle: {
      markerSize: "small",
      markerSymbol: "circle",
      markerColor: "#808080",
    },
  },
  websiteName: "",
};

import ebirdTaxonomyLanguages from "../../data/ebird_taxonomy_languages.json";

export const APP_STORAGE_PREFIX = "ornitho2ebird";
export const LANGUAGE_COOKIE_NAME = `${APP_STORAGE_PREFIX}_language`;
export const LOCATION_NAME_MAX_LENGTH = 128;

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

export const ASSIGNMENT_MAP_BASE_LAYER_OPTIONS = [
  "OpenStreetMap",
  "Satellite",
  "Swiss (swisstopo)",
  "France (IGN)",
  "Germany (BKG)",
];

export const BASIC_SPECIES_COMMENT_TEMPLATE = {
  short:
    '${ s.count_precision }${ s.count } ind.${ s.time ? " - " + s.time : "" }${ s.comment ? " - " + s.comment : "" }',
  long:
    '${ s.count_precision }${ s.count }${ s.time ? " - " + s.time : "" }${ s.comment ? " - " + s.comment : "" }',
  limit: 5,
};

export const SPECIES_COMMENT_TEMPLATE_OPTION_KEYS = [
  "count",
  "time",
  "timeSourceLink",
  "sourceLink",
  "map",
  "comment",
  "atlas",
  "auditory",
  "personalized",
];

export const DEFAULT_SPECIES_COMMENT_TEMPLATE_OPTIONS = {
  count: true,
  time: true,
  timeSourceLink: true,
  sourceLink: false,
  map: true,
  comment: true,
  atlas: false,
  auditory: false,
  personalized: false,
};

export const DEFAULT_SPECIES_COMMENT_LONG_TEMPLATE_OPTIONS = {
  count: true,
  time: true,
  timeSourceLink: true,
  sourceLink: false,
  map: false,
  comment: false,
  atlas: false,
  auditory: false,
  personalized: false,
};

const SPECIES_COMMENT_TEMPLATE_EXPRESSIONS = {
  count: ({ withCountUnit }) =>
    `s.count !== "" && s.count != null ? (s.count_precision || "") + s.count${withCountUnit ? ' + " ind."' : ""} : ""`,
  time: ({ options }) =>
    options.timeSourceLink
      ? "s.time ? (s.source_record_url ? '<a href=\"' + s.source_record_url + '\">' + s.time + '</a>' : s.time) : ''"
      : "s.time || ''",
  sourceLink: () =>
    "s.source_record_url ? '<a href=\"' + s.source_record_url + '\">' + (s.source_website_name || 'Source') + '</a>' : ''",
  map: () =>
    "s.google_maps_url && s.coordinates ? '<a href=\"' + s.google_maps_url + '\">' + s.coordinates + '</a>' : ''",
  comment: () => "s.comment || ''",
  atlas: () => 's.atlas_code ? "Atlas: " + s.atlas_code : ""',
  auditory: () => 'String(s.auditory_contact) === "1" || s.auditory_contact === true ? "Auditory contact" : ""',
};

function buildSpeciesCommentTemplateString(options, { withCountUnit = false } = {}) {
  const expressions = Object.entries(SPECIES_COMMENT_TEMPLATE_EXPRESSIONS)
    .filter(([key]) => options[key])
    .map(([, buildExpression]) => buildExpression({ options, withCountUnit }));

  return `\${ [${expressions.join(", ")}].filter(Boolean).join(" - ") }`;
}

export function buildSpeciesCommentTemplateFromOptions(options = {}, limit = 5, longOptions = options) {
  const normalizedOptions = {
    ...DEFAULT_SPECIES_COMMENT_TEMPLATE_OPTIONS,
    ...options,
  };
  const normalizedLongOptions = {
    ...DEFAULT_SPECIES_COMMENT_LONG_TEMPLATE_OPTIONS,
    ...longOptions,
  };

  return {
    short: buildSpeciesCommentTemplateString(normalizedOptions, { withCountUnit: true }),
    long: buildSpeciesCommentTemplateString(normalizedLongOptions),
    limit: Number(limit) || 5,
  };
}

export const DEFAULT_SPECIES_COMMENT_TEMPLATE = {
  ...buildSpeciesCommentTemplateFromOptions(DEFAULT_SPECIES_COMMENT_TEMPLATE_OPTIONS),
  limit: 5,
};

export const DEFAULT_SETTINGS = {
  uiLanguage: "en",
  ebirdLanguage: "en",
  autoAssignDuration: 24,
  autoAssignDistance: 3,
  assignmentMapBaseLayer: "OpenStreetMap",
  defaultNumberObserver: 1,
  customizedSpeciesComments: true,
  speciesCommentTemplateOptions: DEFAULT_SPECIES_COMMENT_TEMPLATE_OPTIONS,
  speciesCommentLongTemplateOptions: DEFAULT_SPECIES_COMMENT_LONG_TEMPLATE_OPTIONS,
  speciesCommentTemplate: DEFAULT_SPECIES_COMMENT_TEMPLATE,
  advancedEnabled: false,
  mapboxToken: "",
  githubToken: "",
  globalStaticMap: {
    show: false,
    interactive: false,
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

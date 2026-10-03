import {
  APP_STORAGE_PREFIX,
  ASSIGNMENT_MAP_BASE_LAYER_OPTIONS,
  DEFAULT_SETTINGS,
  DEFAULT_SPECIES_COMMENT_LONG_TEMPLATE_OPTIONS,
  DEFAULT_SPECIES_COMMENT_TEMPLATE,
  DEFAULT_SPECIES_COMMENT_TEMPLATE_OPTIONS,
  DEFAULT_WEBSITE_BY_LANGUAGE,
  SPECIES_COMMENT_TEMPLATE_OPTION_KEYS,
  buildSpeciesCommentTemplateFromOptions,
} from "./constants";
import { readStorage, writeStorage } from "./storage";
import { normalizeLanguage, resolveUiLanguage } from "../i18n";

export const SETTINGS_STORAGE_KEY = `${APP_STORAGE_PREFIX}:settings`;

// App.vue provides its reactive settings under this key to SettingsPanel, which edits them in
// place.
export const SETTINGS_INJECTION_KEY = Symbol("settings");

// Bump when the stored shape changes, and add the step that upgrades the previous version to
// MIGRATIONS.
export const SETTINGS_VERSION = 1;

// MIGRATIONS[n] upgrades settings saved at version n to version n + 1.
const MIGRATIONS = [
  // 0 → 1: settings saved before they had a version (up to 0.4.1).
  (settings) => {
    // assignmentMap is gone; ebirdLanguage too (the export writes scientific names, which eBird
    // matches whatever the account language). `language` was read as the UI language when
    // uiLanguage was empty.
    const {
      assignmentMap: _assignmentMap,
      ebirdLanguage: _ebirdLanguage,
      language,
      ...rest
    } = settings;
    if (!rest.uiLanguage && language) {
      rest.uiLanguage = language;
    }
    return rest;
  },
];

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

// A stored value of another type than its default (a cleared number input saves "") falls back
// to the default.
function sameTypeOrDefault(value, fallback) {
  if (typeof fallback === "number") {
    return typeof value === "number" && Number.isFinite(value) ? value : fallback;
  }
  return typeof value === typeof fallback ? value : fallback;
}

function pickDefaultKeys(value, defaults) {
  const source = isPlainObject(value) ? value : {};
  return Object.fromEntries(
    Object.entries(defaults).map(([key, fallback]) => [
      key,
      sameTypeOrDefault(source[key], fallback),
    ]),
  );
}

export function defaultWebsiteForLanguage(language) {
  return DEFAULT_WEBSITE_BY_LANGUAGE[language] || DEFAULT_WEBSITE_BY_LANGUAGE.en;
}

export function normalizeSpeciesCommentTemplate(template) {
  const text = (value, fallback) => (typeof value === "string" && value ? value : fallback);
  return {
    short: text(template?.short, DEFAULT_SPECIES_COMMENT_TEMPLATE.short),
    long: text(template?.long, DEFAULT_SPECIES_COMMENT_TEMPLATE.long),
    limit: Number(template?.limit) || 5,
  };
}

function hasSpeciesCommentTemplateOptions(options) {
  return (
    isPlainObject(options) && SPECIES_COMMENT_TEMPLATE_OPTION_KEYS.some((key) => key in options)
  );
}

function normalizeSpeciesCommentSettings(savedSettings) {
  const savedOptions = savedSettings.speciesCommentTemplateOptions;
  const savedLongOptions = savedSettings.speciesCommentLongTemplateOptions;

  // Settings saved before the template options existed: their template is not kept.
  if (!hasSpeciesCommentTemplateOptions(savedOptions)) {
    return {
      options: structuredClone(DEFAULT_SPECIES_COMMENT_TEMPLATE_OPTIONS),
      longOptions: structuredClone(DEFAULT_SPECIES_COMMENT_LONG_TEMPLATE_OPTIONS),
      template: structuredClone(DEFAULT_SPECIES_COMMENT_TEMPLATE),
    };
  }

  const normalizeOptions = (value, defaults) => {
    const source = isPlainObject(value) ? value : {};
    return Object.fromEntries(
      SPECIES_COMMENT_TEMPLATE_OPTION_KEYS.map((key) => [
        key,
        key in source ? Boolean(source[key]) : Boolean(defaults[key]),
      ]),
    );
  };
  const options = normalizeOptions(savedOptions, DEFAULT_SPECIES_COMMENT_TEMPLATE_OPTIONS);
  const longOptions = normalizeOptions(savedLongOptions, options);
  longOptions.personalized = false;
  const template = options.personalized
    ? normalizeSpeciesCommentTemplate(savedSettings.speciesCommentTemplate)
    : buildSpeciesCommentTemplateFromOptions(
        options,
        savedSettings.speciesCommentTemplate?.limit || DEFAULT_SPECIES_COMMENT_TEMPLATE.limit,
        longOptions,
      );

  return { options, longOptions, template };
}

function normalizeGlobalStaticMap(value) {
  const defaults = DEFAULT_SETTINGS.globalStaticMap;
  const saved = isPlainObject(value) ? value : {};

  return {
    show: Boolean(saved.show),
    interactive: Boolean(saved.interactive),
    style: typeof saved.style === "string" && saved.style ? saved.style : defaults.style,
    pathStyle: pickDefaultKeys(saved.pathStyle, defaults.pathStyle),
    markerStyle: pickDefaultKeys(saved.markerStyle, defaults.markerStyle),
  };
}

function normalizeAssignmentMapBaseLayer(value) {
  return ASSIGNMENT_MAP_BASE_LAYER_OPTIONS.includes(value)
    ? value
    : DEFAULT_SETTINGS.assignmentMapBaseLayer;
}

function upgradeSettings(stored) {
  // Nothing saved: start from the defaults, so their template options build the template.
  if (stored == null) {
    return { ...DEFAULT_SETTINGS };
  }
  let settings = isPlainObject(stored) ? { ...stored } : {};
  const { settingsVersion } = settings;
  let version = Number.isInteger(settingsVersion) && settingsVersion > 0 ? settingsVersion : 0;
  while (version < MIGRATIONS.length) {
    settings = MIGRATIONS[version](settings);
    version += 1;
  }
  return settings;
}

// Turns whatever is stored (any older version, missing or wrong values, null) into complete,
// valid settings. Keys that are not in DEFAULT_SETTINGS are dropped.
export function migrateSettings(stored) {
  const saved = upgradeSettings(stored);
  const speciesComment = normalizeSpeciesCommentSettings(saved);

  return {
    ...pickDefaultKeys(saved, DEFAULT_SETTINGS),
    uiLanguage: normalizeLanguage(saved.uiLanguage) || DEFAULT_SETTINGS.uiLanguage,
    assignmentMapBaseLayer: normalizeAssignmentMapBaseLayer(saved.assignmentMapBaseLayer),
    speciesCommentTemplateOptions: speciesComment.options,
    speciesCommentLongTemplateOptions: speciesComment.longOptions,
    speciesCommentTemplate: speciesComment.template,
    globalStaticMap: normalizeGlobalStaticMap(saved.globalStaticMap),
  };
}

// isReturningUser: settings were saved before, i.e. the app has been used in this browser.
export function loadSettings() {
  const stored = readStorage(SETTINGS_STORAGE_KEY, null);
  const settings = migrateSettings(stored);

  // ?lang= and the language cookie win over the saved language. On a first visit nothing is
  // saved, so the browser's language decides rather than the default English.
  settings.uiLanguage = resolveUiLanguage(stored === null ? {} : settings);
  const queryLanguage = normalizeLanguage(
    typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("lang") : "",
  );
  if (queryLanguage || !settings.websiteName) {
    settings.websiteName = defaultWebsiteForLanguage(settings.uiLanguage);
  }

  return { settings, isReturningUser: stored !== null };
}

export function saveSettings(settings) {
  writeStorage(SETTINGS_STORAGE_KEY, { ...settings, settingsVersion: SETTINGS_VERSION });
}

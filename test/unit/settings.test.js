import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_SETTINGS,
  DEFAULT_SPECIES_COMMENT_LONG_TEMPLATE_OPTIONS,
  DEFAULT_SPECIES_COMMENT_TEMPLATE,
  DEFAULT_SPECIES_COMMENT_TEMPLATE_OPTIONS,
  buildSpeciesCommentTemplateFromOptions,
} from "../../src/lib/constants";
import {
  SETTINGS_STORAGE_KEY,
  SETTINGS_VERSION,
  loadSettings,
  migrateSettings,
  saveSettings,
} from "../../src/lib/settings";

// A browser with this localStorage content and URL query.
function stubBrowser(stored = {}, search = "") {
  const storage = new Map(
    Object.entries(stored).map(([key, value]) => [key, JSON.stringify(value)]),
  );
  vi.stubGlobal("window", {
    location: { search },
    localStorage: {
      getItem: (key) => (storage.has(key) ? storage.get(key) : null),
      setItem: (key, value) => storage.set(key, String(value)),
    },
  });
  return storage;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

// What a first visit gets. The long template follows the default long-comment options, unlike
// DEFAULT_SPECIES_COMMENT_TEMPLATE, whose long template uses the short-comment options.
const firstVisitSettings = {
  ...DEFAULT_SETTINGS,
  speciesCommentTemplate: buildSpeciesCommentTemplateFromOptions(
    DEFAULT_SPECIES_COMMENT_TEMPLATE_OPTIONS,
    5,
    DEFAULT_SPECIES_COMMENT_LONG_TEMPLATE_OPTIONS,
  ),
};

const customTemplate = { short: "${ s.count } short", long: "${ s.count } long", limit: 8 };

// Settings as 0.4.1 saved them: every key of DEFAULT_SETTINGS, no version.
const savedBy041 = {
  ...structuredClone(DEFAULT_SETTINGS),
  uiLanguage: "fr",
  autoAssignDuration: 12,
  autoAssignDistance: 1.5,
  assignmentMapBaseLayer: "Satellite",
  defaultNumberObserver: 2,
  advancedEnabled: true,
  mapboxToken: "pk.test",
  speciesCommentTemplateOptions: { ...DEFAULT_SPECIES_COMMENT_TEMPLATE_OPTIONS, atlas: true },
  globalStaticMap: {
    ...structuredClone(DEFAULT_SETTINGS.globalStaticMap),
    show: true,
    style: "outdoors-v12",
  },
  websiteName: "ornitho.ch",
};

describe("migrateSettings", () => {
  it("returns the defaults when nothing is stored", () => {
    expect(migrateSettings(null)).toEqual(firstVisitSettings);
    expect(migrateSettings(undefined)).toEqual(firstVisitSettings);
  });

  it("returns copies, not the default objects", () => {
    const settings = migrateSettings(null);
    settings.globalStaticMap.pathStyle.strokeWidth = 9;
    settings.speciesCommentTemplateOptions.atlas = true;
    expect(DEFAULT_SETTINGS.globalStaticMap.pathStyle.strokeWidth).toBe(5);
    expect(DEFAULT_SPECIES_COMMENT_TEMPLATE_OPTIONS.atlas).toBe(false);
  });

  it("loads the current shape unchanged", () => {
    const current = migrateSettings({ ...savedBy041, settingsVersion: SETTINGS_VERSION });
    expect(Object.keys(current)).toEqual(Object.keys(DEFAULT_SETTINGS));
    expect(migrateSettings({ ...current, settingsVersion: SETTINGS_VERSION })).toEqual(current);
    expect(current).toMatchObject({
      uiLanguage: "fr",
      autoAssignDuration: 12,
      autoAssignDistance: 1.5,
      assignmentMapBaseLayer: "Satellite",
      defaultNumberObserver: 2,
      advancedEnabled: true,
      mapboxToken: "pk.test",
      websiteName: "ornitho.ch",
      globalStaticMap: { show: true, style: "outdoors-v12" },
    });
  });

  it("loads unversioned 0.4.1 settings the same way", () => {
    expect(migrateSettings(savedBy041)).toEqual(
      migrateSettings({ ...savedBy041, settingsVersion: SETTINGS_VERSION }),
    );
  });

  it("rebuilds the template from the options unless it is personalized", () => {
    const fromOptions = migrateSettings({
      speciesCommentTemplateOptions: { ...DEFAULT_SPECIES_COMMENT_TEMPLATE_OPTIONS, atlas: true },
      speciesCommentTemplate: customTemplate,
    });
    expect(fromOptions.speciesCommentTemplate).toEqual(
      buildSpeciesCommentTemplateFromOptions(
        fromOptions.speciesCommentTemplateOptions,
        8,
        fromOptions.speciesCommentLongTemplateOptions,
      ),
    );

    const personalized = migrateSettings({
      speciesCommentTemplateOptions: { personalized: true },
      speciesCommentTemplate: customTemplate,
    });
    expect(personalized.speciesCommentTemplate).toEqual(customTemplate);
  });

  describe("settings saved before versions", () => {
    it("0.2: eBird language, no template options, static map without interactive", () => {
      const settings = migrateSettings({
        uiLanguage: "de",
        ebirdLanguage: "de",
        autoAssignDuration: 24,
        autoAssignDistance: 3,
        defaultNumberObserver: 1,
        customizedSpeciesComments: false,
        speciesCommentTemplate: customTemplate,
        advancedEnabled: false,
        mapboxToken: "",
        githubToken: "",
        globalStaticMap: { show: true, style: "satellite-v9" },
        websiteName: "ornitho.de",
      });
      expect(settings).not.toHaveProperty("ebirdLanguage");
      expect(settings.uiLanguage).toBe("de");
      expect(settings.customizedSpeciesComments).toBe(false);
      // Without saved options the old template is replaced by the default one.
      expect(settings.speciesCommentTemplateOptions).toEqual(
        DEFAULT_SPECIES_COMMENT_TEMPLATE_OPTIONS,
      );
      expect(settings.speciesCommentLongTemplateOptions).toEqual(
        DEFAULT_SPECIES_COMMENT_LONG_TEMPLATE_OPTIONS,
      );
      expect(settings.speciesCommentTemplate).toEqual(DEFAULT_SPECIES_COMMENT_TEMPLATE);
      expect(settings.globalStaticMap).toEqual({
        ...DEFAULT_SETTINGS.globalStaticMap,
        show: true,
      });
      expect(settings.assignmentMapBaseLayer).toBe("OpenStreetMap");
    });

    it("drops assignmentMap", () => {
      const settings = migrateSettings({
        assignmentMap: { baseLayer: "Satellite" },
        assignmentMapBaseLayer: "France (IGN)",
      });
      expect(settings).not.toHaveProperty("assignmentMap");
      expect(settings.assignmentMapBaseLayer).toBe("France (IGN)");
    });

    it("reads the old language key as the UI language", () => {
      const settings = migrateSettings({ language: "it" });
      expect(settings).not.toHaveProperty("language");
      expect(settings.uiLanguage).toBe("it");
      expect(migrateSettings({ uiLanguage: "fr", language: "it" }).uiLanguage).toBe("fr");
      expect(migrateSettings({ uiLanguage: "", language: "it" }).uiLanguage).toBe("it");
    });

    it("derives missing long-comment options from the short ones", () => {
      const settings = migrateSettings({
        speciesCommentTemplateOptions: { count: true, time: false, map: false, atlas: true },
      });
      expect(settings.speciesCommentTemplateOptions).toMatchObject({
        count: true,
        time: false,
        map: false,
        atlas: true,
        comment: true,
      });
      expect(settings.speciesCommentLongTemplateOptions).toEqual({
        ...settings.speciesCommentTemplateOptions,
        personalized: false,
      });
    });
  });

  it("does not migrate a versioned language key", () => {
    // Version 1 never had `language`: it is dropped like any unknown key.
    expect(migrateSettings({ language: "it", settingsVersion: 1 }).uiLanguage).toBe("en");
  });

  it("drops unknown keys, also inside the static map styles", () => {
    const settings = migrateSettings({
      ...savedBy041,
      somethingOld: 1,
      settingsVersion: SETTINGS_VERSION,
      globalStaticMap: {
        ...savedBy041.globalStaticMap,
        extra: true,
        pathStyle: { strokeWidth: 3, extra: true },
      },
    });
    expect(settings).not.toHaveProperty("somethingOld");
    expect(settings).not.toHaveProperty("settingsVersion");
    expect(settings.globalStaticMap).not.toHaveProperty("extra");
    expect(settings.globalStaticMap.pathStyle).toEqual({
      ...DEFAULT_SETTINGS.globalStaticMap.pathStyle,
      strokeWidth: 3,
    });
  });

  it("replaces values of the wrong type by defaults", () => {
    const settings = migrateSettings({
      uiLanguage: "xx",
      autoAssignDuration: "",
      autoAssignDistance: Number.NaN,
      defaultNumberObserver: null,
      assignmentMapBaseLayer: "Unknown layer",
      customizedSpeciesComments: "yes",
      advancedEnabled: 1,
      mapboxToken: 42,
      websiteName: {},
      speciesCommentTemplateOptions: ["count"],
      speciesCommentLongTemplateOptions: "time",
      speciesCommentTemplate: "short",
      globalStaticMap: { style: 3, pathStyle: "thick", markerStyle: { markerSize: 2 } },
    });
    expect(settings).toEqual(DEFAULT_SETTINGS);
  });

  it("ignores stored values that are not an object", () => {
    for (const stored of ["text", 3, true, [1, 2]]) {
      expect(migrateSettings(stored)).toEqual(DEFAULT_SETTINGS);
    }
  });
});

describe("loadSettings", () => {
  it("knows whether settings were saved before", () => {
    stubBrowser();
    expect(loadSettings()).toEqual({ settings: firstVisitSettings, isReturningUser: false });

    stubBrowser({ [SETTINGS_STORAGE_KEY]: savedBy041 });
    const { settings, isReturningUser } = loadSettings();
    expect(isReturningUser).toBe(true);
    expect(settings).toEqual(migrateSettings(savedBy041));
  });

  it("picks the website of the language when none is saved", () => {
    stubBrowser({ [SETTINGS_STORAGE_KEY]: { language: "fr" } });
    expect(loadSettings().settings).toMatchObject({
      uiLanguage: "fr",
      websiteName: "faune-france.org",
    });
  });

  it("lets ?lang= choose the language and its website", () => {
    stubBrowser({ [SETTINGS_STORAGE_KEY]: savedBy041 }, "?lang=de");
    expect(loadSettings().settings).toMatchObject({ uiLanguage: "de", websiteName: "ornitho.de" });
  });
});

describe("saveSettings", () => {
  it("writes the settings with their version", () => {
    const storage = stubBrowser();
    const settings = migrateSettings(savedBy041);
    saveSettings(settings);

    const saved = JSON.parse(storage.get(SETTINGS_STORAGE_KEY));
    expect(saved).toEqual({ ...settings, settingsVersion: SETTINGS_VERSION });
    expect(settings).not.toHaveProperty("settingsVersion");
    expect(migrateSettings(saved)).toEqual(settings);
  });
});

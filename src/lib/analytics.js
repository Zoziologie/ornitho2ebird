import { reactive } from "vue";
import websites from "../../data/websites_list.json";
import { SPECIES_COMMENT_TEMPLATE_OPTION_KEYS } from "./constants";
import { BASEMAPS } from "./basemaps";

export const MEASUREMENT_ID = "G-TJ2TZSXSBW";
export const CONSENT_KEY = "ornitho2ebird:analytics-consent";
const CONSENT_DAYS = 180;
const pageContext = {
  page_location: "https://ornitho2ebird.com/",
  page_referrer: "",
  page_title: "Ornitho2eBird",
};
const denied = {
  analytics_storage: "denied",
  ad_storage: "denied",
  ad_user_data: "denied",
  ad_personalization: "denied",
};
const allowedValues = {
  source_website: ["", ...websites.map(({ name }) => name)],
  enabled: ["yes", "no"],
  visitor_type: ["new", "returning"],
  panel: ["import", "assignment", "checklist", "export", "next_steps"],
  destination: ["source_export", "ebird_import", "ebird_status"],
  settings_section: ["", "privacy", "aggregation", "advanced-options", "species-comment-template"],
  readiness: ["no_checklists", "loading_taxonomy", "invalid_checklists", "ready"],
  import_profile: ["lists", "casual", "mixed", "empty"],
  failure_reason: ["missing_columns", "invalid_json", "txt_header", "unsupported", "unexpected"],
  outcome: ["success", "failure", "blocked"],
  mode: ["basic", "customized"],
  comment_mode: ["disabled", "options", "personalized"],
  has_species_comments: ["yes", "no"],
  language: ["en", "fr", "de", "it", "ca"],
  section: [
    "",
    "workflow",
    "conversion",
    "auto-assignment",
    "customize",
    "faq",
    "duplicates",
    "large-imports",
    "not-for-ebird",
    "species-matching",
    "hotspots",
    "processing",
    "mistakes",
    "rarities",
    "distance",
  ],
  setting_name: [
    "defaultNumberObserver",
    "autoAssignDuration",
    "autoAssignDistance",
    "customizedSpeciesComments",
    "personalizedComments",
    "staticMap",
    "interactiveMap",
    ...["short", "long"].flatMap((kind) =>
      SPECIES_COMMENT_TEMPLATE_OPTION_KEYS.filter((key) => key !== "personalized").map(
        (key) => `comment_${kind}_${key}`,
      ),
    ),
  ],
  layer: ["", ...BASEMAPS.map(({ id }) => id)],
  action: [
    "create",
    "delete",
    "assign",
    "clean",
    "reset",
    "auto_assign",
    "path",
    "hotspot",
    "edit",
    "move",
    "select",
    "view_observations",
    "compute_date",
    "compute_time",
    "compute_duration",
    "select_rectangle",
    "draw_path",
    "focus_map",
  ],
};
const eventFields = {
  source_select: ["source_website"],
  import_start: ["source_website"],
  import_file: ["source_website", "outcome", "import_profile", "failure_reason"],
  panel_view: ["panel"],
  export_state: ["readiness"],
  workflow_link: ["destination"],
  help_topic: ["section"],
  export_csv: ["mode", "outcome", "comment_mode", "has_species_comments"],
  publish_maps: ["outcome"],
  mode_change: ["mode"],
  language_change: ["language"],
  help_open: ["section"],
  settings_open: ["settings_section"],
  setting_change: ["setting_name", "enabled"],
  map_layer_change: ["layer"],
  checklist_action: ["action", "panel"],
};

export function createAnalytics(browser = window) {
  let saved;
  try {
    saved = JSON.parse(browser.localStorage.getItem(CONSENT_KEY));
  } catch {
    // The app also works when storage is blocked.
  }
  const state = reactive({
    choice:
      ["accepted", "rejected"].includes(saved?.choice) &&
      saved.time <= Date.now() &&
      Date.now() - saved.time < CONSENT_DAYS * 86400000
        ? saved.choice
        : null,
  });
  let loaded = false;
  let context = {};
  const contextFields = ["mode", "language", "source_website", "visitor_type"];
  function setContext(properties) {
    context = Object.fromEntries(
      contextFields
        .filter((field) => allowedValues[field].includes(properties[field]))
        .map((field) => [field, properties[field]]),
    );
  }

  function clearCookies() {
    for (const cookie of browser.document.cookie.split(";")) {
      const name = cookie.trim().split("=")[0];
      if (name !== "_ga" && name !== `_ga_${MEASUREMENT_ID.slice(2)}`) continue;
      const domains = browser.location.hostname.split(".");
      for (let index = 0; index < domains.length; index += 1) {
        for (const domain of ["", `; domain=${domains.slice(index).join(".")}`]) {
          browser.document.cookie = `${name}=; Max-Age=0; path=/${domain}`;
        }
      }
    }
  }

  function start() {
    if (state.choice !== "accepted") {
      browser[`ga-disable-${MEASUREMENT_ID}`] = true;
      clearCookies();
      return;
    }
    browser[`ga-disable-${MEASUREMENT_ID}`] = false;
    if (loaded) {
      browser.gtag("consent", "update", { ...denied, analytics_storage: "granted" });
      return;
    }
    loaded = true;
    browser.dataLayer = [];
    browser.gtag = function () {
      browser.dataLayer.push(arguments);
    };
    browser.gtag("consent", "default", denied);
    browser.gtag("consent", "update", { ...denied, analytics_storage: "granted" });
    browser.gtag("js", new Date());
    browser.gtag("config", MEASUREMENT_ID, {
      ...pageContext,
      send_page_view: false,
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
      cookie_expires: CONSENT_DAYS * 86400,
      cookie_update: false,
    });
    browser.gtag("event", "page_view", { ...context, ...pageContext });
    const script = browser.document.createElement("script");
    script.id = "analytics-tag";
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}`;
    browser.document.head.append(script);
  }

  function choose(choice) {
    state.choice = choice;
    try {
      browser.localStorage.setItem(CONSENT_KEY, JSON.stringify({ choice, time: Date.now() }));
    } catch {
      // Keep the choice for this visit even if it cannot be saved.
    }
    if (choice === "accepted") {
      start();
    } else {
      // Disable measurement first. Do not reload: that would discard the user's import.
      browser[`ga-disable-${MEASUREMENT_ID}`] = true;
      if (loaded) {
        browser.gtag("consent", "update", denied);
      }
      clearCookies();
    }
  }

  function track(name, properties = {}) {
    if (state.choice !== "accepted" || !loaded || !Object.hasOwn(eventFields, name)) return;
    const fields = eventFields[name];
    if (
      fields.some(
        (field) => field in properties && !allowedValues[field].includes(properties[field]),
      )
    )
      return;
    const payload = Object.fromEntries(
      fields.filter((field) => field in properties).map((field) => [field, properties[field]]),
    );
    browser.gtag("event", name, { ...context, ...payload, ...pageContext });
  }

  return { state, start, choose, track, setContext };
}

let analytics;
export function getAnalytics() {
  analytics ||= createAnalytics();
  return analytics;
}
export function trackEvent(name, properties) {
  if (typeof window !== "undefined") getAnalytics().track(name, properties);
}

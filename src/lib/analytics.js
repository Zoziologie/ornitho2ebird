import { reactive } from "vue";
import websites from "../../data/websites_list.json";
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
  source_website: websites.map(({ name }) => name),
  outcome: ["success", "failure", "blocked"],
  mode: ["basic", "customized"],
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
  ],
};
const eventFields = {
  import_file: ["source_website", "outcome"],
  export_csv: ["mode", "outcome"],
  publish_maps: ["outcome"],
  mode_change: ["mode"],
  language_change: ["language"],
  help_open: ["section"],
  settings_open: [],
  setting_change: ["setting_name"],
  map_layer_change: ["layer"],
  checklist_action: ["action"],
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
    browser.gtag("event", "page_view", pageContext);
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
    browser.gtag("event", name, { ...payload, ...pageContext });
  }

  return { state, start, choose, track };
}

let analytics;
export function getAnalytics() {
  analytics ||= createAnalytics();
  return analytics;
}
export function trackEvent(name, properties) {
  if (typeof window !== "undefined") getAnalytics().track(name, properties);
}

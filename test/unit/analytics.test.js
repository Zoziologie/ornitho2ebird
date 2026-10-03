import { describe, expect, it, vi } from "vitest";
import { CONSENT_KEY, MEASUREMENT_ID, createAnalytics } from "../../src/lib/analytics";

function browserWith(saved = null) {
  const cookies = new Map([
    ["_ga", "legacy"],
    [`_ga_${MEASUREMENT_ID.slice(2)}`, "legacy"],
    ["ornitho2ebird_language", "fr"],
    ["_ga_OTHER", "other-tool"],
  ]);
  return {
    localStorage: {
      getItem: vi.fn(() => saved),
      setItem: vi.fn(),
    },
    location: { hostname: "ornitho2ebird.com", reload: vi.fn() },
    document: {
      get cookie() {
        return [...cookies].map(([key, value]) => `${key}=${value}`).join("; ");
      },
      set cookie(value) {
        cookies.delete(value.split("=")[0]);
      },
      createElement: vi.fn(() => ({})),
      head: { append: vi.fn() },
    },
  };
}
const commands = (browser) => (browser.dataLayer || []).map((args) => [...args]);
const savedChoice = (choice, time = Date.now()) => JSON.stringify({ choice, time });

describe("optional analytics", () => {
  it.each([
    null,
    savedChoice("rejected"),
    "invalid JSON",
    savedChoice("unknown"),
    savedChoice("accepted", 0),
    savedChoice("accepted", Date.now() + 86400000),
  ])("never loads or queues events without current acceptance (%s)", (saved) => {
    const browser = browserWith(saved);
    const analytics = createAnalytics(browser);
    analytics.start();
    analytics.track("import_file", { source_website: "ornitho.ch", outcome: "success" });
    expect(browser.document.head.append).not.toHaveBeenCalled();
    expect(commands(browser)).toEqual([]);
    expect(browser.document.cookie).not.toContain("legacy");
    expect(browser.document.cookie).toContain("ornitho2ebird_language=fr");
    expect(browser.document.cookie).toContain("_ga_OTHER=other-tool");
  });

  it("loads once after acceptance with consent first and fixed page context", () => {
    const browser = browserWith();
    const analytics = createAnalytics(browser);
    analytics.choose("accepted");
    analytics.start();
    expect(browser.localStorage.setItem).toHaveBeenCalledWith(
      CONSENT_KEY,
      expect.stringContaining('"choice":"accepted"'),
    );
    expect(browser.document.head.append).toHaveBeenCalledTimes(1);
    expect(browser.document.head.append.mock.calls[0][0].src).toBe(
      `https://www.googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}`,
    );
    expect(commands(browser)[0]).toEqual([
      "consent",
      "default",
      {
        analytics_storage: "denied",
        ad_storage: "denied",
        ad_user_data: "denied",
        ad_personalization: "denied",
      },
    ]);
    expect(commands(browser)[1][2]).toMatchObject({
      analytics_storage: "granted",
      ad_storage: "denied",
    });
    expect(commands(browser).find(([command]) => command === "config")[2]).toMatchObject({
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
      cookie_update: false,
      cookie_expires: 180 * 86400,
      page_location: "https://ornitho2ebird.com/",
      page_referrer: "",
      send_page_view: false,
    });
    expect(commands(browser).filter(([, name]) => name === "page_view")).toHaveLength(1);
  });

  it("uses saved acceptance and filters event fields and values", () => {
    const browser = browserWith(savedChoice("accepted"));
    const analytics = createAnalytics(browser);
    analytics.start();
    analytics.track("import_file", {
      source_website: "ornitho.ch",
      outcome: "success",
      filename: "secret.json",
      coordinates: [46, 7],
      page_location: "https://secret.test/",
    });
    expect(commands(browser).at(-1)).toEqual([
      "event",
      "import_file",
      {
        source_website: "ornitho.ch",
        outcome: "success",
        page_location: "https://ornitho2ebird.com/",
        page_referrer: "",
        page_title: "Ornitho2eBird",
      },
    ]);
    const count = commands(browser).length;
    analytics.track("import_file", { source_website: "private.example", outcome: "success" });
    analytics.track("checklist_action", { action: "secret" });
    analytics.track("setting_change", { setting_name: "githubToken" });
    analytics.track("unknown", {});
    analytics.track("constructor", {});
    expect(commands(browser)).toHaveLength(count);
  });

  it.each(["disabled", "options", "personalized"])(
    "allows export comment mode %s without transmitting contents",
    (mode) => {
      const browser = browserWith(savedChoice("accepted"));
      const analytics = createAnalytics(browser);
      analytics.start();
      analytics.track("export_csv", {
        mode: "basic",
        outcome: "success",
        comment_mode: mode,
        has_species_comments: "yes",
        template: "private",
        comment: "private",
      });
      expect(commands(browser).at(-1)[2]).toMatchObject({
        comment_mode: mode,
        has_species_comments: "yes",
      });
      expect(JSON.stringify(commands(browser))).not.toContain("private");
      const count = commands(browser).length;
      analytics.track("export_csv", { comment_mode: "private template" });
      analytics.track("export_csv", { has_species_comments: "private comment" });
      expect(commands(browser)).toHaveLength(count);
    },
  );

  it("adds only known workflow context and rejects private failure details", () => {
    const browser = browserWith(savedChoice("accepted"));
    const analytics = createAnalytics(browser);
    analytics.setContext({
      mode: "basic",
      language: "fr",
      source_website: "ornitho.ch",
      visitor_type: "returning",
      filename: "private.json",
    });
    analytics.start();
    analytics.track("import_file", {
      outcome: "failure",
      failure_reason: "invalid_json",
      error: "private file contents",
    });
    expect(commands(browser).at(-1)[2]).toMatchObject({
      mode: "basic",
      language: "fr",
      visitor_type: "returning",
      source_website: "ornitho.ch",
      failure_reason: "invalid_json",
    });
    expect(JSON.stringify(commands(browser))).not.toContain("private");
    const count = commands(browser).length;
    analytics.track("import_file", { failure_reason: "private file contents" });
    analytics.track("workflow_link", { destination: "https://private.test" });
    analytics.track("panel_view", { panel: "private checklist title" });
    expect(commands(browser)).toHaveLength(count);
    analytics.setContext({ mode: "private", language: "fr" });
    analytics.track("help_topic", { section: "species-matching" });
    expect(commands(browser).at(-1)[2]).not.toHaveProperty("mode");
  });

  it("withdraws without reloading and permits later acceptance without another tag", () => {
    const browser = browserWith(savedChoice("accepted"));
    const analytics = createAnalytics(browser);
    analytics.start();
    analytics.choose("rejected");
    expect(browser[`ga-disable-${MEASUREMENT_ID}`]).toBe(true);
    expect(commands(browser).at(-1)[2].analytics_storage).toBe("denied");
    const count = commands(browser).length;
    analytics.track("export_csv", { mode: "basic", outcome: "success" });
    expect(commands(browser)).toHaveLength(count);
    expect(browser.location.reload).not.toHaveBeenCalled();
    expect(browser.document.cookie).not.toContain("legacy");
    analytics.choose("accepted");
    analytics.track("export_csv", { mode: "customized", outcome: "success" });
    expect(browser[`ga-disable-${MEASUREMENT_ID}`]).toBe(false);
    expect(commands(browser).at(-1)[1]).toBe("export_csv");
    expect(browser.document.head.append).toHaveBeenCalledTimes(1);
  });

  it("works for the current visit when storage is unavailable", () => {
    const browser = browserWith();
    browser.localStorage.getItem.mockImplementation(() => {
      throw new Error("blocked");
    });
    browser.localStorage.setItem.mockImplementation(() => {
      throw new Error("blocked");
    });
    const analytics = createAnalytics(browser);
    expect(() => analytics.choose("accepted")).not.toThrow();
    expect(analytics.state.choice).toBe("accepted");
    expect(() => analytics.choose("rejected")).not.toThrow();
    expect(analytics.state.choice).toBe("rejected");
  });
});

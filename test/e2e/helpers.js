import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect } from "@playwright/test";

const readRepoFile = (path) =>
  readFileSync(fileURLToPath(new URL(`../../${path}`, import.meta.url)), "utf8");

export const fixturePath = (name) => fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url));

export const readGolden = (fixture) =>
  readRepoFile(`test/golden/__snapshots__/${fixture.replace(/\.\w+$/, "")}.csv`);

// Same source as the golden tests' stand-in for the eBird API (test/helpers.js), so the stubbed
// taxonomy gives the same scientific names as the golden files.
const sciNameByCode = new Map(
  Object.entries(JSON.parse(readRepoFile("data/ebird_scientific_names.json")).names).map(
    ([name, code]) => [code, name],
  ),
);

// 1x1 transparent PNG, for map tiles.
const EMPTY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);

const json = (body) => ({
  status: 200,
  contentType: "application/json",
  body: JSON.stringify(body),
});

// Answers every request that leaves the preview server, so the tests never reach the internet.
// With `ebirdTaxonomy: false` the eBird taxonomy API fails and the app falls back to its bundled
// names. Returns the list of external URLs requested, for assertions.
export async function stubNetwork(page, { ebirdTaxonomy = true } = {}) {
  const requested = [];
  await page.route(
    (url) => !["localhost", "127.0.0.1"].includes(url.hostname),
    (route) => {
      const url = new URL(route.request().url());
      requested.push(url.href);

      if (url.hostname === "api.ebird.org" && url.pathname.startsWith("/v2/ref/taxonomy/")) {
        if (!ebirdTaxonomy) {
          return route.fulfill({ status: 503, body: "" });
        }
        const codes = (url.searchParams.get("species") || "").split(",").filter(Boolean);
        return route.fulfill(
          json(
            codes
              .filter((code) => sciNameByCode.has(code))
              .map((code) => ({
                speciesCode: code,
                sciName: sciNameByCode.get(code),
                comName: "",
                category: "species",
              })),
          ),
        );
      }
      if (url.hostname === "api.ebird.org" && url.pathname.startsWith("/v2/ref/hotspot/")) {
        return route.fulfill(json([]));
      }
      if (url.hostname === "nominatim.openstreetmap.org") {
        // An empty answer: the import's "is this the right website?" hint stays silent.
        return route.fulfill(json({}));
      }
      if (route.request().resourceType() === "image") {
        return route.fulfill({ status: 200, contentType: "image/png", body: EMPTY_PNG });
      }
      // Google Analytics, Mapbox and anything else.
      return route.abort();
    },
  );
  return requested;
}

export async function openApp(page, { chooseConsent = true } = {}) {
  await page.goto("/?lang=en");
  if (chooseConsent) await page.getByRole("button", { name: "No thanks" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Import" })).toBeVisible();
}

export async function importFixture(page, websiteName, fixture) {
  await page.locator("#import-source-website").selectOption(websiteName);
  await page.locator('input[type="file"]').setInputFiles(fixturePath(fixture));
  await expect(page.locator(".alert-success")).toContainText("Data loaded successfully");
}

// Clicks "Download CSV" and returns the exact file text uploaded to eBird.
export async function downloadCsv(page) {
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download CSV" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^ornitho2ebird_\d{8}_\d{6}\.csv$/);
  const text = readFileSync(await download.path(), "utf8");
  expect(text.startsWith("\ufeff")).toBe(false);
  return text;
}

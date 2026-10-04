import { expect, test } from "@playwright/test";
import Papa from "papaparse";
import { downloadCsv, importFixture, openApp, readGolden, stubNetwork } from "./helpers";

const FIXTURE = "export_small_incidental.json";
// Columns of the eBird Record Format (src/lib/exportCsv.js EXPORT_COLUMNS).
const LOCATION = 5;
const NUMBER_OBSERVER = 13;

test("choosing a hotspot exports its ID and exact coordinates", async ({ page }) => {
  const hotspot = {
    locId: "L5860421",
    locName: "Rochers de Clé",
    lat: 46.4159672,
    lng: 7.2082329,
  };
  await stubNetwork(page);
  await page.route("https://api.ebird.org/v2/ref/hotspot/**", (route) =>
    route.fulfill({ json: [hotspot] }),
  );
  await openApp(page);
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("button", { name: /^Customized mode/ }).click();
  await page.getByRole("button", { name: "Close" }).click();
  await importFixture(page, "ornitho.ch", FIXTURE);

  await page.locator(".hotspot-marker-icon").click();
  await page
    .locator(".maplibregl-popup")
    .getByRole("button", { name: "Use as checklist location" })
    .click();
  const details = page.locator("section", {
    has: page.getByRole("heading", { level: 2, name: "Checklist details" }),
  });
  await expect(field(details, "Location name")).toHaveValue(hotspot.locName);
  const golden = parseCsv(readGolden(FIXTURE));
  const expected = golden.map((row) =>
    row[LOCATION] === golden[0][LOCATION]
      ? row.with(LOCATION, hotspot.locId).with(6, String(hotspot.lat)).with(7, String(hotspot.lng))
      : row,
  );
  expect(parseCsv(await downloadCsv(page))).toEqual(expected);

  // Renaming the location must not silently export the previously selected hotspot.
  await field(details, "Location name").fill("My personal location");
  expect(parseCsv(await downloadCsv(page))).toEqual(
    expected.map((row) =>
      row[LOCATION] === hotspot.locId ? row.with(LOCATION, "My personal location") : row,
    ),
  );
});

const parseCsv = (text) => Papa.parse(text).data;

// The checklist editor's labels are not tied to their inputs: take the input of the innermost
// element that holds the label.
const field = (section, label) =>
  section
    .locator("div")
    .filter({ has: section.page().locator("label", { hasText: new RegExp(`^${label}$`) }) })
    .last()
    .locator("input");

// Customized mode: casual observations are assigned to checklists the user can edit before the
// export. The eBird taxonomy API fails here, so this also covers the bundled-names fallback.
test("checklist edits in Customized mode reach the CSV", async ({ page }) => {
  await stubNetwork(page, { ebirdTaxonomy: false });
  await openApp(page, { chooseConsent: false });
  await page.getByRole("button", { name: "Allow usage statistics" }).click();

  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("button", { name: /^Customized mode/ }).click();
  await page.getByRole("button", { name: "Close" }).click();

  await importFixture(page, "ornitho.ch", FIXTURE);
  await expect(page.getByRole("heading", { level: 2, name: "Checklist assignment" })).toBeVisible();
  const details = page.locator("section", {
    has: page.getByRole("heading", { level: 2, name: "Checklist details" }),
  });
  await expect(details).toBeVisible();

  // Before any edit the export is the same as in simple mode.
  expect(await downloadCsv(page)).toBe(readGolden(FIXTURE));
  const golden = parseCsv(readGolden(FIXTURE));

  // Edit the first checklist, then leave the second one out of the export.
  const locationInput = field(details, "Location name");
  const firstLocation = await locationInput.inputValue();
  await locationInput.fill("E2E test location");
  await field(details, "Observers").fill("3");

  await details.getByRole("button", { name: "›" }).click();
  await expect(locationInput).not.toHaveValue("E2E test location");
  const secondLocation = await locationInput.inputValue();
  expect(secondLocation).not.toBe(firstLocation);
  await details.getByLabel("Export checklist").uncheck();

  const expected = golden
    .filter((row) => row[LOCATION] !== secondLocation)
    .map((row) =>
      row[LOCATION] === firstLocation
        ? row.with(LOCATION, "E2E test location").with(NUMBER_OBSERVER, "3")
        : row,
    );
  expect(expected.length).toBeLessThan(golden.length);
  expect(parseCsv(await downloadCsv(page))).toEqual(expected);
  const events = await page.evaluate(() =>
    window.dataLayer.filter((entry) => entry[0] === "event").map((entry) => [entry[1], entry[2]]),
  );
  expect(events).toContainEqual(["mode_change", expect.objectContaining({ mode: "customized" })]);
  expect(events).toContainEqual(["checklist_action", expect.objectContaining({ action: "edit" })]);
  expect(events).toContainEqual([
    "export_csv",
    expect.objectContaining({ mode: "customized", outcome: "success" }),
  ]);

  // Withdrawing consent must also preserve manual edits and export selections.
  await page.getByRole("button", { name: "Privacy & cookies", exact: true }).click();
  await page.getByRole("button", { name: "No thanks" }).click();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  expect(parseCsv(await downloadCsv(page))).toEqual(expected);
});

for (const [customized, fixture] of [
  [false, FIXTURE],
  [true, FIXTURE],
  [false, "export_normal_with_trace.json"],
]) {
  test(`hotspots are selected automatically in ${customized ? "Customized" : "Basic"} mode (${fixture})`, async ({
    page,
  }) => {
    const golden = parseCsv(readGolden(fixture));
    const hotspot = {
      locId: "L123456",
      locName: "Matched site",
      lat: Number(golden[0][6]) + 0.00000001,
      lng: Number(golden[0][7]) + 0.00000002,
    };
    await stubNetwork(page);
    await page.route("https://api.ebird.org/v2/ref/hotspot/**", (route) =>
      route.fulfill({ json: [hotspot] }),
    );
    await openApp(page);
    if (customized) {
      await page.getByRole("button", { name: "Settings" }).click();
      await page.getByRole("button", { name: /^Customized mode/ }).click();
      await page.getByRole("button", { name: "Close" }).click();
    }
    await importFixture(page, "ornitho.ch", fixture);
    const expected = golden.map((row) =>
      row[LOCATION] === golden[0][LOCATION]
        ? row
            .with(LOCATION, hotspot.locId)
            .with(6, String(hotspot.lat))
            .with(7, String(hotspot.lng))
        : row,
    );
    expect(parseCsv(await downloadCsv(page))).toEqual(expected);
    await expect(page.getByRole("heading", { name: /Hotspot suggestions/ })).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Download comparison for all checklists" }),
    ).toHaveCount(0);
  });
}

test("uncertain hotspot matches and failed lookups preserve the CSV", async ({ page }) => {
  const golden = parseCsv(readGolden(FIXTURE));
  const hotspot = {
    locId: "L1",
    locName: "Overlapping site",
    lat: Number(golden[0][6]),
    lng: Number(golden[0][7]),
  };
  await stubNetwork(page);
  await page.route("https://api.ebird.org/v2/ref/hotspot/**", (route) =>
    route.fulfill({ json: [hotspot, { ...hotspot, locId: "L2" }] }),
  );
  await openApp(page);
  await importFixture(page, "ornitho.ch", FIXTURE);
  expect(await downloadCsv(page)).toBe(readGolden(FIXTURE));
  await page.route("https://api.ebird.org/v2/ref/hotspot/**", (route) =>
    route.fulfill({ status: 503, body: "" }),
  );
  await page.reload();
  await importFixture(page, "ornitho.ch", FIXTURE);
  expect(await downloadCsv(page)).toBe(readGolden(FIXTURE));
});

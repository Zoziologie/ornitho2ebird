import { expect, test } from "@playwright/test";
import Papa from "papaparse";
import { downloadCsv, importFixture, openApp, readGolden, stubNetwork } from "./helpers";

const FIXTURE = "export_small_incidental.json";
// Columns of the eBird Record Format (src/lib/exportCsv.js EXPORT_COLUMNS).
const LOCATION = 5;
const NUMBER_OBSERVER = 13;

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
  await openApp(page);

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
});

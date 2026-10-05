import { expect, test } from "@playwright/test";
import Papa from "papaparse";
import {
  downloadCsv,
  fixturePath,
  importFixture,
  openApp,
  readGolden,
  stubNetwork,
} from "./helpers";

const transect = ["sessions/transect.csv", "sessions/transect.kml"];
const stationary = ["sessions/stationary.csv", "sessions/stationary.kml"];

test("multiple CSV + KML pairs preserve effort and counts in the downloaded CSV", async ({
  page,
}) => {
  await stubNetwork(page);
  await openApp(page);
  await importFixture(page, "observation.org", [...stationary, ...transect].reverse());
  expect(await downloadCsv(page)).toBe(readGolden("sessions/multiple.csv"));
});

test("a mismatched session pair preserves the previous import", async ({ page }) => {
  await stubNetwork(page);
  await openApp(page);
  await importFixture(page, "observation.org", transect);
  await page
    .locator('input[type="file"]')
    .setInputFiles([transect[0], stationary[1]].map(fixturePath));
  await expect(page.locator(".alert-danger")).toContainText("same observation IDs");
  expect(await downloadCsv(page)).toBe(readGolden("sessions/transect.csv"));
});

test("session completeness and observer edits use the existing checklist editor", async ({
  page,
}) => {
  await stubNetwork(page);
  await openApp(page);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: /^Customized mode/ }).click();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await importFixture(page, "observation.org", stationary);
  await expect(page.locator("#complete-checklist")).not.toBeChecked();
  await page.locator("#complete-checklist").check();
  const details = page.locator("section", {
    has: page.getByRole("heading", { level: 2, name: "Checklist details" }),
  });
  await details
    .locator("div")
    .filter({
      has: page.locator("label", { hasText: /^Observers$/ }),
    })
    .last()
    .locator("input")
    .fill("3");
  const expected = Papa.parse(readGolden("sessions/stationary.csv")).data.map((row) =>
    row.with(13, "3").with(15, "Y"),
  );
  expect(Papa.parse(await downloadCsv(page)).data).toEqual(expected);
});

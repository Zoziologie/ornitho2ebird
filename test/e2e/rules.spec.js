import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import Papa from "papaparse";
import { downloadCsv, fixturePath, importFixture, openApp, stubNetwork } from "./helpers";

test("dead-bird exclusion and untimed overnight effort require confirmation", async ({ page }) => {
  await stubNetwork(page);
  await openApp(page);
  await importFixture(page, "ornitho.ch", "rules/ornitho_mortality_overnight.json");
  await expect(page.getByRole("button", { name: "Split by date" })).toHaveCount(0);
  await page.getByRole("button", { name: "Download CSV" }).click();
  const warning = page.getByRole("alertdialog");
  await expect(warning).toContainText("crosses midnight");
  await expect(warning).toContainText("1 dead-bird or zero-count records");
  await warning.getByRole("button", { name: "Cancel", exact: true }).click();
  const rows = Papa.parse(await downloadCsv(page)).data;
  expect(rows.some((row) => row[1] === "Poecile")).toBe(false);
  expect(rows.find((row) => row[8] === "10/04/2026")).toEqual(
    expect.arrayContaining(["Cygnus", "olor", "1"]),
  );
  expect(rows.every((row) => Number(row[3]) > 0)).toBe(true);
});

test("timestamped overnight lists can be split before CSV download", async ({ page }) => {
  await stubNetwork(page);
  await openApp(page);
  const source = JSON.parse(
    readFileSync(fixturePath("rules/ornitho_mortality_overnight.json"), "utf8"),
  );
  source.data.sightings = [];
  source.data.forms[0].sightings.forEach((record, index) => {
    record.observers[0].timing = {
      "@notime": "0",
      "@ISO8601": ["2026-10-02T23:30:00+02:00", "2026-10-03T00:10:00+02:00"][index],
    };
  });
  await page.locator("#import-source-website").selectOption("ornitho.ch");
  await page.locator('input[type="file"]').setInputFiles({
    name: "timestamped_overnight.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(source)),
  });
  await expect(page.locator(".alert-success")).toContainText("Data loaded successfully");
  await page.getByRole("button", { name: "Split by date" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "OK", exact: true }).click();
  await expect(page.getByRole("button", { name: "Split by date" })).toHaveCount(0);
  const rows = Papa.parse(await downloadCsv(page)).data;
  expect(rows.map((row) => [row[8], row[12], row[14], row[16]])).toEqual([
    ["10/02/2026", "Historical", "", ""],
    ["10/03/2026", "Historical", "", ""],
  ]);
});

test("French Biolovision TXT dates and species reach the CSV", async ({ page }) => {
  await stubNetwork(page);
  await openApp(page);
  await importFixture(page, "data.biolovision.net", "rules/biolovision_french.txt");
  const rows = Papa.parse(await downloadCsv(page)).data;
  expect(rows.find((row) => row[1] === "Alcedo")).toMatchObject({
    2: "atthis",
    8: "09/30/2018",
    9: "18:16",
    12: "Incidental",
    15: "N",
  });
  expect(new Set(rows.map((row) => row[8]))).toEqual(new Set(["09/06/2018", "09/30/2018"]));
});

test("completeness edits update primary purpose and the exported protocol", async ({ page }) => {
  await stubNetwork(page);
  await openApp(page);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: /^Customized mode/ }).click();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await importFixture(page, "ornitho.ch", "export_small_incidental.json");
  await page.locator("#complete-checklist").check();
  await expect(page.locator("#primary-purpose")).toBeChecked();
  let rows = Papa.parse(await downloadCsv(page)).data;
  expect(rows.some((row) => row[12] === "Historical" && row[15] === "Y")).toBe(true);
  await page.locator("#primary-purpose").uncheck();
  await expect(page.locator("#complete-checklist")).not.toBeChecked();
  rows = Papa.parse(await downloadCsv(page)).data;
  expect(rows.every((row) => row[12] === "Incidental" && row[15] === "N")).toBe(true);
});

test("isolated GPS errors do not change a stationary checklist's exported protocol", async ({
  page,
}) => {
  await stubNetwork(page);
  await openApp(page);
  const source = JSON.parse(readFileSync(fixturePath("export_normal_with_trace.json"), "utf8"));
  source.data.sightings = [];
  source.data.forms = [source.data.forms[0]];
  const form = source.data.forms[0];
  const lat = Number(form.lat);
  const lon = Number(form.lon);
  const path = Array.from({ length: 40 }, (_, index) => [lat + (index % 3) * 0.00004, lon]);
  path[0] = [lat + 0.01, lon];
  form.trace = `LINESTRING(${path.map(([pointLat, pointLon]) => `${pointLon} ${pointLat}`).join(", ")})`;
  await page.locator("#import-source-website").selectOption("ornitho.ch");
  await page.locator('input[type="file"]').setInputFiles({
    name: "stationary_with_bad_fix.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(source)),
  });
  await expect(page.locator(".alert-success")).toContainText("Data loaded successfully");
  const rows = Papa.parse(await downloadCsv(page)).data;
  expect(rows.length).toBeGreaterThan(0);
  expect(rows.every((row) => row[12] === "Stationary" && row[16] === "")).toBe(true);
});

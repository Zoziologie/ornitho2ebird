import { readFileSync } from "node:fs";
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

test("French question flags and committee notes survive conversion of casual and list records", async ({
  page,
}) => {
  await stubNetwork(page);
  await openApp(page);
  await importFixture(page, "faune-france.org", "rules/ornitho_flags_fr.json");
  const discussion = page
    .locator(".alert-warning")
    .filter({ hasText: "under verification on faune-france.org" });
  for (const id of ["51584243", "62836635", "70938324", "59112386"]) {
    await expect(
      discussion.locator(`a[href='https://www.faune-france.org/index.php?m_id=54&id=${id}']`),
    ).toHaveCount(1);
  }
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.locator("#customized-species-comments").uncheck();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.getByRole("button", { name: "Download CSV" })).toBeDisabled();
  await page.locator("#confirm-source-review").check();
  const csv = await downloadCsv(page);
  const rows = Papa.parse(csv).data;
  expect(rows).toHaveLength(5);
  expect(rows.some((r) => r[1] === "Falco" && r[2] === "subbuteo")).toBe(true);
  expect(rows.some((r) => r[1] === "Glaucidium" && r[2] === "passerinum")).toBe(true);
  expect(csv).not.toContain("44105705");
  expect(rows.find((r) => r[4].includes("59112386"))[4]).toContain(
    "CHR: documentation required by the rarities committee",
  );
  expect(
    rows.filter((r) => r[4].includes("CHN: documentation required by the rarities committee")),
  ).toHaveLength(2);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: /^Customized mode/ }).click();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.locator("#confirm-source-review").check();
  await page.locator("#export-ready").uncheck();
  await expect(page.locator("#confirm-source-review")).not.toBeChecked();
  await expect(page.getByRole("button", { name: "Download CSV" })).toBeDisabled();
  await importFixture(page, "faune-france.org", "rules/ornitho_flags_fr.json");
  await expect(page.locator("#confirm-source-review")).not.toBeChecked();
  await expect(page.getByRole("button", { name: "Download CSV" })).toBeDisabled();
});

test("source flags retain protected records, exclude refused records, and always export committee notes", async ({
  page,
}) => {
  await stubNetwork(page);
  await openApp(page);
  await importFixture(page, "ornitho.ch", "rules/ornitho_flags.json");
  const refusedWarning = page
    .locator(".alert-warning")
    .filter({ hasText: "marked as rejected on ornitho.ch" });
  await expect(refusedWarning.locator("a[href*='15800381']")).toHaveCount(1);
  await expect(refusedWarning.locator("a[href*='3916932']")).toHaveCount(1);
  await expect(
    page
      .locator(".alert-warning")
      .filter({ hasText: "marked as incomplete on ornitho.ch" })
      .locator("a[href*='38325498']"),
  ).toHaveCount(1);
  await expect(
    page
      .locator(".alert-warning")
      .filter({ hasText: "hidden on ornitho.ch" })
      .getByRole("link", { name: "Sensitive Species list" }),
  ).toHaveAttribute("href", "https://support.ebird.org/en/support/solutions/articles/48000803210");
  await expect(
    page.getByRole("link", { name: "hiding the entire checklist", exact: true }),
  ).toHaveAttribute(
    "href",
    "https://support.ebird.org/en/support/solutions/articles/48000948757-ebird-faqs#anchorHiddenChecklist",
  );
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.locator("#customized-species-comments").uncheck();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.getByRole("button", { name: "Download CSV" })).toBeDisabled();
  await page.locator("#confirm-source-review").check();
  const csv = await downloadCsv(page);
  const rows = Papa.parse(csv).data;
  expect(rows.some((r) => r[1] === "Tetrao" && r[2] === "urogallus")).toBe(true);
  expect(rows.some((r) => r[1] === "Poecile" && r[2] === "palustris")).toBe(true);
  expect(rows.some((r) => r[1] === "Periparus" && r[2] === "ater")).toBe(true);
  expect(rows.find((r) => r[4].includes("900000001"))[3]).toBe("3");
  expect(csv).not.toContain("15800381");
  expect(csv).not.toContain("3916932");
  expect(csv).not.toContain("900000002");
  expect(csv).toContain("CAvS: accepted by the Swiss rarities committee");
  expect(csv).toContain("CAvS: rejected by the Swiss rarities committee");
  expect(csv).toContain("CAvS: documentation required by the Swiss rarities committee");
  await importFixture(page, "ornitho.ch", "rules/ornitho_flags_updated.json");
  await expect(page.locator("#confirm-source-review")).not.toBeChecked();
  await expect(page.getByRole("button", { name: "Download CSV" })).toBeDisabled();
  await expect(refusedWarning.locator("a")).toHaveCount(1);
  await expect(refusedWarning.locator("a[href*='38325489']")).toHaveText("Cinciallegra");
  const incomplete = page
    .locator(".alert-warning")
    .filter({ hasText: "marked as incomplete on ornitho.ch" });
  await expect(incomplete.locator("a")).toHaveCount(3);
  await expect(incomplete.locator("a[href*='38325488']")).toHaveCount(1);
  const verification = page
    .locator(".alert-warning")
    .filter({ hasText: "under verification on ornitho.ch" });
  await expect(verification.locator("a")).toHaveCount(2);
  await expect(verification.locator("a[href*='38325490']")).toHaveCount(1);
  await expect(verification.locator("a[href*='38325502']")).toHaveCount(1);
  const hidden = page.locator(".alert-warning").filter({ hasText: "hidden on ornitho.ch" });
  await expect(hidden.locator("a[href*='38325489']")).toHaveCount(0);
  for (const id of ["38325491", "38325494", "38325603"]) {
    await expect(hidden.locator(`a[href*='${id}']`)).toHaveCount(1);
  }
  await page.locator("#confirm-source-review").check();
  const updatedRows = Papa.parse(await downloadCsv(page)).data;
  expect(updatedRows).toHaveLength(8);
  expect(updatedRows.some((r) => r[1] === "Parus" && r[2] === "major")).toBe(false);
  // Golden CSV uses default comments; the earlier download in this test disabled them.
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.locator("#customized-species-comments").check();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  expect(await downloadCsv(page)).toBe(readGolden("rules/ornitho_flags_updated.json"));
  const source = JSON.parse(readFileSync(fixturePath("rules/ornitho_flags.json"), "utf8"));
  [...source.data.sightings, ...source.data.forms[0].sightings].forEach(
    (s) => (s.observers[0].admin_hidden_type = "refused"),
  );
  await page.locator('input[type="file"]').setInputFiles({
    name: "all_refused.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(source)),
  });
  await expect(refusedWarning.locator("a")).toHaveCount(14);
  await expect(page.locator("#confirm-source-review")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Download CSV" })).toBeDisabled();
});

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

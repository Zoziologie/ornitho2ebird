import { expect, test } from "@playwright/test";
import { downloadCsv, importFixture, openApp, readGolden, stubNetwork } from "./helpers";

// Import → Download CSV in the default (simple) mode, compared byte for byte with the golden file
// of test/golden/export.test.js, which runs the same pipeline with the same default settings.
// One fixture per import path: ornitho JSON (eBird codes from the ornitho species list), and the
// two CSV sources whose species are matched by scientific name.
const FIXTURES = [
  ["export_mixed_large.json", "ornitho.ch"],
  ["observation_org.csv", "observation.org"],
  ["observation_bulk_fr.csv", "observation.org"],
  ["birdlasser_trip_kenya_2022.csv", "birdlasser"],
];

for (const [fixture, websiteName] of FIXTURES) {
  test(`${fixture} downloads its golden CSV`, async ({ page }) => {
    const requested = await stubNetwork(page);
    await openApp(page);
    await importFixture(page, websiteName, fixture);

    await expect(page.getByRole("heading", { level: 2, name: "Export" })).toBeVisible();
    // Simple mode: no assignment or checklist editor.
    await expect(page.getByRole("heading", { name: "Checklist details" })).toHaveCount(0);

    expect(await downloadCsv(page)).toBe(readGolden(fixture));
    // The scientific names came from the (stubbed) eBird API, not the bundled fallback.
    expect(requested.some((url) => url.includes("api.ebird.org/v2/ref/taxonomy/"))).toBe(true);
  });
}

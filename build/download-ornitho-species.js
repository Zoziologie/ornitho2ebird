// Export the bird list visible on an ornitho site's "Check my lists" page.
import { readFileSync, writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";
import Papa from "papaparse";

const output = process.argv[2] || "ornitho-species-france.csv";
const websiteName = process.argv[3] || "faune-france.org";
const htmlFile = process.argv[4];
const websites = JSON.parse(readFileSync(new URL("../data/websites_list.json", import.meta.url)));
const website = websites.find((site) => site.name === websiteName && site.system === "ornitho");
if (!website) throw new Error(`Unknown ornitho website: ${websiteName}`);
const browser = await chromium.launch({ headless: Boolean(htmlFile) });
const page = await browser.newPage({ javaScriptEnabled: !htmlFile });

try {
  if (htmlFile) {
    await page.route("**/*", (route) => route.abort());
    await page.setContent(readFileSync(htmlFile, "utf8"), { waitUntil: "domcontentloaded" });
  } else {
    await page.goto(new URL("index.php?m_id=11&langu=en", website.website).href);
    console.log(`Log in to ${websiteName} in the opened browser, if needed.`);
  }
  await page
    .locator("#table-checklist .tablerow .species_name")
    .first()
    .waitFor({ timeout: 600000 });

  const groups = await page
    .locator('#table-checklist > .tablerow a[href*="frmSpecies="]')
    .evaluateAll((links) => [
      ...new Set(links.map((link) => new URL(link.href).searchParams.get("sp_tg"))),
    ]);
  if (groups.length !== 1 || groups[0] !== "1") {
    throw new Error(
      "The page does not show the bird list. Select birds and run the download again.",
    );
  }

  const species = await page.locator("#table-checklist > .tablerow").evaluateAll((rows) =>
    rows.map((row) => ({
      id: new URL(row.querySelector('a[href*="frmSpecies="]').href).searchParams.get("frmSpecies"),
      common_name: row.querySelector(".species_name b").textContent.trim(),
      scientific_name: (row.querySelector(".sci_name")?.textContent || "")
        .trim()
        .replace(/^\(|\)$/g, ""),
    })),
  );
  writeFileSync(output, `${Papa.unparse(species, { newline: "\n" })}\n`);
  console.log(`Saved ${species.length} taxa to ${output}.`);
} finally {
  await browser.close();
}

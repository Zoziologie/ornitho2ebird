import { expect, test } from "@playwright/test";
import { downloadCsv, importFixture, openApp, readGolden, stubNetwork } from "./helpers";

const FIXTURE = "export_small_incidental.json";
const googleRequests = (requests) =>
  requests.filter((url) => /google-analytics|googletagmanager|doubleclick/.test(url));

// Consent changes must not lose an import or affect the CSV people upload.
test("acceptance tracks conversion; withdrawal preserves the import and CSV", async ({ page }) => {
  const requests = await stubNetwork(page);
  await openApp(page);
  expect(googleRequests(requests)).toEqual([]);
  await page.getByRole("button", { name: "Accept analytics" }).click();
  await expect.poll(() => googleRequests(requests).length).toBe(1);
  await importFixture(page, "ornitho.ch", FIXTURE);
  expect(await downloadCsv(page)).toBe(readGolden(FIXTURE));
  const events = await page.evaluate(() =>
    window.dataLayer.filter((entry) => entry[0] === "event").map((entry) => [entry[1], entry[2]]),
  );
  expect(events).toContainEqual([
    "import_file",
    expect.objectContaining({ source_website: "ornitho.ch", outcome: "success" }),
  ]);
  expect(events).toContainEqual([
    "export_csv",
    expect.objectContaining({ mode: "basic", outcome: "success" }),
  ]);
  await page.getByRole("button", { name: "Privacy & cookies", exact: true }).click();
  await page.getByRole("button", { name: "Reject analytics" }).click();
  await expect.poll(() => page.evaluate(() => window["ga-disable-G-TJ2TZSXSBW"])).toBe(true);
  await page.getByRole("button", { name: "Close", exact: true }).click();
  const count = await page.evaluate(() => window.dataLayer.length);
  expect(await downloadCsv(page)).toBe(readGolden(FIXTURE));
  expect(await page.evaluate(() => window.dataLayer.length)).toBe(count);
  await page.reload();
  await expect(page.getByRole("heading", { level: 2, name: "Import" })).toBeVisible();
  expect(await page.evaluate(() => typeof window.gtag)).toBe("undefined");
  expect(googleRequests(requests)).toHaveLength(1);
});

test("mobile rejection allows conversion without Google requests", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const requests = await stubNetwork(page);
  await openApp(page);
  await page.getByRole("button", { name: "Reject analytics" }).click();
  await importFixture(page, "ornitho.ch", FIXTURE);
  expect(await downloadCsv(page)).toBe(readGolden(FIXTURE));
  expect(googleRequests(requests)).toEqual([]);
  expect(await page.evaluate(() => typeof window.gtag)).toBe("undefined");
  await page.reload();
  await expect(page.getByRole("button", { name: "Privacy & cookies", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Accept analytics" })).toHaveCount(0);
  expect(googleRequests(requests)).toEqual([]);
});

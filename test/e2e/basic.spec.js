import { expect, test } from "@playwright/test";
import { importFixture, openApp, stubNetwork } from "./helpers";

// Basic mode groups casual observations on its own: the export page says what it did, and the
// grouping limits it links to apply to the current import.
test("Basic mode shows and regroups its checklists", async ({ page }) => {
  await stubNetwork(page);
  await openApp(page);
  await expect(page.getByRole("heading", { level: 2, name: "How to use the app?" })).toBeVisible();

  await importFixture(page, "ornitho.ch", "export_mixed_large.json");
  await expect(page.getByRole("heading", { level: 2, name: "How to use the app?" })).toBeHidden();
  const summary = page.locator(".alert", { hasText: "Checklists made from casual observations" });
  await expect(summary).toContainText(": 39 (from 326 observations)");
  await expect(summary).toContainText("less than 24 h and 3 km apart");
  await expect(summary).toContainText("4 checklists have no start time");

  await summary.getByRole("button", { name: "Change the grouping" }).click();
  await page.locator("#duration-input").fill("2");
  await page.locator("#distance-input").fill("0.5");
  await page.getByRole("button", { name: "Close" }).click();
  await expect(summary).toContainText(": 61 (from 326 observations)");
  await expect(summary).toContainText("less than 2 h and 0.5 km apart");
});

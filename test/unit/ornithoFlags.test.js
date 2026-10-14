import { describe, expect, it } from "vitest";
import { buildExportRows, exportableFormsOf, groupSightingsByForm } from "../../src/lib/exportCsv";
import { exportFixture, parseFixture } from "../helpers";

describe("Ornitho protection and validation", () => {
  it("preserves protection and review status without confusing them", async () => {
    const parsed = await parseFixture("rules/ornitho_flags.json", "ornitho.ch");
    expect(parsed.sightings.find((s) => s.id === "38325491")).toMatchObject({
      hidden: true,
      admin_hidden_type: "",
    });
    expect(parsed.sightings.find((s) => s.id === "38325498")).toMatchObject({
      hidden: false,
      admin_hidden_type: "incomplete",
    });
    expect(parsed.sightings.find((s) => s.id === "15800381")).toMatchObject({
      hidden: true,
      admin_hidden_type: "refused",
      committees_validation: { cavs: "REQUESTED" },
    });
    expect(parsed.sightings.find((s) => s.id === "3916932")).toMatchObject({
      hidden: false,
      admin_hidden_type: "refused",
    });
  });

  it("keeps protected and incomplete records, excluding refused counts before merging", async () => {
    const { rows } = await exportFixture("rules/ornitho_flags.json", "ornitho.ch");
    expect(rows.some((r) => r.Genus === "Poecile" && r.Species === "palustris")).toBe(true);
    expect(rows.some((r) => r.Genus === "Tetrao" && r.Species === "urogallus")).toBe(true);
    expect(rows.some((r) => r.Genus === "Periparus" && r.Species === "ater")).toBe(true);
    expect(rows.some((r) => r.species_comment.includes("15800381"))).toBe(false);
    expect(rows.some((r) => r.species_comment.includes("3916932"))).toBe(false);
    expect(rows.find((r) => r.species_comment.includes("900000001")).count).toBe(3);
    expect(rows.some((r) => r.species_comment.includes("900000002"))).toBe(false);
  });

  it("always exports each committee status with source attribution, including with no optional comments", async () => {
    const { parsed, forms } = await exportFixture("rules/ornitho_flags.json", "ornitho.ch");
    const exportableForms = exportableFormsOf(forms);
    const input = {
      exportableForms,
      sightingsByFormId: groupSightingsByForm(
        exportableForms,
        parsed.sightings,
        parsed.formsSightings,
      ),
      importedWithText: "Imported with",
    };
    for (const speciesCommentTemplate of [null, { short: "", long: "", limit: 1 }]) {
      const { rows, errors } = buildExportRows({ ...input, speciesCommentTemplate });
      expect(errors).toEqual([]);
      expect(rows.find((r) => r.species_comment.includes("900000001")).species_comment).toContain(
        "CAvS: accepted by the Swiss rarities committee",
      );
      expect(rows.find((r) => r.species_comment.includes("900000003")).species_comment).toContain(
        "CAvS: rejected by the Swiss rarities committee",
      );
      expect(rows.find((r) => r.species_comment.includes("900000004")).species_comment).toContain(
        "CAvS: documentation required by the Swiss rarities committee",
      );
      expect(rows.find((r) => r.species_comment.includes("900000001")).species_comment).toContain(
        "ornitho.ch, 2026-10-14",
      );
    }
    [...input.sightingsByFormId.values()].flat().forEach((s) => (s.admin_hidden_type = "refused"));
    const { rows } = buildExportRows(input);
    expect(rows).toEqual([]);
  });
});

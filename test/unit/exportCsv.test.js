import { describe, expect, it } from "vitest";
import { EXPORT_COLUMNS, escapeCsvValue, rowsToCsv } from "../../src/lib/exportCsv";
import { exportFixture } from "../helpers";

describe("escapeCsvValue", () => {
  it("quotes values containing commas or quotes and doubles quotes", () => {
    expect(escapeCsvValue("a,b")).toBe('"a,b"');
    expect(escapeCsvValue('say "hi"')).toBe('"say ""hi"""');
    expect(escapeCsvValue("plain")).toBe("plain");
  });

  it("flattens line breaks, which eBird's importer does not accept inside cells", () => {
    expect(escapeCsvValue("line1\r\nline2\nline3")).toBe("line1 line2 line3");
  });

  it("writes empty cells for null and undefined, keeps 0", () => {
    expect(escapeCsvValue(null)).toBe("");
    expect(escapeCsvValue(undefined)).toBe("");
    expect(escapeCsvValue(0)).toBe("0");
  });

  it("keeps leading = and - (eBird data, not spreadsheet formulas)", () => {
    expect(escapeCsvValue("=7 ind.")).toBe("=7 ind.");
    expect(escapeCsvValue(-3.37)).toBe("-3.37");
  });
});

describe("rowsToCsv", () => {
  it("writes the 19 eBird Record Format (Extended) columns in order, without header", () => {
    const row = Object.fromEntries(EXPORT_COLUMNS.map((column, index) => [column, index]));
    expect(rowsToCsv([row])).toBe(EXPORT_COLUMNS.map((_, index) => index).join(","));
    expect(EXPORT_COLUMNS).toHaveLength(19);
  });

  it("does not depend on the key order of the row object", () => {
    const row = Object.fromEntries(EXPORT_COLUMNS.map((column) => [column, column]).reverse());
    expect(rowsToCsv([row])).toBe(EXPORT_COLUMNS.join(","));
  });
});

describe("export rows", () => {
  it("exports distance in miles and dates as MM/DD/YYYY", async () => {
    const { forms, rows } = await exportFixture("export_normal_with_trace.json", "ornitho.ch");
    const distanceKm = forms[0].distance;
    expect(rows[0].distance).toBeCloseTo(distanceKm * 0.621371, 3);
    expect(rows[0].date).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
    expect(rows[0].protocol).toBe("Traveling");
  });

  it("groups casual observations into automatic checklists", async () => {
    const { forms, rows } = await exportFixture("export_small_incidental.json", "ornitho.ch");
    expect(forms.length).toBeGreaterThan(0);
    expect(forms.every((form) => !form.imported)).toBe(true);
    expect(new Set(rows.map((row) => row.protocol))).toEqual(new Set(["Incidental"]));
  });

  it("credits ornitho2eBird in every checklist comment", async () => {
    const { rows } = await exportFixture("observation_org.csv", "observation.org");
    expect(rows.every((row) => row.checklist_comment.includes("ornitho2ebird.com"))).toBe(true);
  });
});

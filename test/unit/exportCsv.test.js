import { describe, expect, it } from "vitest";
import {
  EXPORT_COLUMNS,
  escapeCsvValue,
  rowsToCsv,
  buildExportRows,
  exportableFormsOf,
} from "../../src/lib/exportCsv";
import { buildForm, buildChecklistPayloadFromSightings } from "../../src/lib/utils";
import { createStore } from "../../src/lib/store";
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

describe("inferred incidental start times", () => {
  const sightings = ["08:32", "20:15"].map((time) => ({
    date: "2026-10-14",
    time,
    lat: 46,
    lon: 7,
    location_name: "Garden",
    common_name: "Robin",
    count: 1,
  }));

  const exportedTime = (form, observations = sightings) =>
    buildExportRows({
      exportableForms: exportableFormsOf([form]),
      sightingsByFormId: new Map([[form.id, observations]]),
      speciesCommentTemplate: { short: "", long: "", limit: 5 },
      commonNameForSighting: (sighting) => sighting.common_name,
      importedWithText: "Imported",
    }).rows[0].time;

  it("keeps the earliest time through three hours, omits longer spans and missing times", () => {
    const form = buildForm(buildChecklistPayloadFromSightings([...sightings].reverse()), 1);
    expect(form.time).toBe("08:32");
    expect(exportedTime(form)).toBe("");
    expect(form.time).toBe("08:32");
    expect(exportedTime(form, [sightings[0], { ...sightings[1], time: "11:32" }])).toBe("08:32");
    expect(exportedTime(form, [sightings[0], { ...sightings[1], time: "11:33" }])).toBe("");
    expect(exportedTime(form, [sightings[0], { ...sightings[1], time: "" }])).toBe("");
  });

  it("restores times when complete is enabled, applies omission only when primary purpose is off, and preserves manual edits", () => {
    const store = createStore();
    store.loadImport({ forms: [buildForm(buildChecklistPayloadFromSightings(sightings), 1)] });
    const form = store.state.forms[0];
    store.updateForm(1, { full_form: true });
    expect(exportedTime(form)).toBe("08:32");
    store.updateForm(1, { full_form: false });
    expect(exportedTime(form)).toBe("08:32");
    store.updateForm(1, { primary_purpose: false });
    expect(exportedTime(form)).toBe("");
    store.updateForm(1, { time: "08:32" });
    expect(exportedTime(form)).toBe("08:32");
    store.updateForm(1, { time: "08:32", time_inferred: true });
    expect(exportedTime(form)).toBe("");
  });

  it("preserves recorded source times and other protocols", () => {
    const form = buildForm(
      { imported: true, date: "2026-10-14", time: "08:32", primary_purpose: false },
      1,
    );
    expect(exportedTime(form)).toBe("08:32");
    for (const distance of ["", 0, 1]) {
      const birding = buildForm(
        { ...form, primary_purpose: true, time_inferred: true, duration: 700, distance },
        1,
      );
      expect(exportedTime(birding)).toBe("08:32");
    }
  });
});

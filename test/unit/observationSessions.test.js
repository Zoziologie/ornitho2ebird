import { describe, expect, it } from "vitest";
import { parseImportFiles, parseObservationSessionKml } from "../../src/lib/observationSessions";
import { protocol } from "../../src/lib/utils";
import { assignEbirdCodesFromScientificNames } from "../../src/lib/importers";
import { exportFixture, readFixture, website } from "../helpers";

const transect = ["sessions/transect.csv", "sessions/transect.kml"];
const stationary = ["sessions/stationary.csv", "sessions/stationary.kml"];
const files = (names) => names.map((name) => ({ name, text: async () => readFixture(name) }));

describe("Observation session pairs", () => {
  it("uses KML effort and CSV counts through the shared taxonomy and export pipeline", async () => {
    const { parsed, forms, rows, errors } = await exportFixture(transect, "observation.org");
    expect(errors).toEqual([]);
    expect(parsed.sightings).toEqual([]);
    expect(forms).toHaveLength(1);
    expect(forms[0]).toMatchObject({
      imported: true,
      date: "2024-05-01",
      time: "07:00",
      duration: 46,
      lat: 46.1,
      lon: 7.1,
      full_form: false,
      primary_purpose: true,
      number_observer: 1,
    });
    expect(forms[0].path).toHaveLength(104);
    expect(forms[0].distance).toBeGreaterThan(0);
    expect(protocol(forms[0]).name).toBe("Traveling");
    expect(rows).toHaveLength(3);
    expect(rows.map((row) => row.count)).toContain("X");
    expect(rows.every((row) => row.Genus && !row.common_name && row.full_form === "N")).toBe(true);
    expect(parsed.formsSightings[0].map((sighting) => sighting.count_precision)).toEqual([
      "=",
      "~",
      "",
    ]);
  });

  it("preserves a French stationary session's full duration and location", async () => {
    const { forms, rows, errors } = await exportFixture(stationary, "observation.org");
    expect(errors).toEqual([]);
    expect(forms[0]).toMatchObject({ duration: 66, distance: 0, path: null, lat: 46.2, lon: 7.2 });
    expect(rows.every((row) => row.protocol === "Stationary" && row.Duration === 66)).toBe(true);
  });

  it("pairs arbitrary filenames and selection order, preserving separate checklists", async () => {
    const { csv, parsed } = await exportFixture([...transect, ...stationary], "observation.org");
    const reversed = await exportFixture([...stationary, ...transect].reverse(), "observation.org");
    expect(reversed.csv).toBe(csv);
    const renamed = files([...stationary, ...transect].reverse()).map((file, index) => ({
      ...file,
      name: `renamed-${index}.${file.name.split(".").at(-1)}`,
    }));
    const paired = await parseImportFiles(renamed, website("observation.org"));
    expect(assignEbirdCodesFromScientificNames(paired)).toEqual(parsed);
    expect(parsed.forms.map((form) => form.id)).toEqual([1, 2]);
    expect(
      parsed.formsSightings.map((sightings) => [...new Set(sightings.map((s) => s.form_id))]),
    ).toEqual([[1], [2]]);
  });

  it("rejects missing, mismatched and ambiguous partners", async () => {
    await expect(
      parseImportFiles(files([transect[1]]), website("observation.org")),
    ).rejects.toMatchObject({ key: "importErrorSessionPairs" });
    await expect(
      parseImportFiles(files([transect[0], stationary[1]]), website("observation.org")),
    ).rejects.toMatchObject({ key: "importErrorSessionMatch" });
    await expect(
      parseImportFiles(files([...transect, ...transect]), website("observation.org")),
    ).rejects.toMatchObject({ key: "importErrorSessionMatch" });
    await expect(
      parseImportFiles(files([transect[0], stationary[0]]), website("observation.org")),
    ).rejects.toMatchObject({ key: "importErrorSessionPairs" });
  });

  it("rejects partially overlapping sessions instead of importing a bird twice", async () => {
    const selected = files([...transect, ...stationary]).map((file) => ({
      ...file,
      text: async () => (await file.text()).replaceAll("900002000", "900001000"),
    }));
    await expect(parseImportFiles(selected, website("observation.org"))).rejects.toMatchObject({
      key: "importErrorSessionOverlap",
    });
  });

  it("retains the existing single bulk CSV workflow", async () => {
    const parsed = await parseImportFiles(
      files(["observation_bulk_fr.csv"]),
      website("observation.org"),
    );
    expect(parsed.forms).toEqual([]);
    expect(parsed.sightings).toHaveLength(5);
  });

  it("handles overnight effort and namespaced XML without relying on the session title", () => {
    const text = readFixture(transect[1]).replace("07:00 until 07:46", "23:50 until 00:36");
    const session = parseObservationSessionKml(text, "overnight.kml");
    expect(session).toMatchObject({ duration: 46, crosses_midnight: true });
    const prefixed = text
      .replace(/<(\/?)([A-Za-z][\w]*)/g, "<$1k:$2")
      .replace("xmlns=", "xmlns:k=");
    expect(parseObservationSessionKml(prefixed, "prefixed.kml").ids).toEqual(session.ids);
  });

  it("rejects bulk KML, malformed XML and missing effort", () => {
    for (const text of [
      "<kml>",
      readFixture(transect[1]).replace("/sessions/900001/", "/users/900001/"),
      readFixture(transect[1]).replace("07:00 until 07:46", "no effort"),
    ]) {
      expect(() => parseObservationSessionKml(text, "bad.kml")).toThrow();
    }
  });
});

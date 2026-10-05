import { beforeAll, describe, expect, it } from "vitest";
import { ImportError, parseImportFile, parseWktLineString } from "../../src/lib/importers";
import { loadOrnithoSpeciesList } from "../../src/lib/taxonomy";
import { exportFixture, parseFixture, readFixture, website } from "../helpers";

beforeAll(() => loadOrnithoSpeciesList());

function importError(run) {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(ImportError);
    return { key: error.key, params: error.params };
  }
  throw new Error("expected an ImportError");
}

function ornithoJson(forms = [], sightings = []) {
  return JSON.stringify({ data: { forms, sightings } });
}

function ornithoSighting({
  id = 1,
  iso = "2024-05-01T07:30:00+02:00",
  lat = "46.1",
  lon = "7.1",
  speciesId = "1",
} = {}) {
  return {
    species: { "@id": speciesId, name: "Species", latin_name: "Latin" },
    place: { name: "Somewhere" },
    observers: [
      {
        id_sighting: String(id),
        timing: { "@ISO8601": iso },
        coord_lat: lat,
        coord_lon: lon,
        count: "1",
        estimation_code: "EXACT_VALUE",
      },
    ],
  };
}

describe("ornitho JSON", () => {
  it("parses forms, casual sightings and form sightings", async () => {
    const parsed = await parseFixture("export_mixed_large.json", "ornitho.ch");
    expect(parsed.forms.length).toBe(parsed.formsSightings.length);
    expect(parsed.forms.length).toBeGreaterThan(0);
    expect(parsed.sightings.length).toBeGreaterThan(0);
    expect(parsed.skipped).toEqual({ emptyForms: 0, noCoordinates: 0 });
  });

  it("maps ornitho species ids to eBird species codes", async () => {
    const parsed = await parseFixture("export_normal_with_trace.json", "ornitho.ch");
    const sightings = parsed.formsSightings.flat();
    expect(sightings.every((s) => s.ebird_species_code)).toBe(true);
  });

  it("reads the GPS trace into a path and distance", async () => {
    const parsed = await parseFixture("export_normal_with_trace.json", "ornitho.ch");
    expect(parsed.forms[0].path.length).toBeGreaterThan(2);
    expect(parsed.forms[0].distance).toBeGreaterThan(0);
  });

  it("rejects invalid JSON with a translated reason", () => {
    expect(importError(() => parseImportFile("not json", website("ornitho.ch")))).toEqual({
      key: "importErrorInvalidJson",
      params: {},
    });
    expect(importError(() => parseImportFile("{}", website("ornitho.ch"))).key).toBe(
      "importErrorInvalidJson",
    );
  });

  it("skips checklists without sightings instead of failing", () => {
    const form = {
      time_start: "07:00:00",
      time_stop: "08:00:00",
      lat: "46",
      lon: "7",
      full_form: "1",
    };
    const parsed = parseImportFile(
      ornithoJson([
        { ...form, sightings: [ornithoSighting()] },
        { ...form, sightings: [] },
      ]),
      website("ornitho.ch"),
    );
    expect(parsed.forms).toHaveLength(1);
    expect(parsed.formsSightings).toHaveLength(1);
    expect(parsed.skipped.emptyForms).toBe(1);
  });

  it("gives checklists that end after midnight a positive duration", () => {
    const form = {
      time_start: "23:30:00",
      time_stop: "00:45:00",
      lat: "46",
      lon: "7",
      full_form: "1",
    };
    const parsed = parseImportFile(
      ornithoJson([
        { ...form, sightings: [ornithoSighting({ iso: "2024-05-01T23:40:00+02:00" })] },
      ]),
      website("ornitho.ch"),
    );
    expect(parsed.forms[0].duration).toBe(75);
  });

  it("sorts casual sightings by date, then time", () => {
    const parsed = parseImportFile(
      ornithoJson(
        [],
        [
          ornithoSighting({ id: 1, iso: "2024-05-02T06:00:00+02:00" }),
          ornithoSighting({ id: 2, iso: "2024-05-01T18:00:00+02:00" }),
          ornithoSighting({ id: 3, iso: "2024-05-01T07:00:00+02:00" }),
        ],
      ),
      website("ornitho.ch"),
    );
    expect(parsed.sightings.map((s) => s.id)).toEqual(["3", "2", "1"]);
  });
});

describe("BirdLasser CSV", () => {
  it("accepts both export layouts", async () => {
    for (const fixture of ["birdlasser_trip_kenya_2022.csv", "birdlasser_ruai_dandora.csv"]) {
      const parsed = await parseFixture(fixture, "birdlasser");
      expect(parsed.sightings.length).toBeGreaterThan(0);
      expect(parsed.sightings.every((s) => s.common_name)).toBe(true);
    }
  });

  it("skips rows without coordinates and counts them", () => {
    const [header, ...rows] = readFixture("birdlasser_trip_kenya_2022.csv").split("\n");
    const columns = header.split(",");
    const latitude = columns.indexOf('"Latitude"');
    const broken = rows[0].split(",");
    broken[latitude] = '""';
    const parsed = parseImportFile(
      [header, broken.join(","), rows[1]].join("\n"),
      website("birdlasser"),
    );
    expect(parsed.sightings).toHaveLength(1);
    expect(parsed.skipped.noCoordinates).toBe(1);
  });

  it("names the missing columns when the file is from another source", () => {
    const error = importError(() =>
      parseImportFile(readFixture("observation_org.csv"), website("birdlasser")),
    );
    expect(error.key).toBe("importErrorMissingColumns");
    expect(error.params.columns).toContain("Species primary name / Primary language");
  });
});

describe("Observation CSV", () => {
  it("combines French count breakdowns without losing counts or details", async () => {
    const parsed = await parseFixture("observation_bulk_fr.csv", "observation.org");
    expect(parsed.sightings).toHaveLength(5);
    expect(parsed.skipped.nonBirds).toBe(1);
    expect(new Set(parsed.sightings.map((sighting) => sighting.id)).size).toBe(5);
    expect(parsed.sightings[0]).toMatchObject({
      count: 5,
      count_precision: ">",
      comment: "First detail - Second detail - 2x parade nuptiale ou accouplement, 3x",
    });
    expect(parsed.sightings[1]).toMatchObject({ count: 4, comment: "2x M adulte, 2x" });
    expect(parsed.sightings[2]).toMatchObject({ count: 3 });
    expect(parsed.sightings[2].comment).toContain("1x poussin");
    expect(parsed.sightings[3]).toMatchObject({ count: "x", count_precision: "" });
    const { rows, errors } = await exportFixture("observation_bulk_fr.csv", "observation.org");
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(5);
    expect(rows.find((row) => row.Genus === "Circus").count).toBe(5);
    expect(rows.find((row) => row.Genus === "Oxyura").count).toBe("X");
    expect(rows.every((row) => row.common_name === "" && row.Genus)).toBe(true);
  });

  it("excludes an export containing only non-birds without attempting species matching", () => {
    const raw = readFixture("observation_bulk_fr.csv").replaceAll("Oiseaux", "Mammifères");
    const parsed = parseImportFile(raw, website("observation.org"));
    expect(parsed.sightings).toEqual([]);
    expect(parsed.skipped.nonBirds).toBe(6);
  });

  it("parses observation.org exports with permalinks", async () => {
    const parsed = await parseFixture("observation_org.csv", "observation.org");
    expect(parsed.sightings.length).toBeGreaterThan(0);
    expect(parsed.sightings[0].permalink).toMatch(/^https:\/\/observation\.org\/observation\/\d+$/);
    for (const precision of [">", "=", "~"]) {
      expect(parsed.sightings.some((sighting) => sighting.count_precision === precision)).toBe(
        true,
      );
    }
    expect(parsed.sightings.some((sighting) => sighting.count === "x")).toBe(true);
  });

  it("names the missing columns for a BirdLasser file", () => {
    const error = importError(() =>
      parseImportFile(readFixture("birdlasser_trip_kenya_2022.csv"), website("observation.org")),
    );
    expect(error.key).toBe("importErrorMissingColumns");
  });
});

describe("other sources", () => {
  it("rejects an ornitho.net TXT without recognized observation headers", () => {
    expect(
      importError(() => parseImportFile("Datum\tArt\n1\t2", website("data.biolovision.net"))).key,
    ).toBe("importErrorTxtHeader");
  });

  it("rejects unknown systems", () => {
    expect(importError(() => parseImportFile("", { name: "x", system: "unknown" })).key).toBe(
      "importErrorUnsupported",
    );
  });
});

describe("parseWktLineString", () => {
  it("reads LINESTRING as [lat, lon] points", () => {
    expect(parseWktLineString("LINESTRING(6.63 46.52, 6.64 46.53)")).toEqual([
      [46.52, 6.63],
      [46.53, 6.64],
    ]);
    expect(parseWktLineString(" linestring ( -0.5 51.4 , 0 0 ) ")).toEqual([
      [51.4, -0.5],
      [0, 0],
    ]);
  });

  it("returns null for anything that is not a 2D line of two or more points", () => {
    for (const wkt of [
      "",
      null,
      "POINT(6.6 46.5)",
      "LINESTRING(6.6 46.5)",
      "LINESTRING(6.6 46.5 400, 6.7 46.6 410)",
      "MULTILINESTRING((6.6 46.5, 6.7 46.6))",
      "LINESTRING(6.6 abc, 6.7 46.6)",
    ]) {
      expect(parseWktLineString(wkt)).toBeNull();
    }
  });
});

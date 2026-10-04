import Papa from "papaparse";
import { beforeAll, describe, expect, it } from "vitest";
import { buildExportRows, exportableFormsOf, groupSightingsByForm } from "../../src/lib/exportCsv";
import { parseImportFile } from "../../src/lib/importers";
import { createStore } from "../../src/lib/store";
import { loadOrnithoSpeciesList } from "../../src/lib/taxonomy";
import {
  assembleImport,
  buildForm,
  createSighting,
  distanceFromPath,
  checklistReview,
  uniqueDistanceFromPath,
  trackExtentKm,
  protocol,
} from "../../src/lib/utils";
import { defaultSpeciesCommentTemplate, readFixture, website } from "../helpers";

beforeAll(() => loadOrnithoSpeciesList());

const effort = {
  date: "2024-05-01",
  time: "07:00",
  duration: 60,
  distance: 1,
  number_observer: 1,
  primary_purpose: true,
};
const options = {
  defaultNumberObserver: 2,
  autoAssignDuration: 1,
  autoAssignDistance: 3,
  speciesCommentTemplate: defaultSpeciesCommentTemplate,
};
const sighting = (changes = {}) =>
  createSighting({
    id: 1,
    form_id: 0,
    date: effort.date,
    time: effort.time,
    lat: 46,
    lon: 7,
    common_name: "Great Tit",
    count: "1",
    ...changes,
  });

function exportRows(forms, sightings, formsSightings = []) {
  const exportableForms = exportableFormsOf(forms);
  return buildExportRows({
    exportableForms,
    sightingsByFormId: groupSightingsByForm(exportableForms, sightings, formsSightings),
    speciesCommentTemplate: defaultSpeciesCommentTemplate,
    importedWithText: "Imported with ornitho2eBird",
  });
}

function sourceSighting(changes = {}) {
  return {
    species: { "@id": "1", name: "Species" },
    place: { name: "Site" },
    observers: [
      {
        id_sighting: "1",
        timing: { "@ISO8601": "2024-05-01T07:00:00+02:00" },
        coord_lat: "46",
        coord_lon: "7",
        count: "1",
        estimation_code: "EXACT_VALUE",
        ...changes,
      },
    ],
  };
}

function importList(changes = {}) {
  return parseImportFile(
    JSON.stringify({
      data: {
        forms: [
          {
            lat: "46",
            lon: "7",
            time_start: "07:00:00",
            time_stop: "08:00:00",
            full_form: "1",
            sightings: [sourceSighting()],
            ...changes,
          },
        ],
      },
    }),
    website("ornitho.ch"),
  );
}

describe("eBird protocol and completeness combinations", () => {
  it.each([
    ["stationary complete", { distance: 0, full_form: true }, "Stationary", "Y"],
    ["stationary incomplete", { distance: 0, full_form: false }, "Stationary", "N"],
    ["traveling complete", { full_form: true }, "Traveling", "Y"],
    ["traveling incomplete", { full_form: false }, "Traveling", "N"],
    ["historical complete", { distance: null, full_form: true }, "Historical", "Y"],
    ["historical incomplete", { distance: null, full_form: false }, "Historical", "N"],
    ["incidental", { primary_purpose: false, full_form: false }, "Incidental", "N"],
  ])("%s", (_, changes, name, complete) => {
    const { rows, errors } = exportRows(
      [buildForm({ ...effort, lat: 46, lon: 7, ...changes }, 1)],
      [sighting({ form_id: 1 })],
    );
    expect(errors).toEqual([]);
    expect(rows[0]).toMatchObject({ protocol: name, full_form: complete });
  });

  it.each(["time", "duration", "distance"])("missing %s gives Historical", (field) => {
    expect(protocol({ ...effort, [field]: "" }).name).toBe("Historical");
  });

  it.each(["", null, undefined])("unknown distance %s is not stationary", (distance) => {
    expect(protocol({ ...effort, distance }).name).toBe("Historical");
  });

  it("Incidental does not require effort", () => {
    expect(protocol({ date: effort.date, primary_purpose: false }).name).toBe("Incidental");
  });

  it.each([{ date: "" }, { duration: 1440 }])("invalid checklist is excluded: %j", (changes) => {
    expect(exportableFormsOf([buildForm({ ...effort, ...changes }, 1)])).toEqual([]);
  });

  it("Incidental can never be exported complete", () => {
    const { rows } = exportRows(
      [buildForm({ ...effort, primary_purpose: false, full_form: true }, 1)],
      [sighting({ form_id: 1 })],
    );
    expect(rows[0].full_form).toBe("N");
  });
});

describe("Biolovision list metadata and counts", () => {
  it.each(["1", "0"])(
    "preserves complete/partial list flag %s and observer assumption",
    (full_form) => {
      const imported = assembleImport(importList({ full_form }), options);
      expect(imported.forms[0]).toMatchObject({
        primary_purpose: true,
        full_form: full_form === "1",
        number_observer: 2,
      });
      expect(protocol(imported.forms[0]).name).toBe("Historical");
    },
  );

  it.each(["trace", "protocol"])("reads a track from %s", (field) => {
    const wkt = "LINESTRING(7 46, 7 46.001)";
    const { forms } = assembleImport(
      importList({ [field]: field === "trace" ? wkt : { wkt } }),
      options,
    );
    expect(protocol(forms[0]).name).toBe("Traveling");
  });

  it.each([
    ["EXACT_VALUE", "=", 3],
    ["ESTIMATION", "~", 3],
    ["MINIMUM", ">", 3],
    ["NO_VALUE", "", "X"],
  ])("exports %s counts and retains precision in comments", (estimation_code, precision, count) => {
    const parsed = parseImportFile(
      JSON.stringify({ data: { sightings: [sourceSighting({ count: "3", estimation_code })] } }),
      website("ornitho.ch"),
    );
    const imported = assembleImport(parsed, options);
    const { rows } = exportRows(imported.forms, imported.sightings);
    expect(parsed.sightings[0].count_precision).toBe(precision);
    expect(rows[0].count).toBe(count);
    expect(rows[0].species_comment).toContain("ornitho.ch/index.php?m_id=54&id=1");
    if (precision) expect(rows[0].species_comment).toContain(`${precision}3`);
  });

  it("does not omit heard-only records", () => {
    const parsed = importList({ sightings: [sourceSighting({ auditory_contact: "1" })] });
    const imported = assembleImport(parsed, options);
    expect(exportRows(imported.forms, [], imported.formsSightings).rows).toHaveLength(1);
  });

  it("mortality-marked records are excluded, flagged, or retain metadata for review", () => {
    const parsed = importList({ sightings: [sourceSighting({ has_death: "1" })] });
    const imported = assembleImport(parsed, options);
    const { rows, errors } = exportRows(imported.forms, [], imported.formsSightings);
    expect(
      rows.length === 0 || errors.length > 0 || parsed.formsSightings[0][0].has_death === "1",
    ).toBe(true);
  });

  it.each(["0", 0])("does not silently export a zero count (%s) as zero or presence", (count) => {
    const { rows, errors } = exportRows([buildForm(effort, 1)], [sighting({ form_id: 1, count })]);
    expect(rows.length === 0 || errors.length > 0).toBe(true);
  });

  it("a midnight-crossing source list stays available with a warning", () => {
    const imported = assembleImport(
      importList({
        time_start: "23:30:00",
        time_stop: "00:45:00",
        sightings: [sourceSighting({ timing: { "@ISO8601": "2024-05-01T23:40:00+02:00" } })],
      }),
      options,
    );
    const { rows, errors } = exportRows(imported.forms, [], imported.formsSightings);
    expect(rows).toHaveLength(1);
    expect(errors).toEqual([]);
    expect(checklistReview(imported.forms[0], imported.formsSightings[0])).toMatchObject({
      dateWarning: true,
      canSplit: false,
    });
  });
});

describe("casual grouping and manual assignment", () => {
  it.each([
    ["nearby same-day sightings", {}, 1],
    ["different dates", { date: "2024-05-02" }, 2],
    ["exact time boundary", { time: "08:00" }, 2],
    ["outside distance limit", { lat: 46.04 }, 2],
    ["unknown times", { time: "" }, 1],
  ])("%s", (_, changes, count) => {
    const imported = assembleImport(
      {
        sightings: [
          sighting({ time: changes.time === "" ? "" : "07:00" }),
          sighting({ id: 2, time: "07:30", ...changes }),
        ],
      },
      options,
    );
    expect(imported.forms).toHaveLength(count);
    expect(
      imported.forms.every(
        (form) =>
          !form.primary_purpose && !form.full_form && !form.duration && form.distance === "",
      ),
    ).toBe(true);
  });

  it("creates new lists without adding to imported lists", () => {
    const imported = assembleImport(
      { forms: [{ ...effort, imported: true }], sightings: [sighting()] },
      options,
    );
    expect(imported.forms).toHaveLength(2);
    expect(imported.sightings[0].form_id).toBe(2);
  });

  it("chains nearby sightings beyond the overall distance limit (documented assumption)", () => {
    const imported = assembleImport(
      { sightings: [sighting(), sighting({ id: 2, lat: 46.02 }), sighting({ id: 3, lat: 46.04 })] },
      options,
    );
    expect(imported.forms).toHaveLength(1);
  });

  it("a bridging sighting joins one group without merging existing groups", () => {
    const imported = assembleImport(
      {
        sightings: [
          sighting(),
          sighting({ id: 2, time: "07:10", lat: 46.04 }),
          sighting({ id: 3, time: "07:20", lat: 46.02 }),
        ],
      },
      options,
    );
    expect(imported.forms).toHaveLength(2);
  });

  it("manual cross-date assignment stays exportable with a date review", () => {
    const store = createStore();
    store.loadImport({
      forms: [buildForm(effort, 1)],
      sightings: [sighting(), sighting({ id: 2, date: "2024-05-02" })],
    });
    store.assignSightings(store.state.sightings, 1);
    const { rows, errors } = exportRows(store.state.forms, store.state.sightings);
    expect(rows).toHaveLength(1);
    expect(errors).toEqual([]);
    expect(checklistReview(store.state.forms[0], store.state.sightings)).toMatchObject({
      dateWarning: true,
      canSplit: true,
    });
  });
});

describe("distance rules", () => {
  it.each([
    [
      "out and back",
      [
        [0, 0],
        [0.001, 0],
        [0, 0],
      ],
      0.111,
    ],
    [
      "partial backtracking",
      [
        [0, 0],
        [0.002, 0],
        [0.001, 0],
      ],
      0.222,
    ],
    [
      "return across multiple segments",
      [
        [0, 0],
        [0.001, 0],
        [0.002, 0],
        [0, 0],
      ],
      0.222,
    ],
    [
      "loop",
      [
        [0, 0],
        [0.001, 0],
        [0.001, 0.001],
        [0, 0.001],
        [0, 0],
      ],
      0.445,
    ],
    [
      "duplicate points",
      [
        [0, 0],
        [0, 0],
        [0.001, 0],
      ],
      0.111,
    ],
  ])("estimates unique distance for %s", (_, path, distance) => {
    expect(uniqueDistanceFromPath(path)).toBe(distance);
  });

  it("does not merge parallel paths 10 m apart", () => {
    const path = [
      [0, 0],
      [0.001, 0],
      [0.001, 0.00009],
      [0, 0.00009],
    ];
    expect(uniqueDistanceFromPath(path)).toBeCloseTo(0.232, 3);
  });
  it("exports unique distance for an out-and-back track", () => {
    const imported = assembleImport(
      importList({ trace: "LINESTRING(7 46, 7 46.001, 7 46)" }),
      options,
    );
    const { rows } = exportRows(imported.forms, [], imported.formsSightings);
    expect(rows[0].distance).toBeCloseTo(0.111195 * 0.621371, 3);
  });

  it.each([0, 10, 39])("ignores an isolated bad fix at track position %s", (badIndex) => {
    const path = Array.from({ length: 40 }, (_, index) => [46 + (index % 3) * 0.00004, 7]);
    path[badIndex] = [46.01, 7];
    expect(trackExtentKm(path)).toBeLessThan(0.03);
    expect(protocol({ ...effort, path }).name).toBe("Stationary");
  });
  it("does not discard more than 5% of the positions", () => {
    const path = Array.from({ length: 40 }, () => [46, 7]);
    path[10] = [46.001, 7];
    path[11] = [46.002, 7];
    path[12] = [46.003, 7];
    expect(trackExtentKm(path)).toBeGreaterThan(0.1);
    expect(trackExtentKm([...path].reverse())).toBeCloseTo(trackExtentKm(path), 8);
  });
  it("retains sustained movement even after trimming", () => {
    const path = Array.from({ length: 40 }, (_, index) => [46 + index * 0.00002, 7]);
    expect(trackExtentKm(path)).toBeGreaterThan(0.03);
    expect(protocol({ ...effort, path }).name).toBe("Traveling");
  });
  it("retains every point on sparse tracks", () => {
    const path = [
      [46, 7],
      [46.001, 7],
      [46, 7],
    ];
    expect(trackExtentKm(path)).toBeGreaterThan(0.1);
    expect(protocol({ ...effort, path }).name).toBe("Traveling");
  });
  it("documents that a genuine brief excursion can also be trimmed", () => {
    const path = Array.from({ length: 40 }, () => [46, 7]);
    path[20] = [46.001, 7];
    expect(trackExtentKm(path)).toBe(0);
  });
  it("measures extent between retained positions rather than radius around the median", () => {
    const path = Array.from({ length: 40 }, (_, index) => [
      46 + (index % 2 ? 0.00018 : -0.00018),
      7,
    ]);
    expect(trackExtentKm(path)).toBeGreaterThan(0.03);
    expect(protocol({ ...effort, path }).name).toBe("Traveling");
  });

  it("movement entirely within 30 m of the start stays Stationary", () => {
    const path = [
      [46, 7],
      [46.00018, 7],
      [46, 7],
      [46.00018, 7],
    ];
    expect(protocol({ ...effort, path, distance: distanceFromPath(path) }).name).toBe("Stationary");
  });
});

describe("checklist review and user decisions", () => {
  it("enables primary purpose when a user marks a reconstructed checklist complete", () => {
    const store = createStore();
    store.loadImport({ forms: [buildForm({ ...effort, primary_purpose: false }, 1)] });
    store.updateForm(1, { full_form: true });
    expect(store.state.forms[0]).toMatchObject({ primary_purpose: true, full_form: true });
    store.updateForm(1, { primary_purpose: false });
    expect(store.state.forms[0].full_form).toBe(false);
  });

  it.each([false, true])("splits casual/imported sightings by date (imported: %s)", (imported) => {
    const store = createStore();
    const records = [
      sighting({ form_id: 1 }),
      sighting({ form_id: 1, id: 2, date: "2024-05-02", time: "09:00" }),
    ];
    store.loadImport({
      forms: [
        buildForm(
          {
            ...effort,
            imported,
            full_form: true,
            checklist_comment: "Keep this",
            path: [
              [46, 7],
              [46.01, 7],
            ],
          },
          1,
        ),
        buildForm({ ...effort }, 2),
      ],
      sightings: imported ? [] : records,
      formsSightings: imported ? [records] : [],
    });
    expect(store.splitFormByDate(1)).toEqual([1, 3]);
    expect(
      store.state.forms
        .filter((form) => form.id !== 2)
        .map((form) => [
          form.date,
          form.duration,
          form.distance,
          form.path,
          form.checklist_comment,
        ]),
    ).toEqual([
      ["2024-05-01", "", "", null, "Keep this"],
      ["2024-05-02", "", "", null, "Keep this"],
    ]);
    const allSightings = [...store.state.sightings, ...store.state.formsSightings.flat()];
    expect(allSightings.map((record) => [record.id, record.form_id])).toEqual([
      [1, 1],
      [2, 3],
    ]);
    expect(
      exportRows(store.state.forms, store.state.sightings, store.state.formsSightings).rows.map(
        (row) => row.date,
      ),
    ).toEqual(["05/01/2024", "05/02/2024"]);
  });

  it("does not split when any observation has no time", () => {
    const store = createStore();
    store.loadImport({
      forms: [buildForm(effort, 1)],
      sightings: [
        sighting({ form_id: 1 }),
        sighting({ form_id: 1, id: 2, date: "2024-05-02", time: "" }),
      ],
    });
    expect(store.splitFormByDate(1)).toEqual([]);
    expect(store.state.forms).toHaveLength(1);
    expect(checklistReview(store.state.forms[0], store.state.sightings)).toMatchObject({
      dateWarning: true,
      canSplit: false,
    });
  });

  it("flags a single observation whose date differs from the edited checklist date", () => {
    expect(checklistReview({ ...effort, date: "1900-01-01" }, [sighting()])).toMatchObject({
      dateWarning: true,
      canSplit: false,
    });
  });

  it("excludes only the confirmed dead bird from the real mortality pair", () => {
    const parsed = parseImportFile(
      readFixture("rules/ornitho_mortality_overnight.json"),
      website("ornitho.ch"),
    );
    const imported = assembleImport(parsed, options);
    const { rows, errors } = exportRows(
      imported.forms,
      imported.sightings,
      imported.formsSightings,
    );
    expect(errors).toEqual([]);
    expect(rows.some((row) => row.common_name === "Mésange nonnette")).toBe(false);
    expect(rows.find((row) => row.date === "10/04/2026")).toMatchObject({
      common_name: "Cygne tuberculé",
      count: 1,
    });
    expect(imported.sightings).toHaveLength(2);
  });
});

describe("real Biolovision regression examples", () => {
  const raw = JSON.parse(readFixture("rules/ornitho_mortality_overnight.json"));

  it("distinguishes dead and injured source records despite identical mortality flags", () => {
    const observers = raw.data.sightings.map((record) => record.observers[0]);
    expect(observers.map((observer) => observer.has_death)).toEqual(["2", "2"]);
    expect(observers.map((observer) => observer.extended_info.mortality.wounded)).toEqual([
      "0",
      "1",
    ]);
  });

  it.each([0, 1])("retains mortality details for review of real source record %s", (index) => {
    const parsed = parseImportFile(JSON.stringify(raw), website("ornitho.ch"));
    expect(parsed.sightings[index]).toMatchObject({
      has_death: "2",
      extended_info: {
        mortality: raw.data.sightings[index].observers[0].extended_info.mortality,
      },
    });
  });

  it("preserves the supplied overnight list's partial status and effort", () => {
    const parsed = parseImportFile(JSON.stringify(raw), website("ornitho.ch"));
    expect(parsed.forms[0]).toMatchObject({
      date: "2026-10-02",
      time: "23:20:00",
      duration: 640,
      full_form: false,
    });
    expect(parsed.sightings.every((record) => record.time === "")).toBe(true);
  });

  it("retains evidence of the real midnight crossing for review", () => {
    const parsed = parseImportFile(JSON.stringify(raw), website("ornitho.ch"));
    expect(
      parsed.forms[0].crosses_midnight === true || parsed.forms[0].time_stop === "10:00:00",
    ).toBe(true);
  });

  it("imports the real French TXT with dates, species, coordinates and counts", () => {
    const parsed = parseImportFile(
      readFixture("rules/biolovision_french.txt"),
      website("data.biolovision.net"),
    );
    expect(parsed.sightings).toHaveLength(2);
    expect(parsed.sightings.find((record) => record.id === "1_16441305")).toMatchObject({
      date: "2018-09-30",
      time: "18:16",
      scientific_name: "Alcedo atthis",
      lat: 46.722253,
      lon: 6.564841,
      count: "1",
    });
  });

  it.each(["italian", "spanish", "polish", "catalan"])(
    "imports real %s headers and untimed records",
    (language) => {
      const parsed = parseImportFile(
        readFixture(`rules/biolovision_${language}.txt`),
        website("data.biolovision.net"),
      );
      expect(parsed.sightings).toHaveLength(2);
      expect(parsed.sightings.find((record) => record.id === "65_176783758")).toMatchObject({
        date: "2026-09-02",
        time: "19:19",
        scientific_name: "Calidris temminckii",
        lat: 47.766212,
        lon: 7.170107,
        count: "1",
      });
      expect(parsed.sightings.find((record) => record.id === "65_176702563")).toMatchObject({
        date: "2026-08-30",
        time: "",
        scientific_name: "Tringa erythropus",
      });
    },
  );

  it("imports real German headers", () => {
    const parsed = parseImportFile(
      readFixture("rules/biolovision_german.txt"),
      website("data.biolovision.net"),
    );
    expect(parsed.sightings).toHaveLength(2);
    expect(parsed.sightings.find((record) => record.id === "65_136859234")).toMatchObject({
      date: "2023-09-29",
      time: "11:10",
      scientific_name: "Circus aeruginosus",
      lat: 47.61804,
      lon: 7.230884,
      count: "2",
    });
  });

  it("accepts reordered columns and ignores added columns, including duplicate Polish day headers", () => {
    const rows = Papa.parse(readFixture("rules/biolovision_polish.txt"), {
      skipEmptyLines: true,
    }).data;
    const reordered = Papa.unparse(
      rows.map((row) => ["unused", ...[...row].reverse()]),
      { delimiter: "\t" },
    );
    const parsed = parseImportFile(reordered, website("data.biolovision.net"));
    expect(parsed.sightings.find((record) => record.id === "65_176783758")).toMatchObject({
      date: "2026-09-02",
      scientific_name: "Calidris temminckii",
      count: "1",
    });
  });

  // Only headers are translated. Dates and other observation values come from the real export.
  it.each([
    ["1_16441305", "2018-09-30"],
    ["65_71682639", "2018-09-06"],
  ])("preserves day-month-year date for TXT record %s", (id, date) => {
    const parsed = parseImportFile(
      readFixture("rules/biolovision_english_headers_derived.txt"),
      website("data.biolovision.net"),
    );
    expect(parsed.sightings.find((record) => record.id === id).date).toBe(date);
  });

  it("classifies synthetic GPS drift around an existing track point as Stationary", () => {
    const source = JSON.parse(readFixture("export_normal_with_trace.json"));
    const form = source.data.forms[0];
    const [lon, lat] = /LINESTRING\s*\(\s*([\d.-]+)\s+([\d.-]+)/i
      .exec(form.trace)
      .slice(1)
      .map(Number);
    // Deterministic offsets <= ~15 m; cumulative movement exceeds 30 m.
    const path = [
      [lat, lon],
      [lat + 0.0001, lon],
      [lat, lon - 0.0001],
      [lat - 0.0001, lon],
      [lat, lon + 0.0001],
      [lat, lon],
    ];
    form.trace = `LINESTRING(${path.map(([pointLat, pointLon]) => `${pointLon} ${pointLat}`).join(", ")})`;
    const imported = assembleImport(
      parseImportFile(JSON.stringify(source), website("ornitho.ch")),
      options,
    );
    const { rows } = exportRows(imported.forms, [], imported.formsSightings);
    expect(rows[0].protocol).toBe("Stationary");
  });
});

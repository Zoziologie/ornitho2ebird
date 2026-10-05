import { describe, expect, it } from "vitest";
import {
  buildSpeciesRows,
  checklistComment,
  createSighting,
  distanceFromPath,
  distanceReview,
  formatDate,
  groupByLocation,
  mathMode,
  protocol,
  speciesComment,
} from "../../src/lib/utils";

const template = (short, long = short, limit = 5) => ({ short, long, limit });

describe("speciesComment", () => {
  const sighting = createSighting({
    id: 1,
    lat: 46,
    lon: 7,
    count: 3,
    count_precision: "~",
    time: "08:15:00",
  });

  it("evaluates ${...} expressions against the sighting", () => {
    expect(
      speciesComment(template("${ s.count_precision }${ s.count } ind. at ${ s.time }"), [
        sighting,
      ]),
    ).toBe("~3 ind. at 08:15");
  });

  it("keeps literal text after a closing brace", () => {
    expect(speciesComment(template("${ s.count } } done"), [sighting])).toBe("3 } done");
  });

  it("keeps an unterminated expression as literal text", () => {
    expect(speciesComment(template("count ${ s.count"), [sighting])).toBe("count ${ s.count");
  });

  it("drops a failing expression but keeps the text after it", () => {
    expect(speciesComment(template("${ s.missing.deep } after"), [sighting])).toBe(" after");
  });

  it("uses the short template below the limit and the long one from it", () => {
    const tpl = template("short ${ s.count }", "long ${ s.count }", 2);
    expect(speciesComment(tpl, [sighting])).toBe("short 3");
    expect(speciesComment(tpl, [sighting, sighting])).toBe("long 3, long 3");
  });

  it("joins short comments with <br/>", () => {
    expect(speciesComment(template("${ s.count }"), [sighting, sighting])).toBe("3<br/>3");
  });

  it("returns an empty string without template or sightings", () => {
    expect(speciesComment(null, [sighting])).toBe("");
    expect(speciesComment(template("x"), [])).toBe("");
  });

  describe("escaping imported data", () => {
    it("escapes HTML in imported comments, keeping line breaks", () => {
      const evil = createSighting({
        lat: 1,
        lon: 1,
        comment: '<img src=x onerror="alert(1)">\r\nline 2',
      });
      expect(speciesComment(template("${ s.comment }"), [evil])).toBe(
        '&lt;img src=x onerror="alert(1)">' + "<br>line 2",
      );
    });

    it('escapes "<" and quotes in other imported fields', () => {
      const evil = createSighting({ lat: 1, lon: 1, common_name: '<b>"Tit"</b>' });
      expect(speciesComment(template("${ s.common_name }"), [evil])).toBe(
        "&lt;b>&quot;Tit&quot;&lt;/b>",
      );
    });

    it("leaves ordinary text untouched", () => {
      const plain = createSighting({
        lat: 1,
        lon: 1,
        comment: "pair & 2 juv. >5 m",
        common_name: "Great Tit",
      });
      expect(speciesComment(template("${ s.common_name }: ${ s.comment }"), [plain])).toBe(
        "Great Tit: pair & 2 juv. >5 m",
      );
    });

    it("cannot break out of an href built by the template", () => {
      const evil = createSighting({
        lat: 1,
        lon: 1,
        source_record_url: 'x" onmouseover="alert(1)',
      });
      const html = speciesComment(template('<a href="${ s.source_record_url }">link</a>'), [evil]);
      expect(html).toBe('<a href="x&quot; onmouseover=&quot;alert(1)">link</a>');
    });
  });
});

describe("createSighting", () => {
  it("rounds coordinates to 6 decimals and builds a maps link", () => {
    const sighting = createSighting({ lat: 46.12345678, lon: 7.98765432 });
    expect(sighting.lat).toBe(46.123457);
    expect(sighting.lon).toBe(7.987654);
    expect(sighting.google_maps_url).toBe("https://maps.google.com/?q=46.123457,7.987654");
  });

  it("keeps missing coordinates non-finite so the importer can skip them", () => {
    const sighting = createSighting({ lat: Number.NaN, lon: 7 });
    expect(Number.isFinite(sighting.lat)).toBe(false);
    expect(sighting.coordinates).toBe("");
  });

  it("truncates time to HH:MM", () => {
    expect(createSighting({ lat: 1, lon: 1, time: "07:05:59" }).time).toBe("07:05");
  });
});

describe("protocol", () => {
  const base = {
    date: "2024-05-01",
    time: "07:00",
    duration: 60,
    distance: 1.2,
    number_observer: 1,
    primary_purpose: true,
  };

  it("is Traveling above 30 m and Stationary below", () => {
    expect(protocol(base).name).toBe("Traveling");
    expect(protocol({ ...base, distance: 0.02 }).name).toBe("Stationary");
  });

  it("is Incidental when birding was not the primary purpose", () => {
    expect(protocol({ ...base, primary_purpose: false }).name).toBe("Incidental");
  });

  it("is Historical without time, duration or distance", () => {
    expect(protocol({ ...base, time: "" }).name).toBe("Historical");
    expect(protocol({ ...base, duration: 0 }).name).toBe("Historical");
    expect(protocol({ ...base, distance: "" }).name).toBe("Historical");
  });

  it("is Invalid without date or with 24 h or more", () => {
    expect(protocol({ ...base, date: "" }).name).toBe("Invalid");
    expect(protocol({ ...base, duration: 1440 }).name).toBe("Invalid");
  });
});

describe("small helpers", () => {
  it("distanceFromPath sums haversine segments in km", () => {
    // 1 degree of latitude is ~111.19 km
    expect(
      distanceFromPath([
        [0, 0],
        [1, 0],
      ]),
    ).toBeCloseTo(111.19, 1);
    expect(distanceFromPath([[0, 0]])).toBe(0);
  });

  it("formatDate uses the local calendar day (no UTC shift)", () => {
    expect(formatDate("2024-03-05", "/")).toBe("03/05/2024");
    expect(formatDate("")).toBe("");
  });

  it("mathMode returns the most frequent value", () => {
    expect(mathMode(["a", "b", "b", "c"])).toBe("b");
  });

  it("groupByLocation groups points within the distance of a group's first point", () => {
    // 0.00003 degrees of latitude is ~3.3 m.
    const points = [
      { id: 1, lat: 46, lon: 7 },
      { id: 2, lat: 46.00003, lon: 7 },
      { id: 3, lat: 46.00006, lon: 7 },
      { id: 4, lat: 46, lon: 7.1 },
    ];
    const groups = groupByLocation(points, 5);
    expect(groups.map((group) => group.items.map((point) => point.id))).toEqual([[1, 2], [4], [3]]);
  });
});

describe("buildSpeciesRows", () => {
  const sightings = [
    createSighting({
      lat: 1,
      lon: 1,
      ebird_species_code: "gretit1",
      common_name: "Great Tit",
      count: 2,
    }),
    createSighting({
      lat: 1,
      lon: 1,
      ebird_species_code: "gretit1",
      common_name: "Great Tit",
      count: 3,
    }),
    createSighting({
      lat: 1,
      lon: 1,
      ebird_species_code: "blutit",
      common_name: "Blue Tit",
      count: "x",
    }),
  ];

  it("groups by species, sums counts and uses X for uncounted", () => {
    const rows = buildSpeciesRows(sightings, null);
    expect(rows.map(({ common_name, count }) => [common_name, count])).toEqual([
      ["Great Tit", 5],
      ["Blue Tit", "X"],
    ]);
  });

  it("names species through the provided taxonomy lookup", () => {
    const rows = buildSpeciesRows(sightings, null, (s) =>
      s.ebird_species_code === "gretit1" ? "Mésange charbonnière" : s.common_name,
    );
    expect(rows[0].common_name).toBe("Mésange charbonnière");
  });
});

describe("checklistComment", () => {
  it("adds the static map (linked to the interactive map) and the credit line", () => {
    const html = checklistComment(
      { checklist_comment: "Nice morning" },
      [],
      "Imported with ornitho2eBird.",
      {
        staticMapUrl: "https://map.example/img.png",
        interactiveMapUrl: "https://viewer.example/?u=1",
      },
    );
    expect(html).toContain("Nice morning");
    expect(html).toContain(
      '<a href="https://viewer.example/?u=1" target="_blank" rel="noopener"><img src="https://map.example/img.png"',
    );
    expect(html).toMatch(
      /<small><a href="https:\/\/ornitho2ebird.com\/"[^>]*>Imported with ornitho2eBird.<\/a><\/small>$/,
    );
  });
});

describe("distanceReview", () => {
  const walk = [
    [46, 7],
    [46.0001, 7],
    [46.0002, 7],
    [46.0003, 7],
    [46.0004, 7],
  ];

  it("flags an isolated spike below the high-distance threshold without changing the input", () => {
    const form = { path: walk.map((point) => [...point]), distance: 2 };
    form.path[2] = [46.01, 7];
    const original = structuredClone(form);
    expect(distanceReview(form)).toEqual({ gpsSpikeWarning: true, highDistanceWarning: false });
    expect(form).toEqual(original);
  });

  it("keeps high distance separate from suspected GPS errors", () => {
    expect(distanceReview({ path: walk, distance: 21 })).toEqual({
      gpsSpikeWarning: false,
      highDistanceWarning: true,
    });
    expect(distanceReview({ distance: 20 })).toEqual({
      gpsSpikeWarning: false,
      highDistanceWarning: false,
    });
  });

  it("does not flag ordinary walking, small drift or closely spaced parallel paths", () => {
    for (const path of [
      walk,
      [
        [46, 7],
        [46, 7],
        [46.001, 7],
        [46, 7],
        [46, 7],
      ],
      [
        [46, 7],
        [46.0001, 7],
        [46.0002, 7],
        [46.0002, 7.0001],
        [46.0001, 7.0001],
        [46, 7.0001],
      ],
    ]) {
      expect(distanceReview({ path }).gpsSpikeWarning).toBe(false);
    }
  });

  it("does not flag a multi-point excursion or a sparsely sampled route", () => {
    const excursion = [
      [46, 7],
      [46.0001, 7],
      [46.01, 7],
      [46.0101, 7],
      [46.0002, 7],
      [46.0003, 7],
    ];
    const sparse = [
      [46, 7],
      [46.005, 7],
      [46.01, 7],
      [46.005, 7],
      [46, 7],
    ];
    expect(distanceReview({ path: excursion }).gpsSpikeWarning).toBe(false);
    expect(distanceReview({ path: sparse }).gpsSpikeWarning).toBe(false);
  });

  it("does not infer isolated errors at endpoints or from tracks without surrounding steps", () => {
    expect(distanceReview({ path: [[46.01, 7], ...walk.slice(1)] }).gpsSpikeWarning).toBe(false);
    expect(distanceReview({ path: [...walk.slice(0, -1), [46.01, 7]] }).gpsSpikeWarning).toBe(
      false,
    );
    expect(
      distanceReview({
        path: [
          [46, 7],
          [46.01, 7],
          [46, 7],
        ],
      }).gpsSpikeWarning,
    ).toBe(false);
    expect(distanceReview({}).gpsSpikeWarning).toBe(false);
  });
});

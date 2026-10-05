import { describe, expect, it } from "vitest";
import { exportFixture } from "../helpers";

// Golden files: the exported eBird CSV for every fixture, with default settings.
// A diff here means the CSV users upload to eBird changed. If the change is intended,
// review the diff and update the files with `npx vitest run -u`.
const FIXTURES = [
  ["export_small_incidental.json", "ornitho.ch"],
  ["export_normal_with_trace.json", "ornitho.ch"],
  ["export_species_comments.json", "ornitho.ch"],
  ["export_small_with_media.json", "ornitho.ch"],
  ["export_missing_species.json", "ornitho.ch"],
  ["export_gps_high_distance_minimal.json", "ornitho.ch"],
  ["export_Monir_protocol_trace.json", "ornitho.ch"],
  ["export_mixed_large.json", "ornitho.ch"],
  ["export_no_species.json", "ornitho.ch"],
  ["birdlasser_ruai_dandora.csv", "birdlasser"],
  ["birdlasser_trip_kenya_2022.csv", "birdlasser"],
  ["observation_org.csv", "observation.org"],
  ["observation_bulk_fr.csv", "observation.org"],
  ["rules/biolovision_french.txt", "data.biolovision.net"],
  ["rules/biolovision_german.txt", "data.biolovision.net"],
  ["rules/biolovision_italian.txt", "data.biolovision.net"],
  ["rules/biolovision_spanish.txt", "data.biolovision.net"],
  ["rules/biolovision_polish.txt", "data.biolovision.net"],
  ["rules/biolovision_catalan.txt", "data.biolovision.net"],
  ["rules/ornitho_mortality_overnight.json", "ornitho.ch"],
];

describe("eBird CSV export", () => {
  it.each([
    ["transect", ["sessions/transect.csv", "sessions/transect.kml"]],
    ["stationary", ["sessions/stationary.csv", "sessions/stationary.kml"]],
    [
      "multiple",
      [
        "sessions/transect.csv",
        "sessions/stationary.kml",
        "sessions/stationary.csv",
        "sessions/transect.kml",
      ],
    ],
  ])("session %s matches its golden CSV", async (name, files) => {
    const { csv, errors } = await exportFixture(files, "observation.org");
    expect(errors).toEqual([]);
    await expect(csv).toMatchFileSnapshot(`./__snapshots__/sessions/${name}.csv`);
  });
  it.each(FIXTURES)("%s matches its golden CSV", async (fixture, websiteName) => {
    const { csv, errors } = await exportFixture(fixture, websiteName);
    expect(errors).toEqual([]);
    await expect(csv).toMatchFileSnapshot(`./__snapshots__/${fixture.replace(/\.\w+$/, "")}.csv`);
  });
});

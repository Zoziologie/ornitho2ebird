import { beforeAll, describe, expect, it } from "vitest";
import { splitScientificName } from "../../src/lib/exportCsv";
import {
  bundledEbirdTaxa,
  ebirdCodeForScientificName,
  loadScientificNameIndex,
} from "../../src/lib/taxonomy";
import { exportFixture, parseFixture } from "../helpers";

beforeAll(async () => {
  await loadScientificNameIndex();
});

describe("ebirdCodeForScientificName", () => {
  it.each([
    ["Gavia stellata", "retloo"],
    ["  Gavia   stellata ", "retloo"],
    // eBird taxa below and above species.
    ["Acanthis flammea cabaret", "lesred1"],
    ["Larus argentatus x michahellis", "x01182"],
    ["Numenius hudsonicus/phaeopus", "whimbr"],
    ["Larus sp.", "larus1"],
    // Older names, from the ornitho list.
    ["Anas querquedula", "gargan"],
    ["Bubulcus ibis", "categr1"],
    // Source conventions.
    ["Apus spec.", "apus2"],
    ["Columba livia forma domestica", "rocpig1"],
    // Subspecies eBird does not list fall back to the species.
    ["Pycnonotus barbatus tricolor", "combul2"],
    ["Motacilla alba alba / yarrellii", "whiwag"],
  ])("%s → %s", (name, code) => {
    expect(ebirdCodeForScientificName(name)).toBe(code);
  });

  it.each([
    "",
    "Gavia nonexistens",
    // Not a subspecies: a hybrid, or two genera.
    "Gavia stellata x unknownus",
    "Pernis apivorus / Buteo buteo",
    "Plain Martin",
  ])("%j has no eBird code", (name) => {
    expect(ebirdCodeForScientificName(name)).toBe("");
  });
});

describe("bundledEbirdTaxa", () => {
  it("gives the eBird name (not a synonym) of known codes, for when the API is down", () => {
    const taxa = bundledEbirdTaxa(["gargan", "lesred1", "nocode"]);
    expect(taxa.get("gargan")).toEqual({ sciName: "Spatula querquedula" });
    expect(taxa.get("lesred1")).toEqual({ sciName: "Acanthis flammea cabaret" });
    expect(taxa.has("nocode")).toBe(false);
  });
});

describe("splitScientificName", () => {
  it("puts the genus in Genus and everything else in Species", () => {
    expect(splitScientificName("Gavia stellata")).toEqual({ Genus: "Gavia", Species: "stellata" });
    expect(splitScientificName("Columba livia (Feral Pigeon)")).toEqual({
      Genus: "Columba",
      Species: "livia (Feral Pigeon)",
    });
    expect(splitScientificName("")).toEqual({ Genus: "", Species: "" });
  });
});

describe("species columns of the export", () => {
  it("write the eBird scientific name and leave the common name empty", async () => {
    const { rows } = await exportFixture("observation_org.csv", "observation.org");
    const blueTit = rows.find((row) => row.Genus === "Cyanistes");
    expect(blueTit).toMatchObject({ common_name: "", Genus: "Cyanistes", Species: "caeruleus" });
  });

  it("keep the source common name when no eBird taxon is found", async () => {
    const { rows } = await exportFixture("birdlasser_trip_kenya_2022.csv", "birdlasser");
    const starling = rows.find((row) => row.common_name === "Black-bellied Starling");
    expect(starling).toMatchObject({ Genus: "", Species: "" });
  });

  it("find the scientific name among BirdLasser's language columns", async () => {
    const parsed = await parseFixture("birdlasser_ruai_dandora.csv", "birdlasser");
    const pelican = parsed.sightings.find((s) => s.common_name === "Pink-backed Pelican");
    expect(pelican).toMatchObject({
      scientific_name: "Pelecanus rufescens",
      ebird_species_code: "pibpel1",
    });
  });
});

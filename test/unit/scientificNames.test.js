import { beforeAll, describe, expect, it } from "vitest";
import { splitScientificName } from "../../src/lib/exportCsv";
import {
  bundledEbirdTaxa,
  ebirdCodeForScientificName,
  getOrnithoEbirdSpeciesCode,
  loadScientificNameIndex,
  loadOrnithoSpeciesList,
} from "../../src/lib/taxonomy";
import { exportFixture, parseFixture } from "../helpers";
import observationTaxa from "../fixtures/observation_taxa.json";

beforeAll(async () => {
  await loadScientificNameIndex();
  await loadOrnithoSpeciesList();
});

it("distinguishes the Faune-France flycatcher species and their unidentified group", () => {
  expect(getOrnithoEbirdSpeciesCode("457")).toBe("spofly2");
  expect(getOrnithoEbirdSpeciesCode("38659")).toBe("spofly3");
  expect(getOrnithoEbirdSpeciesCode("62615")).toBe("spofly1");
});

it.each([
  ["1037", "y00648"],
  ["1502", "swan1"],
  ["13065", "skua"],
  ["19482", "shrike"],
  ["1522", "leswhi2"],
  ["447", "comchi3"],
  ["1448", "blkred1"],
  ["1431", "whbwoo9"],
  ["1424", "barowl2"],
  ["1425", "barowl2"],
  ["54602", "chlido1"],
  ["1224", "snipe2"],
  ["1539", "y00950"],
  ["54330", "y00814"],
  ["50606", "gnwtea1"],
])("keeps the reviewed eBird mapping for ornitho %s", (id, code) => {
  expect(getOrnithoEbirdSpeciesCode(id)).toBe(code);
});

describe("ebirdCodeForScientificName", () => {
  it("maps all 311 bird taxa from the supplied Observation bulk export using the shared index", () => {
    expect(Object.keys(observationTaxa)).toHaveLength(311);
    for (const [name, code] of Object.entries(observationTaxa)) {
      expect(ebirdCodeForScientificName(name), name).toBe(code);
    }
  });
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
    ["Pernis apivorus / Buteo buteo", "hawk"],
    // Legacy names that span a 2026 split remain at the broader taxon.
    ["Muscicapa striata", "spofly1"],
    ["Muscicapa tyrrhenica", "spofly3"],
    ["Muscicapa striata tyrrhenica", "spofly10"],
    ["Muscicapa striata balearica", "spofly9"],
    ["Tringa semipalmata", "willet1"],
    ["Turdus albicollis", "whnrob1"],
    ["Cistothorus palustris", "marwre"],
    ["Cymbirhynchus macrorhynchos", "barbro1"],
    ["Myophonus caeruleus", "blwthr1"],
    ["Myophonus caeruleus temminckii", "yebwht1"],
    ["Oenanthe lugens", "mouwhe2"],
    ["Patagona gigas", "giahum1"],
    ["Psalidoprocne nitens", "sqtsaw1"],
    ["Pycnonotus plumosus", "olwbul1"],
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

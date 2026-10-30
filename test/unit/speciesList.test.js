import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Papa from "papaparse";
import { describe, expect, it } from "vitest";
import {
  SPECIES_LIST_JSON,
  formatShortList,
  readSpeciesList,
  toShortList,
} from "../../build/speciesList.js";

describe("ornitho species list", () => {
  const { rows, errors } = readSpeciesList();

  it("has unique numeric ids and well-formed eBird codes", () => {
    expect(errors).toEqual([]);
  });

  it("is compiled: the short list matches the CSV (run `npm run splist`)", () => {
    expect(readFileSync(SPECIES_LIST_JSON, "utf8")).toBe(formatShortList(toShortList(rows)));
  });

  it("reports new and changed country taxa without removing other mappings", () => {
    const dir = mkdtempSync(join(tmpdir(), "ornitho-compare-"));
    try {
      const input = join(dir, "country.csv");
      const output = join(dir, "review.csv");
      const existing = rows.find((row) => row.id === "457");
      const unmapped = rows.find((row) => !row.ebird_species_code);
      writeFileSync(
        input,
        Papa.unparse([
          {
            id: existing.id,
            common_name: existing.ornitho_english,
            scientific_name: "Changed name",
          },
          {
            id: unmapped.id,
            common_name: unmapped.ornitho_english,
            scientific_name: unmapped.ornitho_latin,
          },
          { id: "99999999", common_name: "New species", scientific_name: "Muscicapa tyrrhenica" },
        ]),
      );
      execFileSync(process.execPath, ["build/compare-ornitho-species.js", input, output]);
      const review = Papa.parse(readFileSync(output, "utf8"), {
        header: true,
        skipEmptyLines: true,
      }).data;
      expect(review).toHaveLength(3);
      expect(review[0]).toMatchObject({
        changes: "scientific name changed",
        id: "457",
        current_ebird_code: "spofly2",
      });
      expect(review[1].changes).toBe("unmapped");
      expect(review[2]).toMatchObject({ changes: "new ID", exact_name_ebird_code: "spofly3" });
      expect(readSpeciesList().rows).toEqual(rows);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("reports changed eBird concepts and stale legacy names without silently remapping", () => {
    const dir = mkdtempSync(join(tmpdir(), "taxonomy-update-"));
    try {
      mkdirSync(join(dir, "build"));
      mkdirSync(join(dir, "data"));
      mkdirSync(join(dir, "src/lib"), { recursive: true });
      for (const file of [
        "package.json",
        "build/update-taxonomy.js",
        "build/speciesList.js",
        "src/lib/constants.js",
      ]) {
        copyFileSync(file, join(dir, file));
      }
      symlinkSync(join(process.cwd(), "node_modules"), join(dir, "node_modules"));
      writeFileSync(
        join(dir, "data/ornitho_species_list_full.csv"),
        "id,ornitho_english,ornitho_latin,ebird_species_code\n1,Test,Genus species,test1\n",
      );
      writeFileSync(
        join(dir, "data/ebird_scientific_names.json"),
        JSON.stringify({ names: { "Genus species": "test1" } }),
      );
      writeFileSync(
        join(dir, "data/ornitho_legacy_names.json"),
        JSON.stringify({ "Old name": "retired" }),
      );
      writeFileSync(
        join(dir, "mock.mjs"),
        `globalThis.fetch = async () => ({ ok: true, json: async () => [{speciesCode: "test1", sciName: "Genus species/other", comName: "Test group"}] });`,
      );
      const report = execFileSync(
        process.execPath,
        ["--import", "./mock.mjs", "build/update-taxonomy.js"],
        { cwd: dir, encoding: "utf8" },
      );
      expect(report).toContain("Genus species → Genus species/other");
      expect(report).toContain("Old name: `retired`");
      expect(readFileSync(join(dir, "data/ornitho_species_list_short.json"), "utf8")).toContain(
        '"1": "test1"',
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

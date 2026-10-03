import { readFileSync } from "node:fs";
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
});

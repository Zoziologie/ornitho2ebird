import { beforeAll, describe, expect, it } from "vitest";
import { buildExportRows, exportableFormsOf, groupSightingsByForm } from "../../src/lib/exportCsv";
import { parseImportFile } from "../../src/lib/importers";
import { loadOrnithoSpeciesList } from "../../src/lib/taxonomy";
import { assembleImport } from "../../src/lib/utils";
import { DEFAULT_SETTINGS } from "../../src/lib/constants";
import { exportFixture, parseFixture, readFixture, website } from "../helpers";

beforeAll(() => loadOrnithoSpeciesList());

describe("Ornitho protection and validation", () => {
  it("preserves the new French review examples without treating legal protection as hidden data", async () => {
    const parsed = await parseFixture("rules/ornitho_flags_fr.json", "faune-france.org");
    const sightings = [...parsed.sightings, ...parsed.formsSightings.flat()];
    expect(sightings).toHaveLength(6);
    expect(sightings.find((s) => s.id === "44105705")).toMatchObject({
      hidden: true,
      admin_hidden_type: "refused",
    });
    expect(sightings.find((s) => s.id === "94411430")).toMatchObject({
      hidden: false,
      admin_hidden_type: "incomplete",
      form_id: 1,
    });
    expect(sightings.find((s) => s.id === "51584243")).toMatchObject({
      hidden: true,
      admin_hidden_type: "question",
    });
    expect(sightings.find((s) => s.id === "62836635")).toMatchObject({
      hidden: false,
      admin_hidden_type: "question",
      committees_validation: { chn: "REQUESTED" },
    });
    expect(sightings.find((s) => s.id === "70938324")).toMatchObject({
      hidden: true,
      admin_hidden_type: "question",
      committees_validation: { chn: "REQUESTED" },
    });
    expect(sightings.find((s) => s.id === "59112386")).toMatchObject({
      hidden: false,
      admin_hidden_type: "question",
      form_id: 2,
      committees_validation: { chr: "REQUESTED" },
    });
    const { rows } = await exportFixture("rules/ornitho_flags_fr.json", "faune-france.org");
    expect(rows).toHaveLength(5);
    expect(rows.some((r) => r.species_comment.includes("44105705"))).toBe(false);
    expect(rows.find((r) => r.Genus === "Falco").species_comment).toContain("pas 100% sur");
    expect(rows.find((r) => r.species_comment.includes("62836635")).species_comment).toContain(
      "CHN: documentation required by the rarities committee",
    );
    expect(rows.find((r) => r.species_comment.includes("59112386")).species_comment).toContain(
      "CHR: documentation required by the rarities committee",
    );
  });

  it("processes all 512 combinations of protection, administrative status and three independent committees", () => {
    const original = JSON.parse(readFixture("rules/ornitho_flags.json")).data.sightings[0];
    const statuses = ["", "ACCEPTED", "REJECTED", "REQUESTED"];
    for (const hidden of ["0", "1"])
      for (const admin of ["", "incomplete", "question", "refused"])
        for (const cavs of statuses)
          for (const chn of statuses)
            for (const chr of statuses) {
              const committees = Object.fromEntries(
                Object.entries({ cavs, chn, chr }).filter(([, status]) => status),
              );
              for (const context of ["casual", "list"]) {
                const control = structuredClone(original);
                control.observers[0].count = "3";
                control.observers[0].comment = "control note";
                const candidate = structuredClone(original);
                Object.assign(candidate.observers[0], {
                  id_sighting: "900000010",
                  count: "5",
                  comment: "candidate note",
                  hidden,
                  admin_hidden: admin ? "1" : "0",
                  admin_hidden_type: admin,
                  committees_validation: committees,
                });
                const records = [control, candidate];
                const parsed = parseImportFile(
                  JSON.stringify({
                    data:
                      context === "casual"
                        ? { sightings: records }
                        : {
                            forms: [
                              {
                                time_start: "00:00:00",
                                time_stop: "00:30:00",
                                full_form: "1",
                                lat: "47.615346",
                                lon: "8.816677",
                                sightings: records,
                              },
                            ],
                          },
                  }),
                  website("faune-france.org"),
                );
                const result = assembleImport(parsed, {
                  ...DEFAULT_SETTINGS,
                  speciesCommentTemplate: null,
                });
                const forms = exportableFormsOf(result.forms);
                const sightingsByFormId = groupSightingsByForm(
                  forms,
                  result.sightings,
                  result.formsSightings,
                );
                for (const template of [
                  null,
                  { short: "", long: "", limit: 1 },
                  { short: "${s.comment}", long: "${s.comment}", limit: 1 },
                ]) {
                  const label = JSON.stringify({ hidden, admin, committees, context, template });
                  const { rows, errors } = buildExportRows({
                    exportableForms: forms,
                    sightingsByFormId,
                    speciesCommentTemplate: template,
                    importedWithText: "Imported with",
                  });
                  expect(errors, label).toEqual([]);
                  expect(rows, label).toHaveLength(1);
                  expect(rows[0].count, label).toBe(admin === "refused" ? 3 : 8);
                  for (const [committee, status] of Object.entries(committees)) {
                    const name = committee === "cavs" ? "CAvS" : committee.toUpperCase();
                    const description = {
                      ACCEPTED: "accepted",
                      REJECTED: "rejected",
                      REQUESTED: "documentation required",
                    }[status];
                    expect(rows[0].species_comment.includes(`${name}: ${description}`), label).toBe(
                      admin !== "refused",
                    );
                  }
                  expect(rows[0].species_comment.includes("900000010"), label).toBe(
                    admin !== "refused" && Object.keys(committees).length > 0,
                  );
                  expect(rows[0].species_comment.includes("candidate note"), label).toBe(
                    admin !== "refused" && Boolean(template?.short),
                  );
                  expect(rows[0].species_comment.includes("control note"), label).toBe(
                    Boolean(template?.short),
                  );
                }
              }
            }
  });
  it("preserves protection and review status without confusing them", async () => {
    const parsed = await parseFixture("rules/ornitho_flags.json", "ornitho.ch");
    expect(parsed.sightings.find((s) => s.id === "38325491")).toMatchObject({
      hidden: true,
      admin_hidden_type: "",
    });
    expect(parsed.sightings.find((s) => s.id === "38325498")).toMatchObject({
      hidden: false,
      admin_hidden_type: "incomplete",
    });
    expect(parsed.sightings.find((s) => s.id === "15800381")).toMatchObject({
      hidden: true,
      admin_hidden_type: "refused",
      committees_validation: { cavs: "REQUESTED" },
    });
    expect(parsed.sightings.find((s) => s.id === "3916932")).toMatchObject({
      hidden: false,
      admin_hidden_type: "refused",
    });
  });

  it("keeps protected and incomplete records, excluding refused counts before merging", async () => {
    const { rows } = await exportFixture("rules/ornitho_flags.json", "ornitho.ch");
    expect(rows.some((r) => r.Genus === "Poecile" && r.Species === "palustris")).toBe(true);
    expect(rows.some((r) => r.Genus === "Tetrao" && r.Species === "urogallus")).toBe(true);
    expect(rows.some((r) => r.Genus === "Periparus" && r.Species === "ater")).toBe(true);
    expect(rows.some((r) => r.species_comment.includes("15800381"))).toBe(false);
    expect(rows.some((r) => r.species_comment.includes("3916932"))).toBe(false);
    expect(rows.find((r) => r.species_comment.includes("900000001")).count).toBe(3);
    expect(rows.some((r) => r.species_comment.includes("900000002"))).toBe(false);
  });

  it("keeps conflicting committee decisions attributed to their own records when species are merged", async () => {
    const parsed = await parseFixture("rules/ornitho_flags.json", "ornitho.ch");
    const second = parsed.formsSightings[0][1];
    second.admin_hidden_type = "question";
    second.committees_validation = { cavs: "REJECTED", chr: "ACCEPTED" };
    const result = assembleImport(parsed, { ...DEFAULT_SETTINGS, speciesCommentTemplate: null });
    const forms = exportableFormsOf(result.forms);
    const { rows } = buildExportRows({
      exportableForms: forms,
      sightingsByFormId: groupSightingsByForm(forms, result.sightings, result.formsSightings),
      speciesCommentTemplate: { short: "", long: "", limit: 1 },
      importedWithText: "Imported with",
    });
    const row = rows.find((r) => r.species_comment.includes("900000001"));
    expect(row.count).toBe(103);
    expect(row.species_comment.split("<br/>")).toEqual([
      'CAvS: accepted by the Swiss rarities committee (ornitho.ch, 2026-10-14; <a href="https://www.ornitho.ch/index.php?m_id=54&id=900000001">original observation</a>)',
      'CAvS: rejected by the Swiss rarities committee (ornitho.ch, 2026-10-14; <a href="https://www.ornitho.ch/index.php?m_id=54&id=900000002">original observation</a>)',
      'CHR: accepted by the rarities committee (ornitho.ch, 2026-10-14; <a href="https://www.ornitho.ch/index.php?m_id=54&id=900000002">original observation</a>)',
    ]);
  });

  it("always exports each committee status with source attribution, including with no optional comments", async () => {
    const { parsed, forms } = await exportFixture("rules/ornitho_flags.json", "ornitho.ch");
    const exportableForms = exportableFormsOf(forms);
    const input = {
      exportableForms,
      sightingsByFormId: groupSightingsByForm(
        exportableForms,
        parsed.sightings,
        parsed.formsSightings,
      ),
      importedWithText: "Imported with",
    };
    for (const speciesCommentTemplate of [null, { short: "", long: "", limit: 1 }]) {
      const { rows, errors } = buildExportRows({ ...input, speciesCommentTemplate });
      expect(errors).toEqual([]);
      expect(rows.find((r) => r.species_comment.includes("900000001")).species_comment).toContain(
        "CAvS: accepted by the Swiss rarities committee",
      );
      expect(rows.find((r) => r.species_comment.includes("900000003")).species_comment).toContain(
        "CAvS: rejected by the Swiss rarities committee",
      );
      expect(rows.find((r) => r.species_comment.includes("900000004")).species_comment).toContain(
        "CAvS: documentation required by the Swiss rarities committee",
      );
      expect(rows.find((r) => r.species_comment.includes("900000001")).species_comment).toContain(
        "ornitho.ch, 2026-10-14",
      );
    }
    [...input.sightingsByFormId.values()].flat().forEach((s) => (s.admin_hidden_type = "refused"));
    const { rows } = buildExportRows(input);
    expect(rows).toEqual([]);
  });
});

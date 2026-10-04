// Offline calibration against the maintainer's review; no locations or CSVs are changed.
import { readFileSync, writeFileSync } from "node:fs";
import { createServer } from "vite";

const server = await createServer({ server: { middlewareMode: true } });
try {
  const { loadOrnithoSpeciesList } = await server.ssrLoadModule("/src/lib/taxonomy.js");
  await loadOrnithoSpeciesList();
  const { parseImportFile } = await server.ssrLoadModule("/src/lib/importers.js");
  const { assembleImport, haversineDistanceKm } = await server.ssrLoadModule("/src/lib/utils.js");
  const { DEFAULT_SETTINGS } = await server.ssrLoadModule("/src/lib/constants.js");
  const { hotspotEvidence, rankHotspots } = await server.ssrLoadModule(
    "/src/lib/hotspotMatching.js",
  );
  const review = JSON.parse(readFileSync("test/fixtures/hotspots/maintainer-review.json", "utf8"));
  const websites = JSON.parse(readFileSync("data/websites_list.json", "utf8"));
  const imported = assembleImport(
    parseImportFile(
      readFileSync(`test/fixtures/${review.fixture}`, "utf8"),
      websites.find((website) => website.name === "ornitho.ch"),
    ),
    DEFAULT_SETTINGS,
  );
  const cases = review.labels.map((label) => {
    const form = imported.forms.find((form) => form.id === label.id);
    const evidence = hotspotEvidence(form, [
      ...(imported.formsSightings[form.id - 1] || []),
      ...imported.sightings.filter((sighting) => sighting.form_id === form.id),
    ]);
    // Replay discovery against the frozen candidate inventory, including the corrected areas.
    const hotspots = review.hotspots.filter((hotspot) =>
      evidence.anchors.some(
        (anchor) =>
          haversineDistanceKm(
            ...anchor.map((value) => Number(value.toFixed(2))),
            hotspot.lat,
            hotspot.lng,
          ) <= 10,
      ),
    );
    return { ...label, evidence, ranking: rankHotspots(evidence, hotspots) };
  });
  const decision = (item, minimumScore, minimumDominance) => {
    const top = item.ranking.candidates[0];
    if (!top || top.score < minimumScore) return null;
    if (
      item.evidence.source === "location" ||
      (item.evidence.count < 3 && item.evidence.radius > 1)
    )
      return null;
    // An early bird position does not establish the observer's starting point.
    if (item.evidence.source === "sightings" && top.interpretation === "start") return null;
    const dominance = item.ranking.margin == null ? 1 : item.ranking.margin / top.score;
    return dominance >= minimumDominance ? top.hotspot.locId : null;
  };
  const evaluate = (items, minimumScore, minimumDominance) => {
    let correct = 0;
    let wrongMatches = 0;
    let missedMatches = 0;
    for (const item of items) {
      const selected = decision(item, minimumScore, minimumDominance);
      if (item.accepted.includes(selected)) correct++;
      else if (selected) wrongMatches++;
      else missedMatches++;
    }
    return { total: items.length, correct, wrongMatches, missedMatches };
  };
  const labelled = cases.filter((item) => !review.unresolved.includes(item.id));
  const calibration = labelled.filter((item) => item.split === "calibration");
  const validation = labelled.filter((item) => item.split === "validation");
  const trials = [];
  for (const minimumScore of [20, 25, 30, 35, 40, 45, 50, 55, 60, 65]) {
    for (const minimumDominance of [0.4, 0.5, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9]) {
      const result = evaluate(calibration, minimumScore, minimumDominance);
      trials.push({
        minimumScore,
        minimumDominance,
        ...result,
        loss: 5 * result.wrongMatches + result.missedMatches,
      });
    }
  }
  trials.sort(
    (a, b) =>
      a.loss - b.loss || b.minimumScore - a.minimumScore || b.minimumDominance - a.minimumDominance,
  );
  const best = trials[0];
  const output = {
    fixture: review.fixture,
    method:
      "Frozen eBird inventory; candidate-ID grouped holdout, fixed before fitting. Wrong selections cost five times abstentions. This is exploratory validation on one import, not general accuracy.",
    parameters: { minimumScore: best.minimumScore, minimumDominance: best.minimumDominance },
    calibration: evaluate(calibration, best.minimumScore, best.minimumDominance),
    validation: evaluate(validation, best.minimumScore, best.minimumDominance),
    cases: cases.map((item) => ({
      id: item.id,
      location: item.location,
      split: item.split,
      accepted: item.accepted,
      unresolved: review.unresolved.includes(item.id),
      source: item.evidence.source,
      trackRejected: item.evidence.trackRejected,
      trackSeparationKm: item.evidence.trackSeparation,
      top: item.ranking.candidates[0]?.hotspot.locId || null,
      topName: item.ranking.candidates[0]?.hotspot.locName || null,
      score: item.ranking.candidates[0]?.score || 0,
      margin: item.ranking.margin,
      selected: decision(item, best.minimumScore, best.minimumDominance),
      ...(item.note ? { note: item.note } : {}),
    })),
  };
  writeFileSync("docs/hotspot-calibration.json", `${JSON.stringify(output, null, 2)}\n`);
  console.log(
    JSON.stringify(
      {
        parameters: output.parameters,
        calibration: output.calibration,
        validation: output.validation,
      },
      null,
      2,
    ),
  );
} finally {
  await server.close();
}

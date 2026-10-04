# Automatic hotspot matching (#60)

Newly imported and created checklists are matched once in both modes. Clear winners use
the hotspot’s exact coordinates and eBird ID; other results keep the original location.
Manual location edits and replacement imports take precedence over pending lookups.
The export waits for lookups to finish; failed requests preserve the original location.
Customized mode retains manual hotspot selection on the map. No scores, comparison
panels or report downloads are exposed in the interface.

The same hotspot may rank first for several checklists. There is no allocation constraint.
A high score describes geographic fit, not a probability or a verified site boundary.
Automatic selection now uses the confidence rule calibrated below.

## Evidence and candidate discovery

- Without a track, use distinct sighting positions (six-decimal coordinate keys), with no
  weight for species repetitions or bird counts. Positions without coordinates are omitted.
- With a geographically consistent track, use the observer's route as the main evidence and sightings as a small
  complementary signal. Imported tracks currently contain coordinates without timestamps,
  so resample into 65 positions at equal distances. Time sampling requires timestamped tracks.
- Remove at most the outer 5% of distinct sighting positions around their median centre.
  Fewer than 20 positions lose no points. This can also trim real distant birds; raw sighting
  positions remain in the report for review.
- For tracks, identify the same spatial extremes but remove them only when isolated from
  adjacent fixes by large jumps (greater than both 50 m and ten median nonzero step lengths).
  Continuous route ends remain, including a legitimate parking/start position. This GPS
  rule is provisional and may retain sustained GPS errors or remove real jumps.
- A sighting-based start requires timestamps on every located sighting and one distinct
  position at the earliest timestamp. Otherwise no start is inferred. A removed GPS start
  is not used as an anchor.
- Use only the checklist marker when no other positions exist, with low evidence quality.

Query eBird within 10 km of the median centre, a reliable start, and up to three additional
spread-out supported positions. Additional positions are added when more than 5 km from
existing anchors. Search centres are rounded to 0.01 degrees, and responses are reused
across nearby checklists; IDs are deduplicated. Failed requests are not cached and the UI
offers retry. Discovery is bounded, so very large or dispersed visits can still miss candidates.
The search radius is not a matching criterion.

## Score version 2

All distances below are in kilometres. Let `R` be the largest distance of a retained/sampled
position from the median centre, `D50` and `D95` the median and 95th-percentile distances
from the candidate to those positions, and `D20` their lower 20% distance.

Compare three interpretations:

- **Site centre:** `exp(-centre_distance / (0.2 + 0.35 * R))`.
- **Route start:** `exp(-start_distance / 0.2)`, or zero without a reliable start.
- **Observation cluster:** `0.75 * exp(-D20 / 0.2)`. The discount discourages selecting
  a hotspot merely because part of a long route passes nearby.

Use the strongest interpretation as alignment. Spatial support is the mean of
`exp(-D50 / (0.4 + R))` and `exp(-D95 / (0.6 + 2 * R))`.
With a track and sightings, blend 90% of this route support with 10% of
`exp(-median_sighting_distance / (0.4 + R))`.

Evidence quality is `min(1, 0.6 + 0.08 * distinct_position_count)`, or 0.35 for a
checklist-marker-only fallback. The final score is:

```text
100 * evidence_quality * (0.65 * alignment + 0.35 * spatial_support)
```

The scoring result retains the winning interpretation, `D50`, `D95`, and the lead over
the runner-up for offline analysis. These scales and weights are starting hypotheses, not empirically calibrated defaults.

The updated confidence categories use the maintainer's labelled comparison: a best score
of at least 25 and a lead of at least 40% of that score. This relative lead compares the
winner with its competitors rather than accepting every candidate within a distance.
An earliest sighting interpreted as a route start always remains for manual review: bird
positions do not establish the observer's starting point. A single sighting can support a
clear geographic match when competing sites fit much worse; marker-only evidence remains
insufficient. Only the clear category selects a location.
Scores can remain high for an inappropriate site, especially when nearby general hotspots
and subsites cannot be distinguished geographically. Human review remains necessary.

## Offline calibration report

## Verification

Unit scenarios cover parking starts, a route around a lake, isolated distant birds versus a
substantial distant group, duplicate positions/bird counts, small samples, close competitors,
a distant lone candidate, uneven GPS sampling, spikes, timestamp ambiguity, discovery cache
reuse and retries. These are controlled geographic examples, not a labelled real-world benchmark.

Browser regressions verify automatic matching in Basic and Customized modes reaches
the CSV as the hotspot ID with exact coordinates, ambiguous choices preserve original
locations, and manual edits clear the association. Offline golden files do not query eBird.

A local run on 4 October 2026 compared all 70 checklists from `export_mixed_large.json`
with live eBird candidates: 16 clear leaders, 28 weak fits, 25 with insufficient evidence,
and 1 ambiguous comparison. These are model categories, not measured correctness.
For Le Pont – Lac Brenet the two leading candidates scored approximately 51 and 49;
the experiment therefore kept that close choice for human review. No locations were changed.

## Maintainer calibration, 4 October 2026

The 70 reference choices are saved in
`test/fixtures/hotspots/maintainer-review.json`, including explicit hotspot IDs, no-match
choices, and cases where either result is acceptable. Unmentioned checklists use the
first suggestion from the reviewed version-1 report, frozen by ID rather than interpreted
as the first result of a later algorithm. “No match” keeps the existing checklist location.

Checklists 22 and 31 reject the old suggestions but mention an unidentified nearby hotspot;
they remain unresolved and are excluded from fitting and accuracy totals. Checklist 24
explicitly requires Luxburger Bucht--Luxburg (`L5165262`). Checklist 35 requires no match
with its current sighting-only evidence; Festhalle is conditional on a supporting route,
which this checklist does not contain.

Before candidate discovery, measure each distinct sighting's nearest distance to the GPS
route. If their median exceeds 1 km, ignore that route for hotspot matching and use sightings.
This catches the copied/unrelated tracks in 22, 24 and 31, while a minority of distant birds
cannot trigger rejection. It is an evidence-consistency heuristic, not a hotspot distance
cutoff. A genuine route can still be rejected when most recorded birds are distant. The
original track, checklist effort and observations are preserved. Candidate discovery now finds Luxburger Bucht for 24 and Plage
de la Dullive for 31.

Run `npm run hotspots:calibrate` to replay the import offline against the frozen inventory
of 650 eBird hotspots retrieved during review. Candidates are filtered using the same
rounded search centres and 10 km discovery radius. The inventory is not a complete eBird
catalogue. The script writes `docs/hotspot-calibration.json` with every decision and the
parameter search outcome. The report does not alter checklist locations or CSVs.

A deterministic split groups cases sharing the original top-candidate ID; the split was
fixed before fitting. Parameter selection uses only the 47 calibration cases, penalizing
wrong hotspot selections five times more than missed matches. The selected score floor 25
and relative lead 40% match all 47 calibration labels. Of 21 held-out cases, 20 agree;
there are zero wrong selections and one abstention (24). Its correct hotspot ranks first,
but the lead over its competitor remains too small for a clear match.

These figures describe one reviewed import, including user-acceptable abstentions. They
are not a probability or an accuracy estimate for new users. The no-match in 26 lies close
to the chosen relative-lead boundary, and geographically adjacent sites can occur across
the split. Further independent reviews can refine this rule; current automatic selection uses the
calibrated clear category.

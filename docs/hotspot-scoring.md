# Experimental hotspot scoring (#60)

Customized mode shows up to five ranked hotspot suggestions below the checklist map.
The selected location changes only when the user chooses **Use as checklist location**.
**Restore previous location** undoes hotspot choices, preserving checklist membership,
effort and species. Editing the name or moving the location discards this undo snapshot,
so undo cannot overwrite a later manual location edit.

The same hotspot may rank first for several checklists. There is no allocation constraint.
A high score is an experimental geographic fit, not a probability or a verified site boundary.
Automatic assignment is deliberately deferred until real examples have been reviewed.

## Evidence and candidate discovery

- Without a track, use distinct sighting positions (six-decimal coordinate keys), with no
  weight for species repetitions or bird counts. Positions without coordinates are omitted.
- With a track, use the observer's route as the main evidence and sightings as a small
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

## Score version 1

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

The panel shows the winning interpretation, `D50`, `D95`, and the lead over the runner-up.
The report retains all candidates and component values so alternative weights can be
compared. These scales and weights are starting hypotheses, not empirically calibrated defaults.

Provisional descriptions distinguish no candidates, fewer than three distinct positions,
a best score below 65, a lead below 15 points, and a clear leader. A single candidate
still needs adequate evidence and overall fit. None of these categories selects a location.
Scores can remain high for an inappropriate site, especially when nearby general hotspots
and subsites cannot be distinguished geographically. Human review remains necessary.

## Local comparison report

**Download comparison for all checklists** produces `hotspot-comparison.json`. It snapshots
all checklists before querying, includes their current locations and protocols, evidence,
rankings and scoring version, and changes neither locations nor CSVs. A failed lookup
aborts the report with a visible retry message; partial data are not represented as complete.
The file contains observation positions and stays local. No report is published or sent away;
only candidate search centres are sent to eBird, as for hotspot discovery in the map.

Use the report to label whether a top candidate is correct, incorrect, or ambiguous before
choosing score scales or enabling automatic assignment. Review parking/trailhead and lake
cases, sighting-only checklists, distant birds, small samples, repeated positions, adjacent
hotspots, unsuitable lone candidates, and several checklists sharing a hotspot. Test chosen
parameters on other examples rather than only those used to tune them.

## Verification

Unit scenarios cover parking starts, a route around a lake, isolated distant birds versus a
substantial distant group, duplicate positions/bird counts, small samples, close competitors,
a distant lone candidate, uneven GPS sampling, spikes, timestamp ambiguity, discovery cache
reuse and retries. These are controlled geographic examples, not a labelled real-world benchmark.

The browser regression verifies selecting a suggestion reaches the CSV as the hotspot ID,
undo restores the original CSV, and downloading the comparison preserves the export.
Existing golden CSVs remain unchanged until a user explicitly accepts a hotspot.

A local run on 4 October 2026 compared all 70 checklists from `export_mixed_large.json`
with live eBird candidates: 16 clear leaders, 28 weak fits, 25 with insufficient evidence,
and 1 ambiguous comparison. These are model categories, not measured correctness.
For Le Pont – Lac Brenet the two leading candidates scored approximately 51 and 49;
the experiment therefore kept that close choice for human review. No locations were changed.

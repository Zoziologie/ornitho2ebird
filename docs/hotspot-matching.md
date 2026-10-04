# Investigating hotspot matching (#52)

Previously, the app's hotspot button copied `locName`, `lat` and `lng` from the eBird API.
The store keeps those coordinates without rounding. Export writes them directly;
location names are trimmed, normalized to Unicode NFC and limited to 128 characters.
The CSV has 19 columns and no dedicated location-ID column. The app currently leaves
state and country blank. The previous implementation did not retain `locId` in the checklist.

The fix retains `locId` as `hotspot_id` and writes it in the CSV's location-name column.
The editor still displays the readable name. Changing the name or coordinates clears the
hotspot association; effort edits and date splits preserve it and its exact coordinates.

The end-to-end test in `test/e2e/customized.spec.js` selects a hotspot with an accented
name and seven-decimal coordinates, then checks that the downloaded CSV contains its
ID and coordinates. It also checks that renaming the location clears the association.
This checks our export, not eBird's matching algorithm. All eBird requests in that
test are stubbed.

[eBird's import instructions](https://support.ebird.org/en/support/solutions/articles/48000907878)
allow omitted coordinates and describe selecting hotspots during Fix Locations.
They do not promise automatic hotspot matching from an exact name and coordinates.
The location-ID approach is supported by the live tests below rather than those instructions.

## Results on 4 October 2026

The maintainer tested the synthetic files for Rochers de Clé (`L5860421`):

- `01-exact.csv`: reported that automatic hotspot matching failed. The resulting
  location ID and whether Fix Locations appeared have not been recorded.
- `03-no-coordinates.csv`: the screenshot shows Fix Locations with one unknown
  location, named Rochers de Clé, and a "choose locations..." link. The exact name
  alone did not match automatically; manual selection is required.
- `04-location-id.csv`: the maintainer reported that it worked. Writing `L5860421`
  in the location-name column matched the hotspot, with its exact coordinates retained.

Omitting coordinates therefore does not solve automatic matching in this case.
The maintainer also tested `04-location-id.csv` for Col des Mosses (`L5565145`) and
reported successful matching. The ID approach therefore worked for two distinct hotspots.
The rounded-coordinate and region-code variants remain untested. Account language,
prior location use and results in other accounts have not been recorded.

## Prepare the experiment

Choose a real checklist that belongs at the target hotspot and download its CSV from
the app. Pass that CSV, the hotspot ID from its eBird URL, and an output folder:

```sh
node build/make-hotspot-test.js /path/to/export.csv L5860421 /tmp/hotspot-test
```

The script fetches the hotspot's current details and saves them in `hotspot.json`.
It takes only the first checklist in the CSV and writes five variants. Species,
date, time, effort and comments remain the same. Ensure the first checklist really
belongs at the chosen hotspot before using these files.

| File | Difference from exact name and coordinates | Question |
| --- | --- | --- |
| `01-exact.csv` | None | Does our current approach match? |
| `02-rounded.csv` | Coordinates rounded to six decimals | Does precision affect matching? |
| `03-no-coordinates.csv` | Both coordinate fields empty | Does Fix Locations let us choose the hotspot before submission? |
| `04-location-id.csv` | Hotspot ID replaces the name | Does the importer recognize an ID here, or treat it as a literal name? |
| `05-region-codes.csv` | State and country supplied | Does regional context affect matching? |

The ID variant is experimental, not a documented eBird feature. If rounding does
not change either coordinate, skip that variant. If the original CSV already has
the same region codes, the region variant is also redundant.

## Run and record

Import one file at a time using **Record Format (Extended)**. Imports can submit
checklists immediately: these files are not previews. Use a test account for synthetic
fixtures; use only real observations in your normal account. Remove each test import
before the next so it cannot create duplicates or influence subsequent matching.

Record the account's language and whether that account previously used the hotspot
or has a personal location with the same name. Existing locations may affect matching.
If possible, compare accounts with and without prior use of the hotspot.

For each variant record:

| Variant | Fix Locations shown? | Automatic hotspot link? | Resulting location ID | Notes |
| --- | --- | --- | --- | --- |
| Exact | | | | |
| Rounded | | | | |
| No coordinates | | | | |
| Location ID | | | | |
| Region codes | | | | |

Check the resulting checklist's actual hotspot link, not only its displayed name.
For the no-coordinates variant, record automatic matching separately from a hotspot
you manually selected in Fix Locations.

## Interpreting results

- If only region codes work, retain the selected hotspot's region metadata and export it.
- The ID worked for Rochers de Clé and Col des Mosses. Tests in another account would
  provide further confirmation.
- If omitted coordinates expose a usable Fix Locations step, consider an explicit export
  option for selected hotspots. Keep their coordinates in the app; do not change other locations.
- If none match automatically, keep exact coordinates and the FAQ's merge workaround.
  [eBird's location guide](https://support.ebird.org/en/support/solutions/articles/48000850891-how-to-choose-locations-in-ebird)
  describes merging personal locations into hotspots.

Names longer than 128 characters are truncated for display. Exporting the selected
hotspot's ID avoids relying on that truncated name for matching.

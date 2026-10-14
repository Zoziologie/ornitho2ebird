# Ornitho protection and validation

Protection and administrative validation are independent. `hidden: "1"` records remain eligible for export; `admin_hidden_type: "refused"` records remain available in the app but are excluded from the CSV before species counts are merged. `incomplete` and `question` records remain eligible. `question` means the observation is under discussion with its observer; Export asks users to resolve identification uncertainty before importing into eBird. Export lists flagged records with links to the original platform, including when every record is refused.

Ornitho protection is not transferred through the eBird CSV. The app does not determine whether eBird considers a species sensitive. It links to [eBird's sensitive species guidance](https://support.ebird.org/en/support/solutions/articles/48000803210), which explains automatic protection and hiding a checklist through Checklist Tools. Users should retain species in their checklists to avoid biasing occurrence data.

`committees_validation` is independent of administrative review. Each committee's `ACCEPTED`, `REJECTED` and `REQUESTED` values become English status notes with the source website, observation date and record link in species comments. CAvS is described as the Swiss rarities committee; other committee identifiers are preserved in uppercase, without assuming their geographic scope. Notes remain present when optional comments are disabled or an empty personalized template is used. Source acceptance does not imply eBird acceptance. Committee rejection alone does not exclude a record; the current exclusion rule is the administrative `refused` status.

## Fixture provenance

`test/fixtures/rules/ornitho_flags.json` contains reduced records from the supplied 14 October 2026 exports, plus the previously supplied refused white-headed Long-tailed Tit. Observer account details and unrelated metadata were removed. The eight new sightings cover ordinary, protected and incomplete records. Subalpine Warbler `15800381` covers protected + refused + CAvS requested; Long-tailed Tit `3916932` covers refused + CAvS requested without protection.

The imported checklist is synthetic: IDs `900000001`–`900000004` exercise accepted, rejected and requested committee statuses and an accepted record combined with an administrative refusal. The refused Blue Tit has count 100 beside an eligible Blue Tit with count 3, so the tests catch exclusion after merging. These synthetic records verify conversion behavior; they do not establish which combinations Ornitho itself produces.

`test/fixtures/rules/ornitho_flags_fr.json` contains six reduced records from `export_8626_8637_14102026_145030.json`, `export_8626_20946_14102026_145024.json` and `export_8626_48084_14102026_145002.json`, retaining their casual/list membership and effort. GPS tracks, media metadata, observer account details and unrelated species metadata were removed. Legal protection metadata (`species.protection_nat`) is retained to test that it is not confused with hidden observations. The refused buzzard also has `gradation: "2"`; its precise meaning is unverified and it does not affect conversion.

| Record | ID | Protection | Administrative status | Committee |
|---|---|---|---|---|
| Unidentified buzzard | 44105705 | Hidden | refused | None |
| Eurasian Hobby, imported list | 94411430 | Not hidden, legally protected species | incomplete | None |
| Eurasian Pygmy Owl | 51584243 | Hidden | question | None |
| Greater Spotted Eagle or hybrid | 62836635 | Not hidden | question | CHN REQUESTED |
| Lesser Spotted Eagle | 70938324 | Hidden | question | CHN REQUESTED |
| Short-toed Snake-Eagle, imported list | 59112386 | Not hidden, legally protected species | question | CHR REQUESTED |

## Combination coverage

The unit matrix covers the full Cartesian product of the known conversion states: 2 protection values × 4 administrative states (absent, incomplete, question, refused) × 4 CAvS states × 4 CHN states × 4 CHR states (each committee independently absent, requested, accepted or rejected). These 512 combinations are each processed as casual observations and imported list observations, with optional comments disabled, an empty template, and a personalized template: 3,072 conversion checks.

Each case merges a flagged count-5 record with an ordinary count-3 record. Expected totals are 3 for administrative refusal and 8 otherwise, independent of protection or committee decisions. Assertions check committee notes, record attribution and comment retention. Real fixtures separately cover omitted protection fields, question records, legal protection, existing comments, and source links. Synthetic combinations test the conversion contract; they are not evidence that Ornitho produces every combination.

Still missing from the real examples: an explicit committee rejection and a before/after export after a flag is resolved. No undocumented status is inferred from missing fields.

# Ornitho protection and validation

Protection and administrative validation are independent. `hidden: "1"` records remain eligible for export; `admin_hidden_type: "refused"` records remain available in the app but are excluded from the CSV before species counts are merged. `incomplete` records remain eligible. Export lists flagged records with links to the original platform, including when every record is refused.

Ornitho protection is not transferred through the eBird CSV. The app does not determine whether eBird considers a species sensitive. It links to [eBird's sensitive species guidance](https://support.ebird.org/en/support/solutions/articles/48000803210), which explains automatic protection and hiding a checklist through Checklist Tools. Users should retain species in their checklists to avoid biasing occurrence data.

`committees_validation.cavs` is independent of administrative review. `ACCEPTED`, `REJECTED` and `REQUESTED` become English CAvS status notes with the source website, observation date and record link in species comments. Notes remain present when optional comments are disabled or an empty personalized template is used. Source acceptance does not imply eBird acceptance. Committee rejection alone does not exclude a record; the current exclusion rule is the administrative `refused` status.

## Fixture provenance

`test/fixtures/rules/ornitho_flags.json` contains reduced records from the supplied 14 October 2026 exports, plus the previously supplied refused white-headed Long-tailed Tit. Observer account details and unrelated metadata were removed. The eight new sightings cover ordinary, protected and incomplete records. Subalpine Warbler `15800381` covers protected + refused + CAvS requested; Long-tailed Tit `3916932` covers refused + CAvS requested without protection.

The imported checklist is synthetic: IDs `900000001`–`900000004` exercise accepted, rejected and requested committee statuses and an accepted record combined with an administrative refusal. The refused Blue Tit has count 100 beside an eligible Blue Tit with count 3, so the tests catch exclusion after merging. These synthetic records verify conversion behavior; they do not establish which combinations Ornitho itself produces.

Still missing from the real examples: the doubtful/under-discussion status, an explicit committee rejection, and a before/after export after a flag is resolved. No undocumented status is inferred from missing fields.

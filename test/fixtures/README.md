# Observation bulk fixtures

`observation_bulk_fr.csv` retains representative French values and count breakdowns from
Martin’s supplied export. Identifiers, dates, coordinates, location names and notes were
replaced with example values. It covers repeated observation IDs, an uncounted species,
a non-bird record, and scientific-name matching.

`observation_taxa.json` records the expected shared-index mappings for all 311 distinct bird
taxa in that export. It contains only scientific names and eBird codes, including synonyms
and subspecies. These are regression expectations, not an independent taxonomy authority.

The existing `observation_org.csv` covers English counting methods. Session CSV/KML support
is outside this change; all these observations use the existing casual-observation pipeline.

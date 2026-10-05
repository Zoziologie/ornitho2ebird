# Observation bulk fixtures

`observation_bulk_fr.csv` retains representative French values and count breakdowns from
Martin’s supplied export. Identifiers, dates, coordinates, location names and notes were
replaced with example values. It covers repeated observation IDs, an uncounted species,
a non-bird record, and scientific-name matching.

`observation_taxa.json` records the expected shared-index mappings for all 311 distinct bird
taxa in that export. It contains only scientific names and eBird codes, including synonyms
and subspecies. These are regression expectations, not an independent taxonomy authority.

The existing `observation_org.csv` covers English counting methods. These bulk observations use the existing casual-observation pipeline.

## Session pairs

`sessions/transect.csv` and `.kml` retain English count methods and the 104-point route
structure from the supplied session export. `sessions/stationary.csv` and `.kml` retain
French export values and stationary effort from the supplied listening-point session.
Observation/session IDs, names, dates and locations are examples; the route is translated
away from its original location. CSV counts and KML effort deliberately differ from
what could be inferred from the first/last observation times.

Golden files cover both pairs separately and together. CSV remains authoritative for
counts/species; all session checklists default to incomplete.

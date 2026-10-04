# Rule-review fixtures

These small examples support rule tests in `test/unit/ebirdRules.test.js`. Golden exports for the real JSON and French TXT verify the intended rows after exclusion of dead/zero-count records. Browser tests separately verify warnings and confirmation.

## Real exports supplied on 4 October 2026

- `ornitho_mortality_overnight.json`: derived from `export_11346_68266_04102026_141224.json`. Retains both casual records and the two-record partial list. Observer identity fields were removed; source dates, coordinates, identifiers, timing and mortality fields were retained. Both mortality records have `has_death: "2"`; their `extended_info.mortality.wounded` values differ: `"0"` for the dead bird and `"1"` for the injured bird. The list starts at 23:20 and ends at 10:00. Its record times are unspecified, so it does not establish individual detection times on either side of midnight. Per the maintainer, second-hand observations cannot be exported and are assumed absent.
- `biolovision_french.txt`: two rows selected from `EXPORT_UNIVERSAL_OBS_92018.txt`, retaining the original French header and tab-separated layout. Observer identity and private-comment columns were cleared. Dates are 30.09.2018 and 06.09.2018, confirmed by the separate Jour/Mois/Annee columns. These expose an impossible month and an ambiguous day/month respectively. The supplied full export contained 1,054 records.

## Derived examples

- `biolovision_english_headers_derived.txt`: the same two TXT rows with importer-relevant headers translated to its expected English names. Observation values and dates are unchanged. This is **not a real English-language export**; it verifies English header aliases while retaining the actual date values. An actual English export is still needed to establish whether its date format differs.
- The GPS-noise test uses the first point of `export_normal_with_trace.json` as its anchor and replaces the trace with deterministic small offsets. All points remain less than 30 m from that anchor while cumulative length exceeds 30 m. This is **synthetic stationary GPS drift**, not measured noise or evidence for a particular GPS-error model.

The original files in Downloads were not modified. The converter now supports the French TXT and preserves mortality metadata. Dead and zero-count records are excluded from golden CSVs.

## Additional real language exports

Two rows per language were selected from the exports supplied later on 4 October 2026. Public/private comments and observer identity fields were cleared; headers, observation ids, dates, coordinates, counts and species were retained.

- `biolovision_german.txt`: `EXPORT_UNIVERSAL_OBS_92023.txt` (365 records).
- `biolovision_italian.txt`: `EXPORT_UNIVERSAL_OBS_2026.txt` (749 records); `EXPORT_UNIVERSAL_OBS_2026 (1).txt` has the same headers and observation values.
- `biolovision_spanish.txt`: `EXPORT_UNIVERSAL_OBS_2026 (2).txt` (749 records).
- `biolovision_polish.txt`: `EXPORT_UNIVERSAL_OBS_2026 (3).txt` (749 records); the header repeats `Dzień` for day and day-of-year.
- `biolovision_catalan.txt`: `EXPORT_UNIVERSAL_OBS_2026 (4).txt` (749 records).

The last four languages share the same two observations, one timed and one untimed. A test reverses the Polish columns and adds an unused column to verify name-based matching. All five real additions have golden CSVs. GPS-outlier tests are deterministic synthetic cases; they demonstrate the chosen central-95% policy and its brief-excursion limitation, not measured device errors.

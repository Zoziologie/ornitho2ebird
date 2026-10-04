# eBird conversion decisions and checks

This review informed issue [#54](https://github.com/Zoziologie/ornitho2ebird/issues/54). The implementation follows the maintainer's decisions from 4 October 2026.

## Dates and splitting

Ordinary eBird lists cover one calendar date. The app warns when observations differ from the checklist date or effort crosses midnight, including a single observation assigned to the wrong date. Warnings appear in Export in both modes and require confirmation before download; they do not prevent deliberate merging.

When every observation has a date and time and there are observations on multiple dates, Export offers **Split by date**. Splitting preserves all observations, original counts, locations, species-comment settings and checklist comments. It works for imported and generated lists, retaining the imported-list indexing contract.

The split creates a checklist per observation date and uses that day's first detection as its start time. Duration, distance, untimed paths and published map links are cleared, since they cannot be divided reliably between dates. The confirmation explains this. Users can review effort in Customized mode; without effort, primary-purpose lists become Historical.

If some observation times are unknown, or all records have the same date, the app retains one checklist and explains why an automatic date split is unavailable. Overnight duration remains positive and its crossing flag is preserved. The app does not infer a detection date for untimed records or automatically construct an empty checklist for the next day.

For deliberate multi-date life-list entry, eBird specifies 1 January 1900, Incidental, no time, appropriate regional locations, explanatory comments and separate lists per country. The converter warns about date mismatches but does not implement a dedicated regional life-list mode.

## Mortality and counts

Ornitho mortality flags and nested metadata are retained. The supplied real pair has `has_death: "2"` for both a dead and an injured bird; nested `extended_info.mortality.wounded` distinguishes `"0"` (dead) from `"1"` (injured).

Confirmed dead birds and zero-count records are excluded from species rows before merging. Original records, counts and comments remain in app state. Injured living birds remain exportable. Mortality flags without a clear status produce a warning and source links rather than automatic exclusion. Download requires acknowledgment of the exclusions and uncertain records. Checklists containing only excluded observations do not count toward export totals and cannot produce a CSV.

Zero is preserved at import instead of changing numeric zero to unknown-count presence. The app does not implement eBird's UN breeding-code exception; zero is not used as a dead-bird workaround.

Per the maintainer, Biolovision does not export second-hand observations. They are assumed absent; no synthetic eligibility test or filter is added for them.

## Completeness

Casual records still default to incomplete, non-primary-purpose lists. Users can reconstruct complete checklists: selecting complete enables primary purpose, and disabling primary purpose clears completeness. Export independently enforces incomplete Incidental output, and the summary uses the effective completeness.

Completeness is trusted rather than inferred from effort. It means every identified wild bird species was reported, including heard-only and introduced birds; adding timestamps or distance cannot make an incomplete source list complete.

## Biolovision TXT

English and French observation headers are supported. Dates prefer the separate year/month/day columns; when absent, the documented fallback is day-month-year. Dates are padded consistently. Header validation checks for the time column rather than requiring the first observation to have a known time.

The supplied French export and an English-header derivative exercise identical actual observation values. The derivative is not an actual English-language export. A real English sample remains useful to verify format variations. The observation export does not provide the separately exported source-list effort information, so these records still follow the casual conversion path.

## GPS estimates

For a track, Stationary classification checks the maximum distance of positions from its starting point against approximately 30 m. Cumulative movement inside that radius no longer makes the checklist Traveling. A manual distance of zero allows the user to confirm Stationary. Without a track, the existing numeric-distance interpretation is retained.

Unique route distance removes overlapping, nearly collinear segments, including partially retraced routes with different segmentation. Matching requires endpoints within 1 m of the current line and directions within 1 degree. Covered intervals are merged so repeated overlap is subtracted only once. Length uses haversine distances and is rounded to 0.001 km before miles conversion.

This is a conservative estimate, not a reconstruction of exact trail geometry. Larger GPS drift may retain duplicated portions; paths less than 1 m apart may be merged. There is no GPS outlier filtering. The original track remains available, the estimate can be edited, and both Basic and Customized modes explain that it needs review. Stationary export rows omit traveling distance.

## Aggregation assumptions retained

The grouping algorithm is unchanged. Same-day observations can join through nearby chains and thus exceed the overall configured time or distance limit. A later record matching two groups joins one; it does not merge those groups. Help now describes this behavior in all five languages.

Missing times are treated as midnight for grouping. Default observer count remains an explicit assumption. Repeated species counts are summed, assuming different individuals. Source list membership still implies primary purpose, and source completeness is trusted; specialized or restricted-species surveys need user review.

## Validation

`test/unit/ebirdRules.test.js` covers protocol/completeness combinations, missing effort, counts and source links, real mortality metadata, French TXT dates, date warnings, user splitting, imported-list indexing, primary-purpose edits, synthetic stationary drift, loops, partial backtracking and nearby parallel paths. All former expected failures were replaced with ordinary assertions matching the accepted decisions.

Browser tests exercise cancellation and acknowledgment, dead-bird exclusion with injured-bird retention, splitting a timestamped derivative of the real overnight list, and French TXT import through CSV download. Fixtures and their real/synthetic provenance are documented in `test/fixtures/rules/README.md`.

Golden CSV changes are intentional: unique-distance estimates and Stationary classification change track-based rows; dead and zero-count observations are removed. Two golden fixtures cover the new real source examples. No live eBird upload was performed.

## References

- [eBird rules and best practices](https://support.ebird.org/en/support/solutions/articles/48000795623-ebird-rules-and-best-practices)
- [Core protocols and distance](https://support.ebird.org/en/support/solutions/articles/48000950859-guide-to-ebird-protocols)
- [Primary purpose and complete checklists](https://support.ebird.org/en/support/solutions/articles/48000967748-birding-as-your-primary-purpose-and-complete-checklists)
- [Pre-eBird life lists](https://support.ebird.org/en/support/solutions/articles/48000804866-enter-your-pre-ebird-life-list)
- [Biolovision record metadata](https://help.biolovision.net/Special%3AMyLanguage/Entering_records)
- [Biolovision export](https://help.biolovision.net/Export_records)

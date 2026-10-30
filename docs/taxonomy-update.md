# Updating the bird taxonomy

The app maintains two related datasets. `data/ornitho_species_list_full.csv` maps Biolovision IDs to eBird codes across portals. `data/ebird_scientific_names.json` contains eBird names and reviewed older ornitho names; `data/ornitho_species_list_short.json` is generated from the full mapping. Neither the master list nor a country download is a complete worldwide Biolovision taxonomy.

## Update eBird

1. Run `npm run taxonomy:update -- --report /tmp/ebird-taxonomy-report.md`, or review the monthly taxonomy workflow's pull request. The command fetches the current eBird API taxonomy, replaces obsolete codes when a scientific name matches, and regenerates both derived files.
2. Review the report, including obsolete codes, renamed codes whose meaning may have changed, and obsolete legacy-name codes. A surviving code or identical scientific name does not prove that a taxon has the same boundaries after a split or lump. Check the eBird taxonomy, source taxon and scientific literature as needed; never guess a more specific identification.
3. Inspect the diff in the master list, name index and golden CSV files. When a change in exported names is intended, update snapshots with `npx vitest run -u` and review the CSV diffs. `npm run taxonomy:test-file` produces a separate file for a manual eBird import check; it does not establish that every taxonomic match is correct.

The scheduled workflow checks eBird, not Biolovision. It reports renamed codes without changing them, but it cannot detect every change in taxonomic meaning. Name-based replacements also require review.

## Update Biolovision

1. Open a portal's **Check my lists** page, select its country, birds and English language, and save the page as HTML in your normal signed-in browser. The page can contain personal account data, so keep the HTML private and outside the repository.
2. Extract only species IDs and names. For example, `npm run splist:download -- /tmp/france.csv faune-france.org '/path/to/saved page.html'`. Alternatively, omit the HTML path to open a separate Chromium window and sign in there; the script does not reuse your normal browser session. Install Chromium first with `npx playwright install chromium`.
3. Run `npm run splist:compare -- /tmp/france.csv /tmp/france-review.csv`. Repeat for other supported portals, for example `ornitho.ch`. Compare identifies new IDs, name changes and unmapped IDs and suggests exact eBird scientific-name matches. It does not update the master list or consider IDs absent from a portal deleted.
4. Review each proposed change against the source and eBird taxon. Add new IDs and change names or codes in the master CSV only when justified. For an old scientific name that should continue to resolve to the same eBird code after a rename, retain it in `data/ornitho_legacy_names.json`; do not add an alias when its taxonomic meaning is ambiguous. A blank code permits scientific-name fallback, so it does not prevent an incorrect fallback on its own.
5. Run `npm run taxonomy:update`, review its report and generated data, then run `npm run check`, `npm run build` and `npm run test:e2e`. Version and submit the changes through a pull request.

Country lists depend on the portal, account and selected taxonomic group; they are snapshots rather than a history of changes. They can differ by country and cannot tell us how a past observation was reclassified. Do not commit saved HTML, cookies or personal observations.

The October 2026 review is recorded in `docs/biolovision-proposed-matches.md`, `docs/biolovision-nondirect-matches.md` and `docs/biolovision-taxa-without-close-match.md`. The comparison in `docs/biolovision-france-review.csv` includes remaining name differences and unmapped taxa; some mappings need further taxonomic review.

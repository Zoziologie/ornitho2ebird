# Ornitho2eBird

Convert exports from ornitho, ornitho network sites, Observation websites, and BirdLasser into eBird-ready CSV checklists.

`ornitho2ebird` is a client-side Vue application for turning bird observation exports into the eBird Record Format (Extended). It is designed for people who already have data in regional ornithology platforms and want a faster path into eBird without hand-editing a spreadsheet.

## Tech stack

<table width="100%">
  <thead>
    <tr>
      <th align="center">
        Vue<br/>
        <sub>UI framework</sub>
      </th>
      <th align="center">
        Vite<br/>
        <sub>Build & dev tooling</sub>
      </th>
      <th align="center">
        Bootstrap<br/>
        <sub>Layout & components</sub>
      </th>
      <th align="center">
        MapLibre GL JS<br/>
        <sub>Interactive maps</sub>
      </th>
      <th align="center">
        Node.js<br/>
        <sub>Local runtime</sub>
      </th>
      <th align="center">
        npm<br/>
        <sub>Package manager</sub>
      </th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td align="center">
        <a href="https://vuejs.org/">
          <img src="https://raw.githubusercontent.com/devicons/devicon/master/icons/vuejs/vuejs-original.svg" height="40"/>
        </a>
      </td>
      <td align="center">
        <a href="https://vite.dev/">
          <img src="https://raw.githubusercontent.com/devicons/devicon/master/icons/vitejs/vitejs-original.svg" height="40"/>
        </a>
      </td>
      <td align="center">
        <a href="https://getbootstrap.com/">
          <img src="https://raw.githubusercontent.com/devicons/devicon/master/icons/bootstrap/bootstrap-original.svg" height="40"/>
        </a>
      </td>
      <td align="center">
        <a href="https://maplibre.org/">
          <img src="https://maplibre.org/img/maplibre-logo-big.svg" height="40"/>
        </a>
      </td>
      <td align="center">
        <a href="https://nodejs.org/">
          <img src="https://raw.githubusercontent.com/devicons/devicon/master/icons/nodejs/nodejs-original.svg" height="40"/>
        </a>
      </td>
      <td align="center">
        <a href="https://www.npmjs.com/">
          <img src="https://raw.githubusercontent.com/devicons/devicon/master/icons/npm/npm-original-wordmark.svg" height="40"/>
        </a>
      </td>
    </tr>
  </tbody>
</table>

## What it does

- Imports exported files from supported source websites
- Preserves existing checklist data when the source already provides effort metadata
- Automatically groups casual observations into draft eBird checklists
- Lets you review and edit checklist metadata in a map-based advanced workflow
- Exports a CSV that can be uploaded through eBird import
- Writes eBird's scientific names, so eBird recognises the species whatever your eBird language

## Supported sources

The app currently supports:

- `ornitho` sites such as `ornitho.ch`, `ornitho.cat`, `ornitho.de`, `ornitho.it`, `faune-france.org`, `ornitho.at`, `ornitho.eus`, `ornitho.lu`, `ornitho.pl`, and `dabasdati.ornitho.lv`
- `data.biolovision.net`
- `BirdLasser`
- `Observation.org`
- `waarneming.nl`
- `waarnemingen.be`

The full source list lives in [`data/websites_list.json`](data/websites_list.json).

For Observation websites, import the bulk CSV directly; no KML is needed. English exports are
recommended; the French counting values `indéterminé` and `non compté` are also supported.
Non-bird observations are skipped with a summary. Rows sharing an observation ID are count
breakdowns: their counts are combined and their details retained in the species comment.
Bulk exports do not contain session effort or completeness, so they follow the same automatic
grouping as other casual observations.

For Observation sessions, export each session as both CSV and KML in English or French.
Select or drop all the matching pairs together; filenames and selection order do not matter.
The CSV supplies species, count precision and comments; the KML supplies session membership,
start/end times and the recorded route or stationary location. Each session stays a separate
imported checklist in the same pipeline as ornitho lists. Distance uses the existing route
estimate; review it for GPS drift and backtracking.

Completeness and observer count are not exported. Session checklists default to incomplete
and use the observer count from Settings; confirm these in Customized mode. Bulk CSVs and
session pairs must be imported separately. Missing, mismatched or overlapping pairs leave
the previous import intact. KML-only import and bulk KML files are not supported.

## Conversion model

The app uses two different paths depending on what you import:

- Existing lists/checklists are the preferred path. They already contain most of the effort metadata needed for eBird.
- Casual observations are automatically aggregated into new checklists using time and distance thresholds.

By default, the app makes a few pragmatic assumptions so imports can work with minimal manual input:

- A default party size is used because some source systems do not store observer count
- Same-day casual observations can be grouped into one checklist if they remain within configurable time and distance limits
- Generated sighting-based checklists default to non-primary-purpose birding and incomplete (Incidental)
- If a checklist has no track or distance, it may end up as a historical checklist in eBird
- Stationary GPS classification uses the central 95% of track points; isolated errors and brief real excursions can be ignored, so review the track
- Track distance estimates exclude near-exact backtracking; review GPS drift and adjust the unique-distance estimate if needed
- Dead and zero-count records stay available for review but are excluded from the CSV; unclear mortality information requires confirmation
- Date mismatches and overnight effort require confirmation; timestamped lists can be split by date, with effort reviewed afterward

## Workflow

1. Export your data from the source website.
2. Open the web app and select the matching source.
3. Import the exported file.
4. Review automatic checklist grouping.
5. Optionally switch to Customized mode to adjust assignments, duration, distance, paths, or hotspot location.
6. Download the generated CSV.
7. Upload it through the eBird import page and review the imported checklists carefully.

User help, including an FAQ on pitfalls (duplicates, species to match, hotspots, processing time), is in the app's Help window, which links can open: [ornitho2ebird.com/#help](https://ornitho2ebird.com/#help), `#help/<id>` for one section or question, `?lang=de#help` for German. It replaces the GitHub wiki. The text lives in [`src/components/HelpPanel.vue`](src/components/HelpPanel.vue) and the locale files, so it is translated and updated together with the app.

## Features worth knowing

### Basic mode

Basic mode is the fast path. The app imports the file, applies automatic aggregation where needed, and prepares the CSV with almost no intervention.

### Customized mode

Customized mode unlocks the review tools:

- reassign casual observations between checklists
- create new checklists from map selections
- edit checklist metadata
- draw a path to compute traveling distance
- inspect nearby eBird hotspots
- choose which checklists are exportable

Choosing a hotspot exports its eBird location ID in the CSV's location-name column,
so eBird can match the hotspot directly. The app still displays its readable name.
Renaming or moving the location clears that hotspot association.

Hotspots are selected automatically in both modes when one candidate fits the route or
observation positions and clearly beats the alternatives. Uncertain matches keep the
original location. Unrelated GPS tracks are ignored for matching. Customized mode lets
you review the result and choose another hotspot on the map. The calibration workflow and
reference choices remain in [`docs/hotspot-scoring.md`](docs/hotspot-scoring.md).

### Species comment templates

Species comments are customizable. The app can generate concise or expanded comments and switch between templates when many duplicate sightings of the same species are merged into one eBird row.

### Species matching

eBird's importer matches a common name only in the species-name language of your eBird account (and not reliably even then, for example with accented names), but it matches a scientific name in any language. So the app finds the eBird taxon of every sighting and writes eBird's scientific name in the Genus and Species columns, leaving the common name empty:

- ornitho: through the ornitho id → eBird code list in [`data/ornitho_species_list_full.csv`](data/ornitho_species_list_full.csv).
- Observation.org, BirdLasser, ornitho.net, and ornitho taxa missing from that list: through the scientific name, looked up in [`data/ebird_scientific_names.json`](data/ebird_scientific_names.json) (eBird's names plus older names used by ornitho; a subspecies eBird does not list falls back to its species).

The current scientific name of each code comes from the eBird API at export time. Sightings without a match keep the source common name, and eBird asks you to match them during import.

The interface is available in English, French, Catalan, German, and Italian.

## Privacy and external services

This project is a static front-end app. The conversion itself happens in the browser.

The app calls these services from the browser:

- the eBird API, to retrieve the current scientific names of the species in your export and suggest nearby hotspots
- OpenStreetMap Nominatim, with the coordinates of the first imported record, to check that the file matches the selected website
- map tile servers (OpenStreetMap, Esri, swisstopo, IGN, BKG) for the review maps
- Mapbox, only if you add a Mapbox token, to render static checklist maps
- GitHub Gists, only if you add a GitHub token and enable interactive maps, to publish each checklist's map data as a secret gist
- Google Analytics, only after you accept, for page views and predefined usage events (imports, exports, modes, help, settings and checklist/map tools). You can reject or change your choice in Settings or through Privacy & cookies in the footer. Conversion works without analytics; withdrawing consent preserves your current import. See [the event contract and administrator setup](docs/analytics.md).

If the eBird requests fail, the export keeps the source species names.

## Local development

### Requirements

- Node.js 22 or newer (see [`.nvmrc`](.nvmrc))
- npm

### Install

```bash
npm install
```

### Start the dev server

```bash
npm run dev
```

### Build for production

```bash
npm run build
```

### Preview the production build

```bash
npm run preview
```

### Run the tests and checks

```bash
npm test
```

```bash
npm run check
```

`npm run check` runs ESLint, the Prettier format check and the tests, the same checks CI runs. `npm run format` and `npm run lint:fix` fix most of what they report. Editors with the ESLint and Prettier extensions pick up the config automatically.

The end-to-end tests run the built app in Chromium with [Playwright](https://playwright.dev/): they import fixtures, download the CSV and compare it with the golden files, in the default and in Customized mode. Every request outside the local server is stubbed (eBird API, Nominatim, map tiles, analytics), so they need no network once Chromium is installed:

```bash
npx playwright install chromium
npm run test:e2e
```

## Available scripts

- `npm run dev` starts Vite in development mode
- `npm run build` creates the production build
- `npm run preview` serves the built app locally
- `npm test` runs the unit and golden-file tests once (`npm run test:watch` re-runs them on change)
- `npm run test:e2e` builds the app and runs the Playwright end-to-end tests in [`test/e2e/`](test/e2e)
- `npm run lint` / `npm run lint:fix` runs ESLint (Vue and JavaScript rules)
- `npm run format` / `npm run format:check` runs Prettier
- `npm run check` runs lint, format check and tests together
- `npm run splist` validates [`data/ornitho_species_list_full.csv`](data/ornitho_species_list_full.csv) and regenerates [`data/ornitho_species_list_short.json`](data/ornitho_species_list_short.json) from it
- `npm run splist:check` checks every eBird code in the species list against the current eBird taxonomy (needs network; run it after each yearly eBird taxonomy update)
- `npm run taxonomy:update` brings the eBird data up to date (needs network): replaces ornitho codes that eBird renamed, lists the ones that need a decision, and regenerates [`data/ebird_scientific_names.json`](data/ebird_scientific_names.json) and the short list
- `npm run taxonomy:test-file` writes a CSV with every eBird taxon the ornitho list maps to, to check on eBird's import page that all of them match (see #38)

## Project structure

- [`src/`](src) application source
- [`src/components/`](src/components) import, settings, advanced review, and export UI
- [`src/lib/`](src/lib) conversion logic and helpers
- [`src/lib/store.js`](src/lib/store.js) the imported checklists and sightings; components read them and change them only through its actions
- [`src/locales/`](src/locales) interface translations
- [`data/`](data) source website metadata and species mapping files
- [`docs/localization-workflow.md`](docs/localization-workflow.md) translation workflow
- [`test/fixtures/`](test/fixtures) sample exports from each supported source
- [`test/unit/`](test/unit) unit tests for parsing, comment templates, CSV export, settings, the store and locales
- [`test/golden/`](test/golden) the expected eBird CSV for every fixture (`__snapshots__/`)
- [`test/e2e/`](test/e2e) Playwright end-to-end tests of the import, Customized mode and download

## Deployment

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs lint, the format check, the tests and the build on every pull request, and the end-to-end tests in a separate job. On a push to the default branch it runs the same checks, uploads `dist/` as a GitHub Pages artifact and, once the end-to-end tests pass too, deploys it; there is no `gh-pages` branch. It can also be started by hand from the Actions tab.

The [Taxonomy update](.github/workflows/taxonomy-update.yml) workflow runs `npm run taxonomy:update` on the first of each month and opens a pull request only when eBird changed something (usually once a year, after eBird's taxonomy update in October). The pull request lists the ornitho codes it replaced and those that need a decision. Rock Pigeon and Common Snipe are listed in `MANUAL_MATCH_TAXA` ([`src/lib/taxonomy.js`](src/lib/taxonomy.js)) because eBird's importer does not match them by scientific name; see #38 for the tests behind this.

Dependencies are updated by hand: `npm outdated` lists what is behind, `npm install <package>@latest` moves a package to its latest major version, and `npm update` refreshes everything else in the lockfile. Then run `npm run check` and `npm run build`.

The app builds for root-domain hosting, which matches `https://ornitho2ebird.com/`. If you later deploy it under a subpath again, set Vite's `base` option accordingly in [`vite.config.js`](vite.config.js).

## Contributing

Issues and pull requests are welcome. If you change translation keys, update [`src/locales/en.json`](src/locales/en.json) first and follow the translation notes in [`docs/localization-workflow.md`](docs/localization-workflow.md).

When changing conversion logic, run `npm test`. The golden-file tests compare the eBird CSV produced for every fixture in [`test/fixtures/`](test/fixtures) with the files in [`test/golden/__snapshots__/`](test/golden/__snapshots__). If a difference is intended, review it and update the files with `npx vitest run -u`. CI runs the tests, lint and format check on every pull request and before each deployment.

## License

GPL-3.0. See [`LICENSE`](LICENSE).

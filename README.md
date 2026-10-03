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
        Leaflet<br/>
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
        <a href="https://leafletjs.com/">
          <img src="https://leafletjs.com/docs/images/logo.png" height="40"/>
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

## Conversion model

The app uses two different paths depending on what you import:

- Existing lists/checklists are the preferred path. They already contain most of the effort metadata needed for eBird.
- Casual observations are automatically aggregated into new checklists using time and distance thresholds.

By default, the app makes a few pragmatic assumptions so imports can work with minimal manual input:

- A default party size is used because some source systems do not store observer count
- Same-day casual observations can be grouped into one checklist if they remain within configurable time and distance limits
- Generated sighting-based checklists are marked as primary purpose by default and incomplete by default
- If a checklist has no track or distance, it may end up as a historical checklist in eBird

## Workflow

1. Export your data from the source website.
2. Open the web app and select the matching source.
3. Import the exported file.
4. Review automatic checklist grouping.
5. Optionally switch to Customized mode to adjust assignments, duration, distance, paths, or hotspot location.
6. Download the generated CSV.
7. Upload it through the eBird import page and review the imported checklists carefully.

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
- Google Analytics, for page-view statistics (see [#10](https://github.com/Zoziologie/ornitho2ebird/issues/10))

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

## Available scripts

- `npm run dev` starts Vite in development mode
- `npm run build` creates the production build
- `npm run preview` serves the built app locally
- `npm test` runs the unit and golden-file tests once (`npm run test:watch` re-runs them on change)
- `npm run lint` / `npm run lint:fix` runs ESLint (Vue and JavaScript rules)
- `npm run format` / `npm run format:check` runs Prettier
- `npm run check` runs lint, format check and tests together
- `npm run splist` validates [`data/ornitho_species_list_full.csv`](data/ornitho_species_list_full.csv) and regenerates [`data/ornitho_species_list_short.json`](data/ornitho_species_list_short.json) from it
- `npm run splist:check` checks every eBird code in the species list against the current eBird taxonomy (needs network; run it after each yearly eBird taxonomy update)
- `npm run taxonomy:update` regenerates [`data/ebird_scientific_names.json`](data/ebird_scientific_names.json) from the current eBird taxonomy (needs network; also after each yearly update)

## Project structure

- [`src/`](src) application source
- [`src/components/`](src/components) import, settings, advanced review, and export UI
- [`src/lib/`](src/lib) conversion logic and helpers
- [`src/locales/`](src/locales) interface translations
- [`data/`](data) source website metadata and species mapping files
- [`docs/localization-workflow.md`](docs/localization-workflow.md) translation workflow
- [`test/fixtures/`](test/fixtures) sample exports from each supported source
- [`test/unit/`](test/unit) unit tests for parsing, comment templates, CSV export and locales
- [`test/golden/`](test/golden) the expected eBird CSV for every fixture (`__snapshots__/`)

## Deployment

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs lint, the format check, the tests and the build on every pull request. On a push to the default branch it runs the same checks, uploads `dist/` as a GitHub Pages artifact and deploys it; there is no `gh-pages` branch. It can also be started by hand from the Actions tab.

Dependencies are updated by hand: `npm outdated` lists what is behind, `npm install <package>@latest` moves a package to its latest major version, and `npm update` refreshes everything else in the lockfile. Then run `npm run check` and `npm run build`.

The app builds for root-domain hosting, which matches `https://ornitho2ebird.com/`. If you later deploy it under a subpath again, set Vite's `base` option accordingly in [`vite.config.js`](vite.config.js).

## Contributing

Issues and pull requests are welcome. If you change translation keys, update [`src/locales/en.json`](src/locales/en.json) first and follow the translation notes in [`docs/localization-workflow.md`](docs/localization-workflow.md).

When changing conversion logic, run `npm test`. The golden-file tests compare the eBird CSV produced for every fixture in [`test/fixtures/`](test/fixtures) with the files in [`test/golden/__snapshots__/`](test/golden/__snapshots__). If a difference is intended, review it and update the files with `npx vitest run -u`. CI runs the tests, lint and format check on every pull request and before each deployment.

## License

GPL-3.0. See [`LICENSE`](LICENSE).

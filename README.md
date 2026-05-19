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
- Supports multiple interface languages and localized eBird taxonomy names

## Supported sources

The app currently supports:

- `ornitho` sites such as `ornitho.ch`, `ornitho.cat`, `ornitho.de`, `ornitho.it`, `faune-france.org`, `ornitho.at`, `ornitho.eus`, `ornitho.lu`, `ornitho.pl`, and `dabasdati.ornitho.lv`
- `data.biolovision.net`
- `BirdLasser`
- `Observation.org`
- `waarneming.nl`
- `waarnemingen.be`

The full source list lives in [`data/websites_list.json`](/Users/rafnuss/Documents/GitHub/ornitho2ebird/data/websites_list.json).

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

### Localized taxonomy

The UI supports English, French, Catalan, German, and Italian. eBird taxonomy names can also be requested in many eBird locales so imported species names better match the language you use in eBird.

## Privacy and external services

This project is a static front-end app. The conversion itself happens in the browser.

The app can optionally call eBird APIs from the browser to:

- retrieve localized taxonomy names
- suggest nearby hotspots

If those requests fail, the app still falls back to bundled species mappings where possible.

## Local development

### Requirements

- Recent Node.js LTS release
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

## Available scripts

- `npm run dev` starts Vite in development mode
- `npm run build` creates the production build
- `npm run preview` serves the built app locally
- `npm run splist` regenerates [`data/ornitho_species_list_short.json`](/Users/rafnuss/Documents/GitHub/ornitho2ebird/data/ornitho_species_list_short.json) from [`data/ornitho_species_list_full.csv`](/Users/rafnuss/Documents/GitHub/ornitho2ebird/data/ornitho_species_list_full.csv)

## Project structure

- [`src/`](/Users/rafnuss/Documents/GitHub/ornitho2ebird/src) application source
- [`src/components/`](/Users/rafnuss/Documents/GitHub/ornitho2ebird/src/components) import, settings, advanced review, and export UI
- [`src/lib/`](/Users/rafnuss/Documents/GitHub/ornitho2ebird/src/lib) conversion logic and helpers
- [`src/locales/`](/Users/rafnuss/Documents/GitHub/ornitho2ebird/src/locales) interface translations
- [`data/`](/Users/rafnuss/Documents/GitHub/ornitho2ebird/data) source website metadata and species mapping files
- [`docs/localization-workflow.md`](/Users/rafnuss/Documents/GitHub/ornitho2ebird/docs/localization-workflow.md) translation workflow
- [`test/`](/Users/rafnuss/Documents/GitHub/ornitho2ebird/test) sample import/export fixtures

## Deployment note

The app now builds for root-domain hosting, which matches `https://ornitho2ebird.com/`. If you later deploy it under a subpath again, set Vite's `base` option accordingly in [`vite.config.js`](/Users/rafnuss/Documents/GitHub/ornitho2ebird/vite.config.js).

## Contributing

Issues and pull requests are welcome. If you change translation keys, update [`src/locales/en.json`](/Users/rafnuss/Documents/GitHub/ornitho2ebird/src/locales/en.json) first and follow the translation notes in [`docs/localization-workflow.md`](/Users/rafnuss/Documents/GitHub/ornitho2ebird/docs/localization-workflow.md).

When changing conversion logic, test with realistic exports from the fixtures in [`test/`](/Users/rafnuss/Documents/GitHub/ornitho2ebird/test).

## License

GPL-3.0. See [`LICENSE`](/Users/rafnuss/Documents/GitHub/ornitho2ebird/LICENSE).

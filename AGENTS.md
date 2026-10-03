# Notes for coding agents

[README.md](README.md) covers what the app does, the scripts, the project structure and deployment. Read it first. This file lists the conventions and pitfalls the README does not cover.

## Working on this repository

- **One pull request per change.** Never merge without the maintainer's explicit go-ahead. Wait for CI first: "Lint, test and build" and "End-to-end tests". Deploy is skipped on pull requests.
- **Bump the version in every commit.** Change the first two `"version"` fields, in `package.json` and `package-lock.json`. `npm version patch --no-git-tag-version` does both. Use a minor bump (`npm version minor …`) when users will notice the change. Two open pull requests often end up with the same version: after merging one, merge main into the other and bump it again.
- **Point `gh` at the repository with `-R Zoziologie/ornitho2ebird`.** Without it, `gh` can resolve to the wrong repository. For example `gh pr list` shows only 2023 pull requests.
- **Run the checks before pushing:** `npm run check` (lint with 0 warnings, Prettier, unit and golden tests), then `npm run build` and `npm run test:e2e`.
- **Product decisions so far:**
  - The structural UX redesign is deferred to [#40](https://github.com/Zoziologie/ornitho2ebird/issues/40). For now, only small fixes that keep the current layout: Import → (Customized mode panels) → Export, plus the Settings and Help modals.
  - [#32](https://github.com/Zoziologie/ornitho2ebird/issues/32) tracks the refactor steps.
  - No login and no backend: the app stays a static site.
  - Customized mode is for desktop only: don't spend effort on making its maps work on phones. Basic mode must work on phones.
  - The maps use MapLibre GL JS ([#48](https://github.com/Zoziologie/ornitho2ebird/issues/48), comparison in [#34](https://github.com/Zoziologie/ornitho2ebird/issues/34)). With Vite, MapLibre 6 needs `setWorkerUrl()` with a `maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url` import (see `src/lib/maps.js`). The basemaps are listed in `src/lib/basemaps.js`: national maps where the country offers a free one, and by default the map of the source website's country. Their ids are saved in settings, so never change one.
  - Better analytics come later.
- **User help lives in the app, not in a wiki.** The GitHub wiki is disabled.

## Architecture

- **`src/lib/store.js` owns the imported data.** That means `forms` (checklists), `sightings` (casual observations, `form_id` 0 when unassigned) and `formsSightings` (the sightings of imported lists).
  - Components get `store.state` (read-only) as props and change it only through actions: `assignSightings`, `createForm`, `updateForm`, `moveForm`, `autoAssign`, etc.
  - `vue/no-mutating-props` is on, so don't write to props, `v-model` included. In the checklist editor, use the `selectedFormModel` computeds, which call `updateForm`.
- **`src/lib/settings.js` loads and saves the settings.** They live in localStorage, under a versioned schema.
  - When the stored shape changes, bump `SETTINGS_VERSION` and add a migration step. Unknown keys and values of the wrong type are dropped against `DEFAULT_SETTINGS`.
  - `App.vue` owns the reactive settings and provides them under `SETTINGS_INJECTION_KEY`, and `SettingsPanel` edits them in place. Other components get settings as props.
- **The UI language is resolved in this order:** `?lang=`, the language cookie, the saved setting, the browser language (first visit only), then English. The UI language also picks the default source website.
- **Coordinates are rounded to 6 decimals,** both on import and when a marker is dragged. The exception is a hotspot chosen as the location, which keeps eBird's exact coordinates so the checklist stays on the hotspot.
- **Basic mode** groups casual observations automatically, using the duration and distance in Settings.
  - Changing those limits in Basic mode regroups the current import. It doesn't once Customized mode has been used for that import, so manual assignments are never lost.
  - Never lose or silently change a user's import.
- **Species matching uses scientific names** (see the README).
  - eBird's importer still fails on two of them, Rock Pigeon and Common Snipe (`MANUAL_MATCH_TAXA` in `src/lib/taxonomy.js`, [#38](https://github.com/Zoziologie/ornitho2ebird/issues/38)). The export page lists the species users have to match once on eBird.
  - The CSV gives distances in miles because eBird's format requires it. The app shows kilometres.
- **A one-off news banner for returning users** is set by `NEWS` in `App.vue`. Change `NEWS.id` for a new announcement.

## Help and links

- **The help is the modal in `src/components/HelpPanel.vue`.** Links open it with `#help` or `#help/<id>`, and `?lang=de#help` opens it in German.
- **The ids are public:** eBird's documentation and the FAQ link to them, so don't rename them.
  - Sections: `workflow`, `conversion`, `auto-assignment`, `customize`, `faq`.
  - FAQ questions: `duplicates`, `large-imports`, `not-for-ebird`, `species-matching`, `hotspots`, `processing`, `mistakes`, `rarities`, `distance`.
- **The FAQ is for pitfalls and unusual cases.** The normal workflow is described in the sections above it.
- **For a link inside a translated sentence, use `LinkedText`.** Each `[bracketed words]` in the message becomes a link to the next URL in `links`. URLs starting with `#` stay in the app; the others open in a new tab.

## Translations

- **Five locales:** `en` (source), `fr`, `de`, `it`, `ca`.
  - `test/unit/locales.test.js` checks that all of them have the same keys and the same `{placeholders}`.
  - Add every new key to all five files in the same change.
  - Write good translations yourself rather than copying the English.
- **Register:** German uses "du", French "vous", Italian and Catalan "tu".
- **Mode names:**
  - Basic mode: Mode basique, Basis-Modus, Modalità base, Mode bàsic.
  - Customized mode: Mode personnalisé, Benutzerdefinierter Modus, Modalità personalizzata, Mode personalitzat.
- **vue-i18n syntax:** `a | b` is a plural (call `t(key, named, count)`). The characters `{ } @ $ |` have meanings in messages, so escape them in plain text.
- **Remove keys you stop using** from all five files. Keys built in code (`protocolLabel${name}`, `faq${key}Question`/`Answer`) or stored as `labelKey` strings look unused to a plain search.

## Tests

Keep tests few and fast (all of them run in a few seconds). The layout will change ([#40](https://github.com/Zoziologie/ornitho2ebird/issues/40)), so test what users upload rather than the UI text: add an end-to-end test only for a flow that changes the CSV.

- **Golden files are the contract with eBird.** `test/golden/__snapshots__/*.csv` is the exact CSV for every fixture in `test/fixtures/`.
  - A diff there changes what users upload. Only update the snapshots (`npx vitest run -u`) when the change is intended, and say so in the pull request.
- **End-to-end tests (`test/e2e/`)** run the production build with `vite preview` on port 4179. `stubNetwork` stubs every external request: eBird, Nominatim, tiles, analytics.
  - The checklist editor's labels are not tied to their inputs, so `customized.spec.js` finds fields with a `field()` helper.
- **To try a fixture in the dev server** (`npm run dev`, port 5173) without a file dialog, run this in the page:
  ```js
  const file = new File(
    [await (await fetch("/test/fixtures/export_mixed_large.json")).blob()],
    "export_mixed_large.json",
  );
  const input = document.querySelector('input[type="file"]');
  const transfer = new DataTransfer();
  transfer.items.add(file);
  input.files = transfer.files;
  input.dispatchEvent(new Event("change", { bubbles: true }));
  ```
  Choose the matching source website first: ornitho.ch for the `export_*.json` fixtures. `export_mixed_large.json` gives 31 lists and 326 casual observations, grouped into 39 checklists with the default settings.

## Known rough edges

- `AdvancedPanel.vue` (~1,250 lines) holds the assignment tools, the checklist select and the checklist editor. The maps are in `AssignmentMap.vue` and `ReviewMap.vue`.
- `app.css` (~1,500 lines) is mostly component rules.
- Splitting both is planned in #40, after the UX decisions.
- Publishing interactive maps needs a GitHub token, so the tests don't cover it.

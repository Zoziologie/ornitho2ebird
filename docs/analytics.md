# Analytics

This app keeps GA4 property stream `G-TJ2TZSXSBW`. The Google tag is loaded only
following acceptance, including a saved choice less than 180 days old. Rejection
sends no analytics. A compact first-visit modal makes the choice visible before import, with equal-weight
“Allow usage statistics” and “No thanks” buttons. Escape declines; keyboard focus
stays in the dialog. The purpose is explained in plain language, with provider
details inside the expandable notice. Both choices remain available in
Settings and the footer. Storage failures do not block conversion.

Consent Mode v2 denies all advertising purposes. The app disables Google Signals
and ad personalisation, uses a fixed page URL/title and empty referrer, and sets
Analytics cookies to 180 days without extending them on each visit. Language and
functional settings remain separate. Withdrawal sets Google's disable flag before
updating consent and deleting `_ga` and this stream's cookie on the host and parent
domains. The loaded tag stays in memory but measurement is disabled. The page is
not reloaded, so the current import and manual assignments survive. Accepting again
re-enables measurement. No interactions before acceptance are replayed.

## Event contract

`src/lib/analytics.js` allowlists event names, fields and values. Extra fields are
removed; invalid allowed-field values reject the event. No record counts, species,
coordinates, dates, filenames, checklist IDs, names, comments, templates, tokens,
searches, raw errors or user URLs are included. Google still processes technical
connection/browser data; the translated notice links to Google's privacy policy.

| Event | Fields | Trigger |
| --- | --- | --- |
| `page_view` | Fixed page context | Once when the tag starts |
| `source_select` | `source_website` | User changes source, after confirming if needed |
| `import_start` | `source_website` | Actual file selected or dropped; not merely opening a picker |
| `import_file` | `source_website`, `outcome`, `import_profile`, `failure_reason` | Latest import succeeds or fails |
| `panel_view` | `panel` | Heading fully enters viewport once per mounted panel after consent |
| `export_state` | `readiness` | Export eligibility changes, or consent is granted |
| `workflow_link` | `destination` | Source export, eBird import or eBird status link clicked |
| `help_topic` | `section` | FAQ answer expanded, including a direct help link |
| `export_csv` | `mode`, `outcome`, `comment_mode`, `has_species_comments` | Download initiated, or map publishing blocks it |
| `publish_maps` | `outcome` | Interactive maps published, or publishing fails |
| `mode_change` | `mode` | Basic/customized mode changed |
| `language_change` | `language` | Interface language changed |
| `help_open` | `section` | Help opened through app controls or public hash links |
| `settings_open` | `settings_section` | Settings opened |
| `setting_change` | `setting_name`, `enabled` | Observer/grouping limits, individual standard comment options or map options changed |
| `map_layer_change` | `layer` | Saved basemap choice changed |
| `checklist_action` | `action`, optional `panel` | Checklist selection, observation review, editing, metadata calculation, map tools or assignment actions |

Every event also carries allowlisted `mode`, `language`, `source_website` and
`visitor_type` context. `visitor_type` is `new` or `returning` according to saved
functional settings at page load; it is not an identifier or GA's New/Returning
user classification. No extra identifier is generated. Source may be empty before
selection. Saved mode/source choices are represented without requiring a change.

`import_profile` distinguishes lists, casual observations, mixed and empty imports.
Parser failures use five public categories, never error text. `export_state` reports
`no_checklists`, `loading_taxonomy`, `invalid_checklists` or `ready`; it measures
state, not attempts to click a disabled button. `export_csv` with `blocked` records
an attempted download prevented by optional interactive-map publishing.

Standard comment options use `comment_short_<option>` and `comment_long_<option>`
setting names; `enabled` is only yes/no. Changes to numeric limits send the name,
not the number. Template edits and their contents are never sent. Map-tool starts
(`select_rectangle`, `draw_path`, `focus_map`) are separate from completed actions
(`assign`, `path`, `move`, `hotspot`); `panel` identifies assignment or checklist
review where explicitly instrumented. No map panning, coordinates or search text
are recorded.

Downloads measure the browser initiating a download, not a later eBird upload.
For successful downloads, `comment_mode` records the actual selected species-comment
configuration: `disabled`, `options` (the standard checkbox-based template, enabled
by default), or `personalized` (a typed template). `has_species_comments` is `yes`
when at least one exported species row has a nonempty comment, otherwise `no`.
Neither parameter contains comment or template text. These are attached to successful
download events, so unchanged saved settings are represented too.

Reports cover consenting visitors only, so compare pre-consent totals cautiously.
Golden CSV files are unchanged.

## Reading usage reports

In GA, filter to stream **ornitho2ebird** and use event counts for actions and
**Total users** for people. One person can import or export several times.

- Imports: `import_file`, `outcome = success`; use `failure` to see failed attempts.
- Downloads: `export_csv`, `outcome = success`.
- Basic versus Customized use: split successful downloads by `mode`.
- Species comments: split successful downloads by `comment_mode` and
  `has_species_comments`. The checkbox options are enabled by default, so a high
  `options` count does not mean people manually edited them.
- Feature interactions: `setting_change` by `setting_name`, `checklist_action` by
  `action`, and `help_open` by `section`.

The new usage events begin only after deployment; old page views do not provide
historical conversion counts. Custom dimensions may take time to appear in reports.

## Using the baseline to inform #40

Build an ordered, session-scoped funnel: `page_view` → `import_start` →
`import_file` (success) → `export_csv` (success). Use an open funnel for the source
export link, since people may already have a file and skip that link. Use session
segments for Basic/Customized, source, language and visitor type. Event counts
measure actions; Total users measures distinct consenting users. Multiple files
and repeat downloads are not independent people or reliable per-file conversion
rates. There is no file/checklist identifier to join individual attempts.

| Question / possible improvement | Evidence to inspect | Interpretation limit |
| --- | --- | --- |
| Is the source → app journey unclear? Add a progress indicator or clearer source instructions. | Source-export link users, import starts, success/failure by source and failure category | Visitors may fetch files elsewhere or return in a different session. |
| Is review buried in the long page? Collapse review into an optional step. | Assignment/checklist/export heading exposure, downloads by mode, checklist selections and observation review | Exposure is not reading. No export does not prove abandonment. |
| Does Basic mode need clearer grouping feedback? Put limits beside the summary. | Mixed/casual import segments, aggregation settings opens, grouping-limit changes, switches to Customized and assignment tools | These are signals of adjustment, not proof of confusion. |
| Do two maps earn their space? Simplify or combine map tools. | Rectangle starts in assignment; path/focus starts in review; completed assignments/path/hotspot/move actions | Tool starts can be cancelled; panning and map clicks alone are not collected. |
| Which missing metadata needs better prompts? | Compute date/time/duration, editing, invalid-checklist states and later successful downloads | Invalid state categories do not disclose which checklist field failed. |
| Are comments useful, or do defaults hide their purpose? Add a preview using the user's data. | Download comment mode/presence; individual short/long option changes and yes/no values | Default comments in a download do not prove deliberate use or satisfaction. |
| Are Settings and Help too hard to find? Use contextual controls and shorter help. | Settings section requests, changed options, FAQ expansions and targeted help opens | Header Settings opens have an empty section; FAQ expansion does not prove comprehension. |
| Is the handoff to eBird unclear? Keep next steps visible after download. | Next-steps heading exposure, eBird import/status link users among downloading sessions | Link clicks cannot confirm successful upload to eBird. |

Collect a baseline after deployment, then compare the same session segments and
consent design after a prototype. Keep #40's user feedback/testing alongside these
signals: observed paths suggest what to investigate, not why a person stopped.
No session recording, heatmaps, unload/abandonment beacons or pre-consent events
are used. Statistics cannot measure how many people rejected or ignored consent;
that choice remains local. A first-visit dialog also changes the sampled audience,
so do not interpret a before/after rise in events as increased feature use alone.

## Verified GA administrator setup

On 3 October 2026, the signed-in Chrome session was used to configure the
Ornitho2eBird stream in the shared **Zoziologie** property (`269867498`):

- Stream `14305240349`, measurement ID `G-TJ2TZSXSBW`, URL
  `https://ornitho2ebird.com/`: Enhanced measurement disabled and verified.
- Its Google tag (`GT-5D4XGMWZ`): user-provided data capabilities disabled, saved
  and reopened to verify. This tag has only the Ornitho2eBird destination.
- Created four event-scoped dimensions: **O2E source website** (`source_website`),
  **O2E interface language** (`language`), **O2E help section** (`section`), and
  **O2E checklist action** (`action`).
- Also registered **O2E comment mode** (`comment_mode`) and **O2E species comments
  included** (`has_species_comments`) for successful downloads.
- For the #40 baseline, also registered eight event-scoped dimensions:
  **O2E visitor type** (`visitor_type`), **O2E visible panel** (`panel`),
  **O2E workflow destination** (`destination`), **O2E settings section**
  (`settings_section`), **O2E export readiness** (`readiness`), **O2E import
  profile** (`import_profile`), **O2E import failure reason** (`failure_reason`),
  and **O2E option enabled** (`enabled`).
- Four parameters were already registered for Global Rare eBird. Reuse those
  property-wide definitions: **GRE outcome** (`outcome`), **GRE mode** (`mode`),
  **GRE map layer** (`layer`), and **GRE setting name** (`setting_name`). Their
  display names and definitions were preserved. Filter reports by the
  Ornitho2eBird stream to separate the tools.
- Retention verified: events **2 months**, user data **14 months**, **Reset on new
  user activity enabled**. These shared retention settings were preserved. The
  six-month cookie lifetime in this app does not change server retention.

Google Signals, advertising and account data-sharing settings are shared by all
nine streams. Google Signals is currently enabled at property level; this app
blocks it and advertising in code. Property-wide changes remain subject to the
owner's decision.

After deployment, verify rejection makes no Google requests and acceptance sends
only the intended stream's events in DebugView/Tag Assistant. The local browser
tests stub external requests; the PR has not been deployed.

This implements the analytics part of #10. The Content-Security-Policy remains a
separate follow-up; it needs testing across all external map providers and optional
GitHub/Mapbox integrations.

Reference: [Google's consent guide](https://developers.google.com/tag-platform/security/guides/consent)
and [GA4 configuration](https://developers.google.com/analytics/devguides/collection/ga4/reference/config).

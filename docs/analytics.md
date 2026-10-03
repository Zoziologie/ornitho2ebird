# Analytics

This app keeps GA4 property stream `G-TJ2TZSXSBW`. The Google tag is loaded only
following acceptance, including a saved choice less than 180 days old. Rejection
sends no analytics. Both choices have equal prominence and remain available in
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
| `import_file` | `source_website`, `outcome` | Latest import succeeds or fails |
| `export_csv` | `mode`, `outcome` | Download initiated, or map publishing blocks it |
| `publish_maps` | `outcome` | Interactive maps published, or publishing fails |
| `mode_change` | `mode` | Basic/customized mode changed |
| `language_change` | `language` | Interface language changed |
| `help_open` | `section` | Help opened through app controls or public hash links |
| `settings_open` | None | Settings opened |
| `setting_change` | `setting_name` | Observer/grouping limits, comments or map options changed |
| `map_layer_change` | `layer` | Saved basemap choice changed |
| `checklist_action` | `action` | Create/delete/assign/clean/reset/auto-assign/path/hotspot/move/edit tools used |

Downloads measure the browser initiating a download, not a later eBird upload.
Reports cover consenting visitors only, so compare pre-consent totals cautiously.
Golden CSV files are unchanged.

## GA administrator setup before deployment

These settings cannot be enforced entirely in the repository and have **not** been
changed by this PR:

- Disable Enhanced measurement for this app's stream, including automatic form,
  search, download and outbound-link events. Otherwise Google's automatic events
  can bypass the application's field allowlist.
- Disable user-provided data collection for this tag/stream. Review Google Signals,
  advertising and account data-sharing settings with the property owner, especially
  if the property is shared by other tools.
- Confirm and document event/user retention and its reset setting for this property.
  This app's six-month cookie lifetime does not change Google's server retention.
- Register event-scoped custom dimensions for `source_website`, `outcome`, `mode`,
  `language`, `section`, `setting_name`, `layer`, and `action`. Prefix display names
  with `O2E` if this property serves multiple apps; parameter names stay as above.
- Verify rejection makes no Google requests and acceptance sends only the intended
  stream's events in DebugView/Tag Assistant after the stream settings are applied.

This implements the analytics part of #10. The Content-Security-Policy remains a
separate follow-up; it needs testing across all external map providers and optional
GitHub/Mapbox integrations.

Reference: [Google's consent guide](https://developers.google.com/tag-platform/security/guides/consent)
and [GA4 configuration](https://developers.google.com/analytics/devguides/collection/ga4/reference/config).

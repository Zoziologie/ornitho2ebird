# Localization Workflow

## Files

- Source language: `src/locales/en.json`
- Translation files: `src/locales/fr.json`, `src/locales/ca.json`, `src/locales/de.json`, `src/locales/it.json`
- Crowdin config: `crowdin.yml`

## Rules

- Add and edit translation keys in `src/locales/en.json` first.
- Keep the same keys in all locale files.
- Use Crowdin for translation review instead of editing translated files manually when possible.
- Review translation updates through GitHub before merging.

## Recommended GitHub + Crowdin Flow

1. Update `src/locales/en.json` in a normal feature branch.
2. Merge that change to `main`.
3. Let Crowdin sync the new source strings from `main`.
4. Translators review strings in Crowdin.
5. Crowdin opens a PR, or pushes a branch, with updated locale JSON files.
6. Review that PR in GitHub and merge it.

## Local Checks

Run:

```bash
npm run build
```

before merging translation structure changes.
